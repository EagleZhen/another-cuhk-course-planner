import io
import json
import logging
import time
from datetime import UTC, datetime, timedelta
from itertools import chain, repeat
from pathlib import Path
from types import SimpleNamespace

import cuhk_scraper
import data_utils
import pytest
import requests
from bs4 import BeautifulSoup
from cuhk_scraper import (
    CaptchaNotAccepted,
    CatalogResponseError,
    CatalogSystemError,
    Course,
    CuhkScraper,
    ScrapingConfig,
    ScrapingProgressTracker,
    TermInfo,
)
from data_utils import SCHEMA_VERSION
from requests.exceptions import ChunkedEncodingError, HTTPError
from requests.exceptions import ConnectionError as RequestsConnectionError


def _course(code, term_names):
    return Course(
        subject="TEST",
        course_code=code,
        title=f"Course {code}",
        credits="3.00",
        terms=[TermInfo(term_code="x", term_name=tn, schedule=[]) for tn in term_names],
    )


@pytest.fixture
def scraper():
    return SimpleNamespace(
        subject_titles_cache={"TEST": "TEST - Test Subject"},
        logger=logging.getLogger("test"),
    )


def _save(scraper, courses, out_dir):
    cfg = SimpleNamespace(output_directory=str(out_dir))
    return CuhkScraper._save_subject_immediately(scraper, "TEST", courses, cfg)


def test_writes_one_file_per_year_plus_no_terms(scraper, tmp_path):
    _save(
        scraper,
        [_course("1000", ["2025-26 Term 1", "2026-27 Term 1"]), _course("9999", [])],
        tmp_path,
    )
    assert (tmp_path / "2025-26" / "TEST.json").exists()
    assert (tmp_path / "2026-27" / "TEST.json").exists()
    assert (tmp_path / "no-terms" / "TEST.json").exists()


def test_no_terms_file_removed_when_course_becomes_offered(scraper, tmp_path):
    # A previous scrape left the course dormant in no-terms; now it's offered and the
    # subject has no dormant courses, so the stale no-terms file must be dropped (else
    # the course is duplicated across a year dir and no-terms).
    (tmp_path / "no-terms").mkdir()
    (tmp_path / "no-terms" / "TEST.json").write_text('{"stale": true}')
    _save(scraper, [_course("1000", ["2025-26 Term 1"])], tmp_path)
    assert not (tmp_path / "no-terms" / "TEST.json").exists()
    assert (tmp_path / "2025-26" / "TEST.json").exists()


def test_empty_subject_writes_no_file_but_reports_success(scraper, tmp_path):
    result = _save(scraper, [], tmp_path)
    assert result == []  # not None, so the caller still marks it completed
    assert not any(tmp_path.iterdir())


def test_metadata_is_versioned_and_carries_no_timestamp(scraper, tmp_path):
    # A per-file timestamp would rewrite every subject file on every scrape.
    _save(scraper, [_course("1000", ["2025-26 Term 1"])], tmp_path)
    metadata = json.loads((tmp_path / "2025-26" / "TEST.json").read_text())["metadata"]
    assert metadata["schema_version"] == SCHEMA_VERSION
    assert "scraped_at" not in metadata


def _tracker(progress_file, run_subjects, config=None, mode="partial"):
    return ScrapingProgressTracker(
        str(progress_file),
        logging.getLogger("test"),
        run_subjects,
        config or ScrapingConfig(),
        mode,
    )


@pytest.fixture
def tracker(tmp_path):
    return _tracker(tmp_path / "progress.json", ["TEST"])


def _entry(tracker, subject):
    return tracker.progress_data["subjects"][subject]


def _read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _saved(tracker):
    return _read(tracker.progress_file)


# `latest_run` reports this run; `subjects` is the cumulative registry. Every test below
# is one way those two must not be confused.


def test_run_counters_cover_only_this_run(tmp_path):
    # Retrying one subject is the normal workflow, and its summary must describe the
    # retry rather than everything ever scraped.
    progress_file = tmp_path / "progress.json"
    first = _tracker(progress_file, ["AAAA", "BBBB", "CCCC"])
    for subject in ("AAAA", "BBBB", "CCCC"):
        first.complete_subject(subject, 1, [f"data/{subject}.json"])

    retry = _tracker(progress_file, ["BBBB"])
    retry.complete_subject("BBBB", 2, ["data/BBBB.json"])

    run = _saved(retry)["latest_run"]
    assert (run["subjects_total"], run["subjects_completed"]) == (1, 1)

    # The subjects it skipped are still on disk, so their entries survive untouched.
    registry = _saved(retry)["subjects"]
    assert sorted(registry) == ["AAAA", "BBBB", "CCCC"]
    assert registry["AAAA"]["courses_count"] == 1


def test_run_counters_split_completed_incomplete_and_failed(tmp_path):
    tracker = _tracker(tmp_path / "progress.json", ["AAAA", "BBBB", "CCCC", "DDDD"])
    tracker.complete_subject("AAAA", 1, ["data/AAAA.json"])
    tracker.complete_subject("BBBB", 1, ["data/BBBB.json"])
    tracker.complete_subject("CCCC", 1, ["data/CCCC.json"], unavailable=["course_outcome CCCC1000"])
    tracker.fail_subject("DDDD", "boom")

    run = _saved(tracker)["latest_run"]
    assert (run["subjects_completed"], run["subjects_incomplete"], run["subjects_failed"]) == (
        2,
        1,
        1,
    )
    assert tracker.get_failed_subjects() == ["DDDD"]
    assert tracker.run_summary().splitlines()[1:] == [
        "    1 incomplete: CCCC",
        "    1 failed: DDDD",
    ]


def test_run_counters_ignore_what_an_earlier_run_completed(tmp_path):
    # Mid-run the registry still reports last run's successes. Counting those would show
    # a run finished before it started work.
    progress_file = tmp_path / "progress.json"
    first = _tracker(progress_file, ["AAAA", "BBBB"])
    for subject in ("AAAA", "BBBB"):
        first.complete_subject(subject, 1, [f"data/{subject}.json"])

    second = _tracker(progress_file, ["AAAA", "BBBB"])
    second.start_subject("AAAA")

    run = _saved(second)["latest_run"]
    assert (run["subjects_total"], run["subjects_completed"]) == (2, 0)


def test_finish_run_is_what_marks_a_run_completed(tracker):
    # A killed run can never write its own ending, so "in_progress" has to survive
    # everything except finish_run().
    tracker.complete_subject("TEST", 1, ["data/TEST.json"])
    assert _saved(tracker)["latest_run"]["status"] == "in_progress"

    tracker.finish_run()
    assert _saved(tracker)["latest_run"]["status"] == "completed"


# `latest_full_scrape` is the middle block: one scrape of the whole catalog, which may
# span several runs. Every test below is one way it must not be confused with a run.


def test_a_full_run_starts_a_scrape_and_a_partial_run_leaves_it_alone(tmp_path):
    # A one-subject smoke run must not clobber the scrape a killed full run left behind.
    progress_file = tmp_path / "progress.json"
    full = _tracker(progress_file, ["AAAA", "BBBB"], mode="full")
    full.complete_subject("AAAA", 1, ["data/2026-27/AAAA.json"])
    started_at = _saved(full)["latest_full_scrape"]["started_at"]

    partial = _tracker(progress_file, ["AAAA"], mode="partial")
    partial.complete_subject("AAAA", 2, ["data/2025-26/AAAA.json"])

    scrape = _saved(partial)["latest_full_scrape"]
    assert scrape["started_at"] == started_at
    assert scrape["remaining"] == ["BBBB"]  # the partial run's subject is not its business
    assert scrape["directories"] == ["data/2026-27"]  # nor the year it wrote


def test_a_scrape_collects_every_directory_its_subjects_wrote(tmp_path):
    tracker = _tracker(tmp_path / "progress.json", ["AAAA", "BBBB"], mode="full")
    tracker.complete_subject("AAAA", 1, ["data/2026-27/AAAA.json", "data/no-terms/AAAA.json"])
    tracker.complete_subject("BBBB", 1, ["data/2026-27/BBBB.json"])

    assert _saved(tracker)["latest_full_scrape"]["directories"] == ["data/2026-27", "data/no-terms"]


def test_a_failed_subject_still_leaves_the_scrapes_to_do_list(tmp_path):
    # Attempted, not succeeded. A subject CUHK drops would otherwise sit there forever and
    # no scrape could finish; publishing is what blocks on the failure instead.
    tracker = _tracker(tmp_path / "progress.json", ["AAAA", "BBBB"], mode="full")
    tracker.fail_subject("AAAA", "boom")

    assert _saved(tracker)["latest_full_scrape"]["remaining"] == ["BBBB"]


def test_a_killed_scrape_leaves_behind_what_it_never_reached(tmp_path):
    # The whole point of the block: a run that dies mid-catalog says what is left.
    tracker = _tracker(tmp_path / "progress.json", ["AAAA", "BBBB", "CCCC"], mode="full")
    tracker.complete_subject("AAAA", 1, ["data/2026-27/AAAA.json"])

    assert _saved(tracker)["latest_full_scrape"]["remaining"] == ["BBBB", "CCCC"]


def test_a_scrape_that_reaches_every_subject_empties_its_to_do_list(tmp_path):
    # An empty `remaining` is the only thing that says a scrape finished, so nothing may
    # empty it but attempting the subjects.
    tracker = _tracker(tmp_path / "progress.json", ["AAAA", "BBBB"], mode="full")
    tracker.complete_subject("AAAA", 1, ["data/2026-27/AAAA.json"])
    tracker.fail_subject("BBBB", "boom")

    assert _saved(tracker)["latest_full_scrape"]["remaining"] == []


def _stamp(scraper, tmp_path, *, mode, courses=None):
    """Save one subject through a real tracker, then stamp what the scrape recorded."""
    scraper.progress_tracker = _tracker(tmp_path / "progress.json", ["TEST"], mode=mode)
    saved = _save(
        scraper,
        courses
        if courses is not None
        else [_course("1000", ["2025-26 Term 1"]), _course("9999", [])],
        tmp_path,
    )
    scraper.progress_tracker.complete_subject("TEST", len(saved), saved)
    CuhkScraper._write_scrape_times(scraper, mode)
    scrape = _saved(scraper.progress_tracker).get("latest_full_scrape")
    return scrape and scrape["started_at"]


def test_full_scrape_stamps_every_directory_it_wrote(scraper, tmp_path):
    # Including no-terms: stamping whatever the scrape wrote needs no special cases, and
    # the publisher only ever reads year dirs.
    started_at = _stamp(scraper, tmp_path, mode="full")

    assert (tmp_path / "2025-26" / "_scraped_at.txt").read_text() == f"{started_at}\n"
    assert (tmp_path / "no-terms" / "_scraped_at.txt").exists()


def test_partial_scrape_leaves_scrape_times_alone(scraper, tmp_path):
    # A few refreshed subjects can't speak for the rest of the directory.
    _stamp(scraper, tmp_path, mode="partial")

    assert not list(tmp_path.rglob("_scraped_at.txt"))


def test_dropped_year_keeps_its_scrape_time(scraper, tmp_path, monkeypatch):
    # Once CUHK stops serving a year, scrapes stop writing it while its files stay on
    # disk. Its stamp has to stay put rather than follow the years still produced.
    first_time = "2025-09-01T00:00:00+00:00"
    monkeypatch.setattr(cuhk_scraper, "utc_now_iso", lambda: first_time)
    first = _stamp(scraper, tmp_path, mode="full", courses=[_course("1000", ["2025-26 Term 1"])])
    assert first == first_time

    second_time = "2026-09-01T00:00:00+00:00"
    monkeypatch.setattr(cuhk_scraper, "utc_now_iso", lambda: second_time)
    second = _stamp(scraper, tmp_path, mode="full", courses=[_course("1000", ["2026-27 Term 1"])])
    assert second == second_time

    assert (tmp_path / "2025-26" / "_scraped_at.txt").read_text() == f"{first}\n"
    assert (tmp_path / "2026-27" / "_scraped_at.txt").read_text() == f"{second}\n"


def _loop_scraper(tmp_path, *, failing=()):
    """A scraper whose network calls are stubbed, so the loop runs off the live site."""
    scraper = CuhkScraper.__new__(CuhkScraper)
    scraper.logger = logging.getLogger("test")
    scraper.config = ScrapingConfig(
        track_progress=True,
        output_directory=str(tmp_path / "data"),
        progress_file=str(tmp_path / "progress.json"),
    )
    scraper.progress_tracker = None
    scraper.get_subjects_with_titles_from_live_site = lambda: []
    scraper.scrape_subject = lambda subject: _boom() if subject in failing else []
    scraper._save_subject_immediately = lambda subject, courses, config: []
    return scraper


@pytest.mark.parametrize("stopped_at", ["AAAA", "BBBB"])
def test_an_unreadable_captcha_stops_the_run_where_resume_picks_up(tmp_path, stopped_at):
    subjects = ["AAAA", "BBBB", "CCCC"]

    def run(error, directory):
        scraped = []

        def scrape(subject):
            scraped.append(subject)
            if subject == stopped_at and error:
                raise error
            return []

        scraper = _loop_scraper(tmp_path / directory)
        scraper.scrape_subject = scrape
        CuhkScraper.scrape_all_subjects(scraper, subjects, mode="full")
        return scraped

    # Any other failure is the subject's own, so the run moves on.
    assert run(ConnectionError("network is down"), "other") == subjects

    # A finished scrape is on disk; the next one stops at the captcha, even on its
    # first subject, and --resume must find this scrape rather than the finished one.
    run(None, "captcha")
    with pytest.raises(CaptchaNotAccepted):
        run(CaptchaNotAccepted(stopped_at), "captcha")
    remaining = _read(tmp_path / "captcha" / "progress.json")["latest_full_scrape"]["remaining"]
    assert remaining == subjects[subjects.index(stopped_at) :]


def test_a_subject_saved_with_a_cusis_system_error_is_incomplete(tmp_path):
    # Kept per subject, so a resume or a one-subject re-scrape updates exactly its own.
    gap = _course("1000", [])
    gap.unavailable = ["show_sections TEST1000 2026-27 Term 2"]
    scraper = _loop_scraper(tmp_path)
    scraper.scrape_subject = lambda subject: [gap] if subject == "AAAA" else [_course("1000", [])]

    CuhkScraper.scrape_all_subjects(scraper, ["AAAA", "BBBB"])

    subjects = _read(tmp_path / "progress.json")["subjects"]
    assert subjects["AAAA"]["status"] == "incomplete"
    assert subjects["AAAA"]["unavailable"] == ["show_sections TEST1000 2026-27 Term 2"]
    # Unchanged shape, so entries never rewritten stay valid.
    assert subjects["BBBB"]["status"] == "completed"
    assert "unavailable" not in subjects["BBBB"]


def _hours_ago(hours):
    return (datetime.now(UTC) - timedelta(hours=hours)).isoformat()


def _interrupted(tmp_path, remaining, directories, started_at=None):
    """A progress file, and the directories on disk, a killed full scrape would leave."""
    started_at = started_at or _hours_ago(1)
    for directory in directories:
        (tmp_path / directory).mkdir(exist_ok=True)
    (tmp_path / "progress.json").write_text(
        json.dumps(
            {
                "latest_run": {"status": "in_progress"},
                "latest_full_scrape": {
                    "started_at": started_at,
                    "remaining": list(remaining),
                    "directories": [str(tmp_path / d) for d in directories],
                },
                "subjects": {},
            }
        ),
        encoding="utf-8",
    )
    return started_at


def test_resume_scrapes_only_what_the_scrape_never_reached(tmp_path):
    _interrupted(tmp_path, ["BBBB", "CCCC"], ["2026-27"])
    scraper = _loop_scraper(tmp_path)
    scraped = []
    scraper.scrape_subject = lambda subject: scraped.append(subject) or []

    CuhkScraper.scrape_all_subjects(scraper, [], mode="resume")

    assert scraped == ["BBBB", "CCCC"]
    assert _read(tmp_path / "progress.json")["latest_full_scrape"]["remaining"] == []


def test_resume_stamps_every_directory_the_scrape_wrote_with_its_start(tmp_path):
    # The one a careless resume gets wrong: it writes only 2026-27, so deriving the
    # directories from this run would leave no-terms stale.
    started_at = _interrupted(tmp_path, ["BBBB"], ["2026-27", "no-terms"])

    CuhkScraper.scrape_all_subjects(_loop_scraper(tmp_path), [], mode="resume")

    for directory in ("2026-27", "no-terms"):
        assert (tmp_path / directory / "_scraped_at.txt").read_text() == f"{started_at}\n"


@pytest.mark.parametrize(
    "remaining, reason",
    [(None, "no recorded scrape"), ([], "an already finished one")],
    ids=["nothing recorded", "already finished"],
)
def test_resume_refuses_rather_than_silently_scraping_everything(tmp_path, remaining, reason):
    if remaining is not None:
        _interrupted(tmp_path, remaining, ["2026-27"])
    scraper = _loop_scraper(tmp_path)

    with pytest.raises(cuhk_scraper.NothingToResume):
        CuhkScraper.scrape_all_subjects(scraper, [], mode="resume")


def _truncated(tmp_path):
    """The progress file a process killed mid-save used to leave."""
    _interrupted(tmp_path, ["BBBB"], ["2026-27"])
    progress_file = tmp_path / "progress.json"
    progress_file.write_text(progress_file.read_text()[:40], encoding="utf-8")
    return progress_file


def test_resume_says_the_log_is_unreadable_rather_than_reporting_no_scrape(tmp_path):
    # "No full scrape recorded" would send a ~9-hour rescrape after the very
    # interruption --resume exists to finish.
    progress_file = _truncated(tmp_path)
    scraper = _loop_scraper(tmp_path)

    with pytest.raises(data_utils.UnreadableProgressLog) as raised:
        CuhkScraper.scrape_all_subjects(scraper, [], mode="resume")

    assert str(progress_file) in str(raised.value)


def test_an_unreadable_log_does_not_start_a_run_with_an_empty_registry(tmp_path):
    # Silently emptying it would drop what is on disk, and un-gate publishing with it.
    progress_file = _truncated(tmp_path)

    with pytest.raises(data_utils.UnreadableProgressLog):
        _tracker(progress_file, ["AAAA"], mode="full")


@pytest.mark.parametrize("hours, warns", [(23, False), (25, True)], ids=["last night", "older"])
def test_resume_warns_about_a_scrape_older_than_a_nightly_cycle(tmp_path, caplog, hours, warns):
    # Both sides finish the scrape — the age only changes whether it says something first.
    _interrupted(tmp_path, ["BBBB"], ["2026-27"], started_at=_hours_ago(hours))
    scraper = _loop_scraper(tmp_path)
    scraped = []
    scraper.scrape_subject = lambda subject: scraped.append(subject) or []

    with caplog.at_level(logging.WARNING):
        CuhkScraper.scrape_all_subjects(scraper, [], mode="resume")

    assert scraped == ["BBBB"]
    assert any("nightly cycle" in record.message for record in caplog.records) == warns


def test_a_full_run_without_progress_tracking_refuses_to_start(tmp_path):
    # A stamp needs the scrape's start time and directories, and both live in that file.
    scraper = _loop_scraper(tmp_path)
    scraper.config.track_progress = False

    with pytest.raises(ValueError, match="track_progress"):
        CuhkScraper.scrape_all_subjects(scraper, ["AAAA"], mode="full")


def test_a_run_reports_what_its_loop_actually_did(tmp_path):
    # The only cover for the wiring in scrape_all_subjects: the tracker's arguments and
    # the finish_run() that ends the run.
    scraper = _loop_scraper(tmp_path, failing=("BBBB",))

    CuhkScraper.scrape_all_subjects(scraper, ["AAAA", "BBBB"])

    run = json.loads((tmp_path / "progress.json").read_text(encoding="utf-8"))["latest_run"]
    assert run["subjects_total"] == 2
    assert (run["subjects_completed"], run["subjects_failed"]) == (1, 1)
    assert run["status"] == "completed"


def test_run_config_is_recorded_once_for_the_run(tmp_path):
    # Identical in all 271 entries, because it is a fact about the run: what the numbers
    # were produced under, not something that varies per subject.
    tracker = _tracker(
        tmp_path / "progress.json", ["AAAA"], ScrapingConfig(max_courses_per_subject=5)
    )
    tracker.complete_subject("AAAA", 1, ["data/AAAA.json"])

    saved = _saved(tracker)
    assert saved["latest_run"]["config"]["max_courses"] == 5
    assert "config" not in saved["subjects"]["AAAA"]


def test_the_run_records_which_mode_it_ran_in(tmp_path):
    # subjects_total cannot tell them apart: a partial run may name every subject.
    tracker = _tracker(tmp_path / "progress.json", ["AAAA"], mode="full")
    tracker.complete_subject("AAAA", 1, ["data/2026-27/AAAA.json"])

    assert _saved(tracker)["latest_run"]["mode"] == "full"


def test_registry_stays_sorted_as_subjects_are_added(tmp_path):
    # Key order otherwise records scrape history: a subject CUHK adds later lands at the
    # end and stays there, so the file drifts out of order one addition at a time.
    tracker = _tracker(tmp_path / "progress.json", ["MATH", "AAAA"])
    tracker.complete_subject("MATH", 1, ["data/MATH.json"])
    tracker.complete_subject("AAAA", 1, ["data/AAAA.json"])

    saved = _saved(tracker)
    assert list(saved["subjects"]) == ["AAAA", "MATH"]

    # The other half: sorting recursively would alphabetize the run block, whose field
    # order is authored for a reader.
    assert list(saved["latest_run"])[:3] == ["started_at", "last_updated", "duration"]


def test_the_run_ends_on_one_line_holding_its_tally(tmp_path, caplog):
    # A 7-hour background run needs its tally in logs/scrape/, and the marker and the
    # counts come from different objects.
    scraper = _loop_scraper(tmp_path, failing=("BBBB",))

    with caplog.at_level(logging.INFO):
        CuhkScraper.scrape_all_subjects(scraper, ["AAAA", "BBBB"], mode="full")

    closing = [message for message in caplog.messages if "Scrape finished" in message]
    assert len(closing) == 1
    assert "1 of 2 subjects" in closing[0]
    assert closing[0].endswith("1 failed: BBBB")


# Each case below is one distinction: did this come back empty because it is empty, or
# because something broke?

# Every real catalog page carries this, and the scraper rejects a page without it.
FORM_STATE = '<input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="state"/>'
DETAIL_HTML = f'{FORM_STATE}<span id="uc_course_lbl_course">TEST 1000 - Course 1000</span>'
TERM_OPTIONS = {"2390": "2025-26 Term 2", "2410": "2026-27 Term 1"}


def _term_page(selected):
    options = "".join(
        f'<option value="{code}"{' selected="selected"' if code == selected else ""}>{name}</option>'
        for code, name in TERM_OPTIONS.items()
    )
    return f'{DETAIL_HTML}<select id="uc_course_ddl_class_term">{options}</select>'


def _boom(*args, **kwargs):
    raise ConnectionError("network is down")


def _live_scraper(*, save_debug_html=False, **overrides):
    """A CuhkScraper with no __init__ — the real one loads OCR models and opens log files.

    Debug saving is stubbed unless a test asks for it, and then it must point
    `error_pages_dir` (failure pages) or `debug_html_directory` (debug mode) into a tmp_path.
    """
    scraper = CuhkScraper.__new__(CuhkScraper)
    scraper.logger = logging.getLogger("test")
    scraper.base_url = "http://test.invalid"
    scraper.config = ScrapingConfig(get_course_outcome=False, get_enrollment_details=False)
    if not save_debug_html:
        scraper._save_debug_html = lambda *a, **k: None
    scraper.current_subject = None
    scraper.current_course_code = None
    scraper._robust_request = _boom
    for name, value in overrides.items():
        setattr(scraper, name, value)
    return scraper


def test_broken_term_retries_while_an_empty_term_is_kept(monkeypatch):
    monkeypatch.setattr(time, "sleep", lambda _: None)

    # Switching to the unselected term needs a request; failing it re-scrapes the course
    # rather than losing a term.
    with pytest.raises(ConnectionError):
        CuhkScraper._get_course_details_with_term_selection(
            _live_scraper(), _term_page(selected="2390"), _course("1000", [])
        )

    # A page with no sections is a real empty term and still gets a TermInfo. Dropping the
    # unselected option leaves nothing that needs a request.
    page = _term_page(selected="2390").replace('<option value="2410">2026-27 Term 1</option>', "")
    course = CuhkScraper._get_course_details_with_term_selection(
        _live_scraper(), page, _course("1000", [])
    )
    assert [(t.term_name, t.schedule) for t in course.terms] == [("2025-26 Term 2", [])]


SECTION_TABLE = (
    '<table id="uc_course_gv_sched"><tr class="normalGridViewRowStyle">'
    "<td><a href=\"javascript:__doPostBack('uc_course$gv_sched$ctl02$lkbtn','')\">"
    "-- LEC (1234)</a></td><td>Mo 10:30</td></tr></table>"
)


def test_broken_section_retries_while_a_term_without_sections_stays_empty():
    with pytest.raises(ConnectionError):
        CuhkScraper._parse_schedule_with_enrollment_details(_live_scraper(), SECTION_TABLE)

    # No schedule table is a term nobody is teaching, and needs no request to say so.
    assert CuhkScraper._parse_schedule_with_enrollment_details(_live_scraper(), DETAIL_HTML) == (
        [],
        set(),
    )


def _row(code, *, title=True):
    title_link = f'<a id="gv_detail_ctl02_lbtn_course_title">Course {code}</a>' if title else ""
    return (
        '<tr class="normalGridViewRowStyle">'
        f'<td><a id="gv_detail_ctl02_lbtn_course_nbr" '
        f"href=\"javascript:__doPostBack('gv_detail$ctl02$lbtn_course_nbr','')\">{code}</a></td>"
        f"<td>{title_link}</td></tr>"
    )


def _list_page(body):
    return f'<table id="gv_detail"><tr class="normalGridViewHeaderStyle"><td>Course Nbr</td></tr>{body}</table>'


NO_RECORDS_PAGE = _list_page(
    '<tr class="normalGridViewEmptyDataRowStyle"><td>No record found</td></tr>'
)


@pytest.mark.parametrize(
    "page",
    [
        pytest.param(DETAIL_HTML, id="table missing"),
        pytest.param(_list_page(_row("1000") + _row("2000", title=False)), id="row lost"),
    ],
)
def test_course_list_shortfall_is_reported(page):
    # A row that fails to parse leaves no course to name or re-fetch, so the gap between
    # what the page offered and what we produced is the only thing there is to report.
    with pytest.raises(ValueError):
        CuhkScraper._parse_course_list(_live_scraper(), page)

    assert len(CuhkScraper._parse_course_list(_live_scraper(), _list_page(_row("1000")))) == 1
    assert CuhkScraper._parse_course_list(_live_scraper(), NO_RECORDS_PAGE) == []


MAX_SUBJECT_ATTEMPTS = 2  # enough to exhaust the loop quickly; production uses 10
MAX_CAPTCHA_ATTEMPTS = 3
SEARCH_FORM = (
    f'{FORM_STATE}<img id="imgCaptcha" src="BuildCaptcha.aspx"/><input name="txt_captcha"/>'
)
REJECTED = f'{SEARCH_FORM}<span id="lbl_error" class="errorLabel">Invalid Verification Code</span>'


def _subject_scraper(
    *pages, reads=("G6J1",), max_subject_attempts=MAX_SUBJECT_ATTEMPTS, form=SEARCH_FORM
):
    """A scraper whose OCR gives `reads` and whose searches get `pages`, both in order with
    the last repeating, on `form`. `scraper.sent` collects the codes it submitted."""
    scraper = _live_scraper(
        config=ScrapingConfig(
            max_subject_attempts=max_subject_attempts,
            max_captcha_attempts=MAX_CAPTCHA_ATTEMPTS,
            get_details=False,
        ),
        progress_tracker=None,
        sent=[],
    )
    reads = chain(reads, repeat(reads[-1]))
    pages = chain(pages, repeat(pages[-1]))
    scraper.ocr = SimpleNamespace(classification=lambda image: next(reads))

    def request(method, url, data=None):
        if url.endswith("BuildCaptcha.aspx"):
            return SimpleNamespace(content=b"image")
        if method == "GET":
            return SimpleNamespace(text=form)
        scraper.sent.append(data["txt_captcha"])
        return SimpleNamespace(text=FORM_STATE + next(pages))

    scraper._robust_request = request
    return scraper


def test_an_impossible_read_is_never_sent():
    reads = ("I5BN", "H8;4", "G6J1")
    scraper = _subject_scraper(NO_RECORDS_PAGE, reads=reads, max_subject_attempts=1)
    assert CuhkScraper.scrape_subject(scraper, "TEST") == []
    assert scraper.sent == ["G6J1"]

    # Unreadable reads still spend the captcha budget, so OCR that never reads stops.
    scraper = _subject_scraper(NO_RECORDS_PAGE, reads=("I5BN",))
    read, tries = scraper.ocr.classification, []
    scraper.ocr.classification = lambda image: tries.append(image) or read(image)
    with pytest.raises(CaptchaNotAccepted):
        CuhkScraper.scrape_subject(scraper, "TEST")
    assert len(tries) == MAX_CAPTCHA_ATTEMPTS
    assert scraper.sent == []


def test_a_search_form_without_a_captcha_is_a_subject_failure(monkeypatch, caplog):
    # A form we don't recognize is not an OCR miss: it says what broke, sends nothing,
    # and retries the subject on a new session.
    monkeypatch.setattr(time, "sleep", lambda _: None)
    scraper = _subject_scraper(NO_RECORDS_PAGE, form=f'{FORM_STATE}<input name="txt_captcha"/>')

    with caplog.at_level(logging.INFO), pytest.raises(RuntimeError, match="no usable results"):
        CuhkScraper.scrape_subject(scraper, "TEST")
    assert scraper.sent == []
    errors = [r.message for r in caplog.records if r.levelno == logging.ERROR]
    assert len(errors) == MAX_SUBJECT_ATTEMPTS
    assert all("imgCaptcha" in message for message in errors)


def test_captcha_misses_use_their_own_budget():
    # One miss short of the limit, the subject still completes on its first attempt.
    misses = [REJECTED] * (MAX_CAPTCHA_ATTEMPTS - 1)
    scraper = _subject_scraper(*misses, NO_RECORDS_PAGE, max_subject_attempts=1)
    assert CuhkScraper.scrape_subject(scraper, "TEST") == []

    # At the limit the subject fails at once: returning [] would read as "no courses", and
    # restarting the subject would only repeat the misses.
    scraper = _subject_scraper(REJECTED)
    with pytest.raises(CaptchaNotAccepted):
        CuhkScraper.scrape_subject(scraper, "TEST")
    assert len(scraper.sent) == MAX_CAPTCHA_ATTEMPTS


def test_a_captcha_result_carries_only_what_cuhk_said(caplog):
    # CUHK sending the search form back says nothing beyond the classification itself.
    validate = CuhkScraper._validate_captcha_response
    assert validate(_live_scraper(), SEARCH_FORM)["error_message"] is None
    assert validate(_live_scraper(), REJECTED)["error_message"] == "Invalid Verification Code"

    # So the rejection line ends at the classification rather than trailing a "None".
    with caplog.at_level(logging.INFO), pytest.raises(CaptchaNotAccepted):
        CuhkScraper.scrape_subject(_subject_scraper(SEARCH_FORM), "TEST")
    rejection = next(m for m in caplog.messages if m.startswith("Captcha rejected"))
    assert rejection.endswith("captcha_failed_form_redisplayed")


@pytest.mark.parametrize(
    "page, said",
    [
        (
            '<span id="lbl_error" class="errorLabel">Service unavailable</span>',
            "Service unavailable",
        ),
        ("<p>Something new</p>", "unknown_error"),
        (_list_page(""), "empty_unclear"),
    ],
    ids=["unknown message", "no table, no form", "empty table"],
)
def test_an_unrecognized_search_page_is_kept_and_fails_the_subject(
    monkeypatch, caplog, tmp_path, page, said
):
    # Not a wrong code: CUHK sent something new, so it retries the subject, not the
    # captcha. Production keeps no debug pages, so the saved page is the only record.
    monkeypatch.setattr(time, "sleep", lambda _: None)
    scraper = _subject_scraper(page)
    del scraper._save_debug_html  # save for real, as production does
    scraper.config.save_debug_files = False
    scraper.error_pages_dir = str(tmp_path)
    scraper._new_session = lambda: None

    with caplog.at_level(logging.INFO), pytest.raises(RuntimeError, match="no usable results"):
        CuhkScraper.scrape_subject(scraper, "TEST")
    assert len(scraper.sent) == MAX_SUBJECT_ATTEMPTS
    errors = [r.message for r in caplog.records if r.levelno == logging.ERROR]
    assert len(errors) == MAX_SUBJECT_ATTEMPTS
    assert all(said in message for message in errors)
    assert [p.name for p in tmp_path.iterdir()] == ["course_list_TEST_INVALID.html"]


@pytest.mark.parametrize(
    "read, sent",
    [
        # Real OCR reads from scrape logs.
        ("I5BN", None),
        ("LV50", None),
        ("H8;4", None),
        ("KWP", None),
        ("G6J1", "G6J1"),
        ("cxrh", "CXRH"),
    ],
)
def test_only_a_possible_captcha_code_is_sent(read, sent):
    scraper = _live_scraper(ocr=SimpleNamespace(classification=lambda image: read))
    assert CuhkScraper._solve_captcha(scraper, b"image") == sent


def test_a_course_that_never_parses_gives_up_instead_of_looping(monkeypatch):
    # Retrying forever would strand every subject queued behind this one. Giving up fails
    # the subject, which blocks publishing and names it.
    monkeypatch.setattr(time, "sleep", lambda _: None)
    scraper = _live_scraper(_robust_request=lambda *a, **k: SimpleNamespace(text="<html></html>"))
    course = _course("1000", [])
    course.postback_target = "target"

    with pytest.raises(ValueError):
        CuhkScraper.get_course_details(scraper, course, DETAIL_HTML)


@pytest.mark.parametrize(
    "debug_mode, folder",
    [(True, "debug_html"), (False, "error_pages")],
    ids=["debug mode keeps every page", "a normal run keeps a failure in its own folder"],
)
def test_a_saved_page_goes_where_its_reason_for_saving_says(tmp_path, debug_mode, folder):
    config = ScrapingConfig(
        save_debug_files=debug_mode, debug_html_directory=str(tmp_path / "debug_html")
    )
    scraper = _live_scraper(
        save_debug_html=True, config=config, error_pages_dir=str(tmp_path / "error_pages")
    )

    CuhkScraper._save_debug_html(scraper, "<html></html>", "page_FAILED.html", force_save=True)

    assert [p.relative_to(tmp_path).as_posix() for p in tmp_path.rglob("*.html")] == [
        f"{folder}/page_FAILED.html"
    ]


def _production_like(tmp_path, **overrides):
    return ScrapingConfig(
        save_debug_files=False,  # as production: nothing saved unless it failed
        save_debug_on_error=True,
        max_course_attempts=2,
        get_course_outcome=False,
        get_enrollment_details=False,
        **overrides,
    )


def _failing_scraper(tmp_path, page):
    scraper = _live_scraper(
        save_debug_html=True,
        config=_production_like(tmp_path),
        error_pages_dir=str(tmp_path),
        _robust_request=lambda *a, **k: SimpleNamespace(text=page),
    )
    course = _course("1000", [])
    course.postback_target = "target"
    # As inside get_course_details, which names the pages it keeps after this scope.
    scraper.current_subject, scraper.current_course_code = course.subject, course.course_code
    return scraper, course


def test_a_course_that_fails_for_good_keeps_the_page_that_failed(monkeypatch, tmp_path):
    # Production saves no debug HTML, so this page is the only record of what CUHK served —
    # and the failure blocks the publish until someone reads it.
    monkeypatch.setattr(time, "sleep", lambda _: None)
    scraper, course = _failing_scraper(tmp_path, f"<html>{FORM_STATE}</html>")

    with pytest.raises(ValueError):
        CuhkScraper.get_course_details(scraper, course, DETAIL_HTML)

    assert (tmp_path / "course_details_TEST_1000_FAILED.html").read_text() == (
        f"<html>{FORM_STATE}</html>"
    )


def test_a_course_that_succeeds_keeps_nothing(tmp_path):
    # The other side of the rule: a normal production scrape must not write a file per course.
    scraper, course = _failing_scraper(tmp_path, DETAIL_HTML)

    assert CuhkScraper.get_course_details(scraper, course, DETAIL_HTML).course_code == "1000"
    assert list(tmp_path.iterdir()) == []


def test_a_course_whose_request_never_returned_keeps_nothing(monkeypatch, tmp_path):
    # A 4xx escalates out of _robust_request with no response — a stale session, mid-scrape.
    # There is no page to keep, and reaching for one would raise while handling the failure.
    monkeypatch.setattr(time, "sleep", lambda _: None)
    scraper, course = _failing_scraper(tmp_path, "")

    def _stale_session(*args, **kwargs):
        raise HTTPError("403 Forbidden")

    scraper._robust_request = _stale_session

    with pytest.raises(HTTPError):
        CuhkScraper.get_course_details(scraper, course, DETAIL_HTML)

    assert list(tmp_path.iterdir()) == []


OUTCOME_BUTTON_HTML = '<input id="btn_course_outcome" name="btn_course_outcome" type="submit"/>'
SYSTEM_ERROR_PAGE = "<html><title>System error</title></html>"


def test_a_course_keeps_the_last_page_served_not_the_last_attempt(monkeypatch, tmp_path):
    # Resetting `response` per attempt would save nothing here.
    monkeypatch.setattr(time, "sleep", lambda _: None)
    scraper, course = _failing_scraper(tmp_path, "")
    served = [f"<html>{FORM_STATE}served once</html>"]

    def _one_page_then_a_stale_session(*args, **kwargs):
        if served:
            return SimpleNamespace(text=served.pop())
        raise HTTPError("403 Forbidden")

    scraper._robust_request = _one_page_then_a_stale_session

    with pytest.raises(HTTPError):
        CuhkScraper.get_course_details(scraper, course, DETAIL_HTML)

    failed = tmp_path / "course_details_TEST_1000_FAILED.html"
    assert failed.read_text() == f"<html>{FORM_STATE}served once</html>"


# Not a system error - fails validation on the title check instead.
WRONG_PAGE = f'<html>{FORM_STATE}<div class="titleNormal">Course Catalog</div></html>'


def test_an_invalid_outcome_page_is_kept(tmp_path):
    # Otherwise a course that gives up here leaves only the healthy-looking details page.
    scraper, course = _failing_scraper(tmp_path, WRONG_PAGE)

    with pytest.raises(ValueError, match="Invalid course outcome page"):
        CuhkScraper._scrape_course_outcome(scraper, OUTCOME_BUTTON_HTML, course)

    kept = tmp_path / "course_outcome_TEST_1000_INVALID.html"
    assert kept.read_text() == WRONG_PAGE


def test_a_valid_outcome_page_keeps_nothing(tmp_path):
    # The other side: no file per course that parsed fine.
    valid = (
        f'<html>{FORM_STATE}<div class="titleNormal">Course Outcome</div>'
        '<td class="reverseHeaderStyle">Learning Outcome</td></html>'
    )
    scraper, course = _failing_scraper(tmp_path, valid)

    CuhkScraper._scrape_course_outcome(scraper, OUTCOME_BUTTON_HTML, course)

    assert list(tmp_path.iterdir()) == []


def test_a_course_that_parses_on_a_later_attempt_still_succeeds(monkeypatch):
    # The cap must only stop failures that never resolve. Transient corruption clears on
    # a re-fetch, and that course still has to come back rather than failing the subject.
    monkeypatch.setattr(time, "sleep", lambda _: None)
    pages = ["<html></html>", "<html></html>", DETAIL_HTML]
    scraper = _live_scraper(_robust_request=lambda *a, **k: SimpleNamespace(text=pages.pop(0)))
    course = _course("1000", [])
    course.postback_target = "target"

    assert CuhkScraper.get_course_details(scraper, course, DETAIL_HTML).course_code == "1000"
    assert pages == []  # took all three attempts


def test_missing_titles_abort_the_run_rather_than_blanking_every_subject_title():
    # An empty title list is not "no titles" — it would blank every subject title, and the
    # scrape would look successful.
    empty = f'{FORM_STATE}<select name="ddl_subject"><option value="">Select a subject</option></select>'
    for page in (DETAIL_HTML, empty):
        with pytest.raises(ValueError):
            CuhkScraper.get_subjects_with_titles_from_live_site(
                _live_scraper(_robust_request=lambda *a, **k: SimpleNamespace(text=page))
            )

    page = f'{FORM_STATE}<select name="ddl_subject"><option value="TEST">TEST - Test Subject</option></select>'
    assert CuhkScraper.get_subjects_with_titles_from_live_site(
        _live_scraper(_robust_request=lambda *a, **k: SimpleNamespace(text=page))
    ) == [{"code": "TEST", "title": "TEST - Test Subject"}]

    # The code-only fetch delegates here, so it aborts on the same pages.
    assert CuhkScraper.get_subjects_from_live_site(
        _live_scraper(_robust_request=lambda *a, **k: SimpleNamespace(text=page))
    ) == ["TEST"]
    with pytest.raises(ValueError):
        CuhkScraper.get_subjects_from_live_site(
            _live_scraper(_robust_request=lambda *a, **k: SimpleNamespace(text=empty))
        )


def test_the_subject_catalog_is_fetched_once_per_run():
    # The runner asks for the codes and the scrape asks for the titles, off one page.
    page = f'{FORM_STATE}<select name="ddl_subject"><option value="TEST">TEST - Test Subject</option></select>'
    requests = []

    def request(*args, **kwargs):
        requests.append(args)
        return SimpleNamespace(text=page)

    scraper = _live_scraper(_robust_request=request)
    assert CuhkScraper.get_subjects_from_live_site(scraper) == ["TEST"]
    assert CuhkScraper.get_subjects_with_titles_from_live_site(scraper) == [
        {"code": "TEST", "title": "TEST - Test Subject"}
    ]
    assert len(requests) == 1
    assert scraper.subject_titles_cache == {"TEST": "TEST - Test Subject"}


REQUEST_DELAY = 0.5


def _fake_clock(monkeypatch):
    """Time only moves when a stub sleeps or answers, so pacing is measured, not waited out."""
    clock = SimpleNamespace(now=0.0, sleeps=[])

    def sleep(seconds):
        clock.sleeps.append(seconds)
        clock.now += seconds

    monkeypatch.setattr(time, "monotonic", lambda: clock.now)
    monkeypatch.setattr(time, "sleep", sleep)
    return clock


RETRY_BUDGET = 3  # not production's 6: these tests pin the mechanism, not the tuning


def _paced_scraper(get, delay=REQUEST_DELAY):
    return _live_scraper(
        config=ScrapingConfig(request_delay=delay, max_request_attempts=RETRY_BUDGET),
        session=SimpleNamespace(get=get),
        _request_timeout=(10, 30),
    )


def _ok(content=b""):
    return SimpleNamespace(raise_for_status=lambda: None, content=content, headers={})


def _answering(answers):
    """Serves `answers` in order: an exception is raised, anything else returned."""

    def get(*args, **kwargs):
        answer = answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer

    return get


def _responder(clock, takes=0.0):
    def get(*args, **kwargs):
        clock.now += takes
        return _ok()

    return get


def test_requests_are_paced_and_the_first_one_is_not_delayed(monkeypatch):
    # request_delay is the entire rate limit — nothing else spaces requests out.
    clock = _fake_clock(monkeypatch)
    scraper = _paced_scraper(_responder(clock))

    CuhkScraper._robust_request(scraper, "GET", "http://test.invalid")
    CuhkScraper._robust_request(scraper, "GET", "http://test.invalid")

    assert clock.sleeps == [REQUEST_DELAY]


def test_time_spent_on_a_request_counts_toward_the_interval(monkeypatch):
    # Sleeping a flat request_delay instead would stack on the round-trip, roughly doubling
    # a full run.
    clock = _fake_clock(monkeypatch)
    scraper = _paced_scraper(_responder(clock, takes=0.4))

    CuhkScraper._robust_request(scraper, "GET", "http://test.invalid")
    CuhkScraper._robust_request(scraper, "GET", "http://test.invalid")

    assert clock.sleeps == [pytest.approx(REQUEST_DELAY - 0.4)]

    # A response slower than the interval leaves nothing to wait for.
    clock.sleeps.clear()
    scraper = _paced_scraper(_responder(clock, takes=REQUEST_DELAY + 0.1))

    CuhkScraper._robust_request(scraper, "GET", "http://test.invalid")
    CuhkScraper._robust_request(scraper, "GET", "http://test.invalid")

    assert clock.sleeps == []


def test_a_retry_waits_its_turn_like_any_other_request(monkeypatch):
    # Pacing lives inside the retry loop. The interval here exceeds the 1 s first backoff,
    # which would otherwise cover the wait and hide a limiter that skips retries.
    clock = _fake_clock(monkeypatch)
    answers = [RequestsConnectionError("network is down"), _ok()]

    CuhkScraper._robust_request(
        _paced_scraper(_answering(answers), delay=3.0), "GET", "http://test.invalid"
    )

    assert clock.sleeps == [1.0, 2.0]  # backoff, then the rest of the interval
    assert answers == []


def test_a_body_that_dies_partway_is_retried_in_place(monkeypatch):
    # requests buffers the body inside get(), so a half-read response surfaces there.
    # One retryable request; escaping here would cost the whole course an attempt.
    _fake_clock(monkeypatch)
    whole = _ok(b"whole body")
    answers = [ChunkedEncodingError("connection broken mid-body"), whole]
    scraper = _paced_scraper(_answering(answers))

    assert CuhkScraper._robust_request(scraper, "GET", "http://test.invalid") is whole
    assert answers == []


@pytest.mark.parametrize(
    "content_type, charset",
    [("text/html", "utf-8"), ("text/html; charset=big5", "big5")],
    ids=["none named", "named"],
)
def test_a_page_is_read_as_utf8_unless_its_header_names_a_charset(
    monkeypatch, content_type, charset
):
    # CUSIS's system-error page names none, which requests would read as Latin-1.
    _fake_clock(monkeypatch)
    page = "<title>System error</title>系統有誤，請稍後再試。"
    response = requests.Response()
    response.status_code = 200
    response.headers["Content-Type"] = content_type
    response._content = page.encode(charset)
    # As requests sets it when building a response
    response.encoding = requests.utils.get_encoding_from_headers(response.headers)

    served = CuhkScraper._robust_request(_paced_scraper(lambda *a, **k: response), "GET", "x")

    assert served.text == page


def test_a_request_that_never_recovers_gives_up(monkeypatch):
    # The 2026-09-08 regression. The sentinel turns an unbounded loop into a failure
    # rather than a hung CI.
    _fake_clock(monkeypatch)
    calls = []

    def get(*args, **kwargs):
        calls.append(1)
        if len(calls) > 50:
            raise AssertionError("retried well past any sane budget")
        raise RequestsConnectionError("network is down")

    with pytest.raises(RequestsConnectionError):
        CuhkScraper._robust_request(_paced_scraper(get), "GET", "http://test.invalid")

    assert len(calls) == RETRY_BUDGET


def test_a_request_that_recovers_on_the_last_attempt_still_succeeds(monkeypatch):
    # The other side of the budget: one too tight would fail transients the old code rode out.
    _fake_clock(monkeypatch)
    whole = _ok()
    answers = [RequestsConnectionError("network is down")] * (RETRY_BUDGET - 1) + [whole]
    scraper = _paced_scraper(_answering(answers))

    assert CuhkScraper._robust_request(scraper, "GET", "http://test.invalid") is whole
    assert answers == []


def test_a_subject_retry_starts_on_a_fresh_session(monkeypatch):
    # Retrying on a poisoned session repeats an experiment that cannot succeed; a new one
    # drops the ASP.NET_SessionId and starts from a fresh captcha.
    monkeypatch.setattr(time, "sleep", lambda _: None)
    scraper = _live_scraper(
        config=ScrapingConfig(max_subject_attempts=3), session=CuhkScraper._new_session()
    )
    sessions, cookies_on_entry = [], []

    def wedged(*args, **kwargs):
        sessions.append(scraper.session)
        cookies_on_entry.append(dict(scraper.session.cookies))
        scraper.session.cookies.set("ASP.NET_SessionId", "poisoned")
        raise RequestsConnectionError("network is down")

    scraper._robust_request = wedged

    with pytest.raises(RuntimeError):
        CuhkScraper.scrape_subject(scraper, "TEST")

    assert len({id(s) for s in sessions}) == 3  # a new session per attempt, none reused
    assert cookies_on_entry == [{}, {}, {}]  # no attempt inherited the poisoned cookie
    # A bare requests.Session would announce itself as python-requests.
    assert sessions[-1].headers["User-Agent"].startswith("Mozilla/")


def test_unknown_subject_title_is_recorded_empty_not_as_the_code(tmp_path):
    # getSubjectTitle in the web app already falls back to the code at render time, and
    # an empty string is falsy there — so this renders identically without a guess
    # sitting in the committed data.
    scraper = SimpleNamespace(subject_titles_cache={}, logger=logging.getLogger("test"))
    _save(scraper, [_course("1000", ["2025-26 Term 1"])], tmp_path)

    metadata = json.loads((tmp_path / "2025-26" / "TEST.json").read_text())["metadata"]
    assert metadata["subject_title"] == ""


# --- Class availability, parsed from real catalog pages ---------------------------------

SAMPLE_PAGES = Path(__file__).resolve().parents[2] / "lab" / "scraper" / "samples" / "webpages"


def _bare_scraper(*, save_debug_html=False, **attributes):
    """A CuhkScraper with __init__ skipped: no session, no OCR model, real methods.

    Debug saving is stubbed unless a test asks for it, and then it must point
    `error_pages_dir` (failure pages) or `debug_html_directory` (debug mode) into a tmp_path.
    """
    scraper = CuhkScraper.__new__(CuhkScraper)
    scraper.logger = logging.getLogger("test")
    if not save_debug_html:
        scraper._save_debug_html = lambda *a, **k: None
    scraper.current_subject = None
    scraper.current_course_code = None
    for name, value in attributes.items():
        setattr(scraper, name, value)
    return scraper


def _sample_html(page_name):
    return (SAMPLE_PAGES / page_name).read_text(encoding="utf-8")


# Saved fragments of a page rather than whole responses, and the error page itself.
NOT_CATALOG_RESPONSES = {
    "Course Outcome - Recommended Reading - List.html",
    "Course Syllabus - List + Table.html",
    "System error.html",
}


@pytest.mark.parametrize(
    "page_name",
    sorted(p.name for p in SAMPLE_PAGES.glob("*.html") if p.name not in NOT_CATALOG_RESPONSES),
)
def test_every_saved_catalog_page_passes_the_form_state_check(tmp_path, page_name):
    # Rejecting a real page would fail every scrape.
    page = _sample_html(page_name)
    scraper, _ = _failing_scraper(tmp_path, page)

    assert CuhkScraper._request_catalog_html(scraper, "POST", stage="course_list").text == page
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize(
    "stage, target, kept_as",
    [
        ("show_sections", "2026-27 Term 2", "show_sections_TEST1000_2026-27_Term_2_SYSTEM_ERROR"),
        ("class_details", "AZC1-CLW (9978)", "class_details_TEST1000_AZC1-CLW_9978_SYSTEM_ERROR"),
    ],
)
def test_the_system_error_page_is_named_and_kept(tmp_path, stage, target, kept_as):
    page = _sample_html("System error.html")
    scraper, _ = _failing_scraper(tmp_path, page)

    with pytest.raises(CatalogSystemError, match=f"system error at {stage} TEST1000"):
        CuhkScraper._request_catalog_html(scraper, "POST", stage=stage, target=target)

    assert (tmp_path / f"{kept_as}.html").read_text() == page


def test_an_unknown_page_without_form_state_is_rejected_but_not_as_a_system_error(tmp_path):
    # A session timeout or maintenance notice would otherwise parse as an empty result.
    page = "<html><title>Session expired</title></html>"
    scraper, _ = _failing_scraper(tmp_path, page)

    with pytest.raises(CatalogResponseError, match="at course_details TEST1000") as raised:
        CuhkScraper._request_catalog_html(scraper, "POST", stage="course_details")

    assert not isinstance(raised.value, CatalogSystemError)
    assert (tmp_path / "course_details_TEST1000_INVALID.html").read_text() == page


SHOW_SECTIONS = '<input id="uc_course_btn_class_section" type="submit" value="Show sections"/>'


def test_a_system_error_on_show_sections_is_not_saved_as_an_empty_term(tmp_path):
    scraper, course = _failing_scraper(tmp_path, _sample_html("System error.html"))

    with pytest.raises(CatalogSystemError):
        CuhkScraper._scrape_term_details(
            scraper, _term_page(selected="2410") + SHOW_SECTIONS, course, "2410", "2026-27 Term 1"
        )


# Requesting 2026-27 Term 1 (2410): a switch from another term, or Show sections on it.
TERM_POSTBACK_START = {
    "term_switch": _term_page(selected="2390"),
    "show_sections": _term_page(selected="2410") + SHOW_SECTIONS,
}


@pytest.mark.parametrize("stage", TERM_POSTBACK_START)
@pytest.mark.parametrize(
    "returned",
    [
        pytest.param(_term_page(selected="2390"), id="previous_term"),
        pytest.param(
            _term_page(selected="2410").replace("TEST 1000", "OTHR 1000"), id="other_course"
        ),
    ],
)
def test_a_term_page_for_another_term_or_course_is_rejected(tmp_path, stage, returned):
    # Otherwise its sections would be saved under the requested term.
    scraper, course = _failing_scraper(tmp_path, returned)

    with pytest.raises(CatalogResponseError):
        CuhkScraper._scrape_term_details(
            scraper, TERM_POSTBACK_START[stage], course, "2410", "2026-27 Term 1"
        )

    kept = tmp_path / f"{stage}_TEST1000_2026-27_Term_1_INVALID.html"
    assert kept.read_text() == returned


def test_a_detail_page_for_another_course_is_rejected(tmp_path):
    page = DETAIL_HTML.replace("TEST 1000", "OTHR 1000")
    scraper, course = _failing_scraper(tmp_path, page)

    with pytest.raises(CatalogResponseError, match="OTHR 1000"):
        CuhkScraper._get_course_details_with_term_selection(scraper, page, course)

    assert (tmp_path / "course_details_TEST1000_INVALID.html").read_text() == page


@pytest.mark.parametrize("bracketed", [False, True], ids=["plain", "bracketed"])
@pytest.mark.parametrize(
    "page_name", sorted(p.name for p in SAMPLE_PAGES.glob("Course Detail*.html"))
)
def test_every_saved_detail_page_shows_the_course_its_list_row_names(page_name, bracketed):
    # A future-dated course's list row brackets its number.
    subject, code = page_name.split(" - ")[1].split()
    course = _course(f"({code})" if bracketed else code, [])
    course.subject = subject
    html = _sample_html(page_name)

    CuhkScraper._check_course_page(
        _live_scraper(), BeautifulSoup(html, "html.parser"), html, course, stage="course_details"
    )


def _course_server(monkeypatch, replace):
    """CUSIS for one course with two terms, its outcome, and a switch to 2026-27 Term 1.

    `replace(stage, call)` may return a page to serve instead, for that numbered request.
    """
    monkeypatch.setattr(time, "sleep", lambda _: None)
    pages = {
        "course_details": _term_page(selected="2390") + OUTCOME_BUTTON_HTML,
        "course_outcome": _sample_html("Course Outcome - PHED 1370 - Archery.html"),
        "term_switch": _term_page(selected="2410"),
    }
    calls = dict.fromkeys(pages, 0)

    def request(method, url, *, data, **kwargs):
        if "btn_course_outcome" in data:
            stage = "course_outcome"
        elif data.get("__EVENTTARGET") == "uc_course$ddl_class_term":
            stage = "term_switch"
        else:
            stage = "course_details"
        calls[stage] += 1
        return SimpleNamespace(text=replace(stage, calls[stage]) or pages[stage])

    config = ScrapingConfig(
        max_course_attempts=3, get_course_outcome=True, get_enrollment_details=False
    )
    scraper = _live_scraper(config=config, _robust_request=request, current_subject="TEST")
    course = _course("1000", [])
    course.postback_target = "target"
    return CuhkScraper.get_course_details(scraper, course, DETAIL_HTML), calls


def _system_error_at(failing_stage, *, calls=range(1, 100)):
    error = _sample_html("System error.html")
    return lambda stage, call: error if stage == failing_stage and call in calls else None


def test_a_term_cusis_keeps_failing_is_kept_empty_and_recorded(monkeypatch):
    course, calls = _course_server(monkeypatch, _system_error_at("term_switch"))

    # Retried on its own, without redoing the rest of the course.
    assert calls == {"course_details": 1, "course_outcome": 1, "term_switch": 3}
    # Still listed, as on CUSIS, with no sections; the record says why.
    assert [(term.term_name, term.schedule) for term in course.terms][1] == ("2026-27 Term 1", [])
    assert course.learning_outcomes
    assert course.unavailable == ["term_switch TEST1000 2026-27 Term 1"]
    assert "unavailable" not in course.to_dict()


def test_an_outcome_cusis_keeps_failing_is_saved_empty_and_recorded(monkeypatch):
    course, calls = _course_server(monkeypatch, _system_error_at("course_outcome"))

    assert calls == {"course_details": 1, "course_outcome": 3, "term_switch": 1}
    assert len(course.terms) == 2
    assert course.learning_outcomes == ""
    assert course.unavailable == ["course_outcome TEST1000"]


def test_a_system_error_that_clears_on_retry_leaves_no_gap(monkeypatch):
    course, calls = _course_server(monkeypatch, _system_error_at("term_switch", calls=[1]))

    assert calls == {"course_details": 1, "course_outcome": 1, "term_switch": 2}
    assert len(course.terms) == 2
    assert course.unavailable == []


def test_a_course_retry_keeps_nothing_from_the_attempt_it_replaced(monkeypatch):
    # Another failure retries the whole course. The first attempt's outcome would
    # otherwise sit beside a record saying it is missing.
    expired = "<html><title>Session expired</title></html>"
    outcome_errors_after_first = _system_error_at("course_outcome", calls=range(2, 100))
    course, calls = _course_server(
        monkeypatch,
        lambda stage, call: (
            (expired if (stage, call) == ("term_switch", 1) else None)
            or outcome_errors_after_first(stage, call)
        ),
    )

    assert calls["course_details"] == 2
    assert course.learning_outcomes == ""
    assert course.unavailable == ["course_outcome TEST1000"]


def test_the_saved_chlt1001_page_shows_the_term_it_was_requested_for():
    # The page also selects a language elsewhere, which must not count as a second term.
    html = _sample_html("Course Details - CHLT 1001 - University Chinese I.html")
    course = _course("1001", [])
    course.subject = "CHLT"

    CuhkScraper._check_course_page(
        _live_scraper(),
        BeautifulSoup(html, "html.parser"),
        html,
        course,
        stage="show_sections",
        term_code="2420",
    )


def test_a_section_keeps_the_attributes_its_own_page_states(monkeypatch):
    # MUSC 3530 states "Cantonese and English" on both pages. Removing the course's lines
    # here left the section blank, indistinguishable from one that states nothing (#323).
    scraper = _live_scraper()
    section = CuhkScraper._parse_class_details(
        scraper,
        _sample_html("Class Details - MUSC 3530 - - Music Performer\u2019s Issues (8858).html"),
        "--LEC (8858)",
    )
    monkeypatch.setattr(
        CuhkScraper,
        "_scrape_term_details",
        lambda self, html, course, code, name: TermInfo(
            term_code=code, term_name=name, schedule=[section]
        ),
    )

    course = _course("3530", [])
    course.subject = "MUSC"
    course = CuhkScraper._get_course_details_with_term_selection(
        scraper,
        _sample_html("Course Details - MUSC 3530 - Music Performer\u2019s Issues.html"),
        course,
    )

    assert course.course_attributes == "Cantonese and English"
    assert course.terms[0].schedule[0]["class_attributes"] == "Cantonese and English"


def test_a_meeting_names_every_instructor_the_page_lists():
    # CUSIS separates the names with a comma and a line break; `clean_html_text` collapses
    # its blank line to one "\n". The app splits on this exact string, so assert the literal
    # — a change here or in CUSIS's markup surfaces as a failure, not as merged names.
    section = CuhkScraper._parse_class_details(
        _live_scraper(),
        _sample_html("Class Details - AISC 5000 - A Founda'n of Mach Learning & AI (3938).html"),
        "section",
    )

    assert (
        section["meetings"][0]["instructor"]
        == "Professor JIN Bangti, \nProfessor WANG Yi, \nProfessor ZHU Huichen"
    )


def _requirements(course_page, class_page):
    """The enrollment requirement each real page states, read by the scraper's parsers."""
    scraper = _live_scraper()
    course = _course("1000", [])
    CuhkScraper._extract_course_details(
        scraper, BeautifulSoup(_sample_html(course_page), "html.parser"), course
    )
    section = CuhkScraper._parse_class_details(scraper, _sample_html(class_page), "section")
    return course.enrollment_requirement, section["enrollment_requirement"]


@pytest.mark.parametrize(
    "course_page,class_page,expected",
    [
        # The cell holds the class's own line and then its course's "--" (#327).
        (
            "Course Details - CHLT 1001 - University Chinese I.html",
            "Class Details - CHLT 1001 - CD University Chinese I (7067).html",
            (
                "--",
                "For students of Faculty of Business Administration and GLEF major "
                "admitted in or after 2022/23\n--",
            ),
        ),
        # A restriction on this term's offering, absent from the course page.
        (
            "Course Details - MUSC 3530 - Music Performer\u2019s Issues.html",
            "Class Details - MUSC 3530 - - Music Performer\u2019s Issues (8858).html",
            ("", "For MUSC Majors & any MUSC Minors"),
        ),
        # The levels do agree here — the app has to tell that apart from the cases above.
        (
            "Course Details - CSCI 1020 - Hands-on Introduction to C++.html",
            "Class Details - CSCI 1020 - - Hands-On Intro to C++ (6161).html",
            (
                "Not for students who have taken CSCI1120 or 1520 or 1540 or ESTR1100.",
                "Not for students who have taken CSCI1120 or 1520 or 1540 or ESTR1100.",
            ),
        ),
    ],
)
def test_a_section_records_the_requirement_its_own_page_states(course_page, class_page, expected):
    assert _requirements(course_page, class_page) == expected


def _availability(page_name):
    soup = BeautifulSoup(_sample_html(page_name), "html.parser")
    return _bare_scraper()._parse_class_availability(soup)


@pytest.mark.parametrize(
    "page_name,expected",
    [
        # Seat counts alone cannot tell these apart: CHLT is as full as a closed class, yet
        # CUHK calls it Wait List, and UGFN has a queue while still calling itself Open.
        (
            "Class Details - CHLT 1001 - CD University Chinese I (7067).html",
            {
                "capacity": "25",
                "enrolled": "25",
                "waitlist_capacity": "999",
                "waitlist_total": "0",
                "available_seats": "0",
                "status": "Wait List",
            },
        ),
        (
            "Class Details - UGFN 1000 - C (5743).html",
            {
                "capacity": "136",
                "enrolled": "125",
                "waitlist_capacity": "999",
                "waitlist_total": "6",
                "available_seats": "11",
                "status": "Open",
            },
        ),
        (
            "Class Details - CSCI 1020 - - Hands-On Intro to C++ (6161).html",
            {
                "capacity": "50",
                "enrolled": "0",
                "waitlist_capacity": "0",
                "waitlist_total": "0",
                "available_seats": "50",
                "status": "Open",
            },
        ),
        (
            "Class Details - UGCP 1001 - -X01 Understanding China (8641).html",
            {
                "capacity": "2400",
                "enrolled": "0",
                "waitlist_capacity": "999",
                "waitlist_total": "0",
                "available_seats": "2400",
                "status": "Open",
            },
        ),
        # Full with no wait list to join. Enrolment runs over capacity, so available seats
        # is not capacity minus enrolled either.
        (
            "Class Details - GENA 1000 - -A01 College Biweekly Assembly (8862).html",
            {
                "capacity": "1438",
                "enrolled": "2363",
                "waitlist_capacity": "0",
                "waitlist_total": "0",
                "available_seats": "0",
                "status": "Closed",
            },
        ),
        # Full, and the wait list is full too, so there is no queue left to join. The old
        # rule asked only whether anyone was queueing, and called this "Waitlisted".
        (
            "Class Details - UGCP 1001 - -X01 Understanding China (6555).html",
            {
                "capacity": "2400",
                "enrolled": "2400",
                "waitlist_capacity": "999",
                "waitlist_total": "999",
                "available_seats": "0",
                "status": "Closed",
            },
        ),
    ],
)
def test_availability_is_read_from_the_page_not_computed(page_name, expected):
    assert _availability(page_name) == expected


def test_availability_is_blank_when_the_page_is_not_class_details():
    # A blank record is honest about having found nothing; the old rule read the missing
    # seat counts as zero and stamped "Closed" on it.
    assert _availability("System error.html") == {
        "capacity": "",
        "enrolled": "",
        "waitlist_capacity": "",
        "waitlist_total": "",
        "available_seats": "",
        "status": "",
    }


def test_status_icon_disagreeing_with_the_status_word_is_logged(scraper, caplog):
    soup = BeautifulSoup(
        '<img id="uc_class_img_status" src="images/class_closed.gif">'
        '<span id="uc_class_lbl_class_status">Wait List</span>',
        "html.parser",
    )
    with caplog.at_level(logging.WARNING):
        CuhkScraper._warn_on_status_icon_mismatch(scraper, soup, "Wait List")

    assert "wording may have changed" in caplog.text


def test_matching_status_icon_and_word_are_not_logged(scraper, caplog):
    soup = BeautifulSoup(
        '<img id="uc_class_img_status" src="images/class_wait.gif">', "html.parser"
    )
    with caplog.at_level(logging.WARNING):
        CuhkScraper._warn_on_status_icon_mismatch(scraper, soup, "Wait List")

    assert caplog.text == ""


# --- Class details response validation --------------------------------------------------

# Each sample page paired with the section name the schedule grid gives it in data/.
REAL_CLASS_DETAILS = [
    ("Class Details - UGCP 1001 - -X01 Understanding China (8641).html", "-X01-WBL (8641)"),
    ("Class Details - UGCP 1001 - -X01 Understanding China (6555).html", "-X01-WBL (6555)"),
    ("Class Details - GENA 1000 - -A01 College Biweekly Assembly (8862).html", "-A01-ASB (8862)"),
    ("Class Details - CHLT 1001 - CD University Chinese I (7067).html", "CD-LEC (7067)"),
    ("Class Details - CSCI 1020 - - Hands-On Intro to C++ (6161).html", "--LEC (6161)"),
    ("Class Details - UGFN 1000 - C (5743).html", "C-LEC (5743)"),
]


def _parse_details(page_name, section_name, tmp_path):
    scraper = _bare_scraper(
        config=SimpleNamespace(save_debug_files=False, save_debug_on_error=True),
        error_pages_dir=str(tmp_path),
        save_debug_html=True,
        current_subject="TEST",
        current_course_code="1000",
    )
    return scraper._parse_class_details(_sample_html(page_name), section_name)


@pytest.mark.parametrize("page_name,section_name", REAL_CLASS_DETAILS)
def test_real_class_details_pages_still_parse(tmp_path, page_name, section_name):
    result = _parse_details(page_name, section_name, tmp_path)

    assert result["section"] == section_name
    assert result["availability"]["status"] in {"Open", "Closed", "Wait List"}
    assert not list(tmp_path.iterdir())  # nothing kept when nothing failed


@pytest.mark.parametrize(
    "page_name",
    ["Invalid Verification Code - AENP.html", "System error.html", "No record found - AENP.html"],
)
def test_a_response_that_is_not_class_details_raises(tmp_path, page_name):
    # These parsed into a blank record that the old status rule stamped "Closed", which
    # then published as a real section offering nothing.
    with pytest.raises(ValueError, match="not a class details page"):
        _parse_details(page_name, "-T01-TUT (5514)", tmp_path)


def test_another_class_details_page_raises(tmp_path):
    # Every section postback replays the same viewstate, so the wrong class coming back
    # is invisible unless the class number is checked against the section name.
    with pytest.raises(ValueError, match="returned for section"):
        _parse_details(REAL_CLASS_DETAILS[1][0], "CD-LEC (9999)", tmp_path)


def test_the_failing_page_is_kept(tmp_path):
    with pytest.raises(ValueError):
        _parse_details("System error.html", "-T01-TUT (5514)", tmp_path)

    # _keep_failed_course_page saves the course details response, not this one.
    kept = list(tmp_path.iterdir())
    assert [p.name for p in kept] == ["class_details_TEST_1000_T01TUT_5514_FAILED.html"]
    assert "System error" in kept[0].read_text()


def test_a_class_details_page_with_no_seat_counts_raises(tmp_path):
    # The seat counts sit in a different panel from the status, so a page can carry a
    # status and still say nothing about seats.
    scraper = _bare_scraper(
        config=SimpleNamespace(save_debug_files=False, save_debug_on_error=True),
        error_pages_dir=str(tmp_path),
        save_debug_html=True,
        current_subject="TEST",
        current_course_code="1000",
    )
    html = (
        '<span id="uc_class_lbl_class_status">Open</span>'
        '<span id="uc_class_lbl_class_nbr">1234</span>'
    )

    with pytest.raises(ValueError, match="Unreadable seat counts"):
        scraper._parse_class_details(html, "--LEC (1234)")

    assert [p.name for p in tmp_path.iterdir()] == ["class_details_TEST_1000_LEC_1234_FAILED.html"]


# --- Scraping context ------------------------------------------------------------------


def test_a_scope_lasts_exactly_as_long_as_its_block():
    # Debug pages must not be filed under a subject or course the scraper has left.
    scraper = _bare_scraper()
    named = []

    with scraper._subject_scope("PHED"):
        with scraper._course_scope(_course("1010", [])):
            named.append(scraper._class_details_debug_filename("A-LEC (1)"))
        named.append(scraper._class_details_debug_filename("A-LEC (1)"))
    named.append(scraper._class_details_debug_filename("A-LEC (1)"))

    assert named == [
        "class_details_PHED_1010_ALEC_1.html",
        "class_details_PHED_UNKNOWN_ALEC_1.html",
        "class_details_UNKNOWN_UNKNOWN_ALEC_1.html",
    ]


def test_a_scope_unwinds_when_its_block_raises():
    # How a scope normally ends: a subject dies mid-course. Without this the next
    # subject inherits the dead one's name — the bug the scopes exist to prevent.
    scraper = _bare_scraper()

    with scraper._subject_scope("PHED"):
        with pytest.raises(ConnectionError):
            with scraper._course_scope(_course("1010", [])):
                raise ConnectionError("network is down")
        assert (scraper.current_subject, scraper.current_course_code) == ("PHED", None)

    with pytest.raises(ConnectionError):
        with scraper._subject_scope("PHED"):
            raise ConnectionError("network is down")
    assert (scraper.current_subject, scraper.current_course_code) == (None, None)


def test_scraping_a_subject_puts_it_in_scope():
    # Via the real entry point: nothing else puts the subject in scope.
    scraper = _subject_scraper(NO_RECORDS_PAGE)
    seen = []
    scraper._parse_course_list = lambda html: seen.append(scraper.current_subject) or []

    CuhkScraper.scrape_subject(scraper, "PHED")

    assert seen == ["PHED"]
    # And the run-level lines that follow belong to no subject.
    assert (scraper.current_subject, scraper.current_course_code) == (None, None)


def _log_context(scraper):
    record = logging.LogRecord("test", logging.INFO, "f", 1, "msg", None, None)
    cuhk_scraper._ScrapeContextFilter(scraper).filter(record)
    return record.context


def test_the_log_prefix_names_whatever_is_in_scope():
    scraper = _bare_scraper()
    assert _log_context(scraper) == ""  # startup and summary lines belong to no subject

    with scraper._subject_scope("CSCI"):
        assert _log_context(scraper) == "[CSCI] "
        with scraper._course_scope(_course("1130", [])):
            assert _log_context(scraper) == "[CSCI1130] "


def test_the_console_renders_exactly_what_the_log_file_does(tmp_path):
    # One definition of a scrape line, applied to whichever handler shows it.
    console = io.StringIO()
    handler = logging.StreamHandler(console)
    scraper = _bare_scraper(logger=logging.getLogger("test_console_parity"))
    scraper.logger.addHandler(handler)
    cuhk_scraper.show_scrape_context(scraper, [handler])
    scraper._setup_file_logging(str(tmp_path))
    try:
        with scraper._subject_scope("CSCI"), scraper._course_scope(_course("1130", [])):
            scraper.logger.info("scraping")
    finally:
        for h in scraper.logger.handlers[:]:
            h.close()
            scraper.logger.removeHandler(h)

    assert (
        console.getvalue().splitlines()[-1]
        == (next(tmp_path.iterdir()).read_text().splitlines()[-1])
    )


def test_only_the_levels_worth_spotting_are_marked():
    # Thresholds, not a lookup: an unlisted level still lands on the right side.
    assert cuhk_scraper._level_icon(logging.CRITICAL) == "🔴"
    assert cuhk_scraper._level_icon(logging.ERROR) == "🔴"
    assert cuhk_scraper._level_icon(logging.WARNING) == "🟡"
    assert cuhk_scraper._level_icon(logging.INFO) == cuhk_scraper._level_icon(logging.DEBUG)
    assert not cuhk_scraper._level_icon(logging.INFO).strip()


def test_a_handler_prefixes_on_its_own_filter_not_another_handlers():
    # The filter mutates the shared record, so a handler with only the format borrows a
    # neighbour's prefix — and loses it silently when that neighbour goes.
    console = io.StringIO()
    handler = logging.StreamHandler(console)
    scraper = _bare_scraper(logger=logging.getLogger("test_lone_console"))
    scraper.logger.setLevel(logging.INFO)
    scraper.logger.addHandler(handler)
    cuhk_scraper.show_scrape_context(scraper, [handler])
    try:
        with scraper._subject_scope("CSCI"):
            scraper.logger.info("scraping")
    finally:
        scraper.logger.removeHandler(handler)

    assert console.getvalue().strip().endswith("[CSCI] scraping")


def test_the_scrape_log_file_carries_the_prefix(tmp_path):
    # The seam: a format string and a filter field drift apart without noticing.
    scraper = _bare_scraper(logger=logging.getLogger("test_log_prefix"))
    scraper._setup_file_logging(str(tmp_path))
    try:
        with scraper._subject_scope("CSCI"), scraper._course_scope(_course("1130", [])):
            scraper.logger.info("scraping")
    finally:
        for handler in scraper.logger.handlers[:]:
            handler.close()
            scraper.logger.removeHandler(handler)

    lines = next(tmp_path.iterdir()).read_text().splitlines()
    assert lines[-1].endswith("[CSCI1130] scraping")
    assert "[" not in lines[0].split(" - ", 2)[2]  # the setup line, logged before any subject


def test_a_course_is_in_scope_before_its_pages_are_saved():
    # Class-details HTML is written inside _get_course_details_with_term_selection, so the
    # course must already be in scope there. It used to be set after, naming each course's
    # pages after the previous one.
    scraper = _live_scraper(_robust_request=lambda *a, **k: SimpleNamespace(text=DETAIL_HTML))
    named = []
    scraper._get_course_details_with_term_selection = lambda html, course: (
        named.append(scraper._class_details_debug_filename("A-LEC (1)")) or course
    )

    with scraper._subject_scope("TEST"):
        for code in ("1010", "1011"):
            course = _course(code, [])
            course.postback_target = "target"
            scraper.get_course_details(course, DETAIL_HTML)

    assert named == [
        "class_details_TEST_1010_ALEC_1.html",
        "class_details_TEST_1011_ALEC_1.html",
    ]
