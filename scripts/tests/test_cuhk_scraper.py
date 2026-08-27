import json
import logging
import time
from pathlib import Path
from types import SimpleNamespace

import pytest
from cuhk_scraper import (
    Course,
    CuhkScraper,
    ScrapingConfig,
    ScrapingProgressTracker,
    TermInfo,
)
from data_utils import SCHEMA_VERSION
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


def _write_scrape_times(scraper, out_dir, *, full_catalog):
    saved = _save(scraper, [_course("1000", ["2025-26 Term 1"]), _course("9999", [])], out_dir)
    CuhkScraper._write_scrape_times(
        scraper, {"TEST": saved}, "2026-07-18T00:41:13+00:00", full_catalog
    )


def test_full_scrape_stamps_every_directory_it_wrote(scraper, tmp_path):
    # Including no-terms: stamping whatever was written needs no special cases, and the
    # publisher only ever reads year dirs.
    _write_scrape_times(scraper, tmp_path, full_catalog=True)

    assert (tmp_path / "2025-26" / "_scraped_at.txt").read_text() == "2026-07-18T00:41:13+00:00\n"
    assert (tmp_path / "no-terms" / "_scraped_at.txt").exists()


def test_partial_scrape_leaves_scrape_times_alone(scraper, tmp_path):
    # A few refreshed subjects can't speak for the rest of the directory.
    _write_scrape_times(scraper, tmp_path, full_catalog=False)

    assert not list(tmp_path.rglob("_scraped_at.txt"))


def test_dropped_year_keeps_its_scrape_time(scraper, tmp_path):
    # Once CUHK stops serving a year, scrapes stop writing it while its files stay on
    # disk. Its stamp has to stay put rather than follow the years still produced.
    _save(scraper, [_course("1000", ["2025-26 Term 1", "2026-27 Term 1"])], tmp_path)
    CuhkScraper._write_scrape_times(
        scraper,
        {"TEST": [str(tmp_path / "2025-26" / "TEST.json")]},
        "2026-01-01T00:00:00+00:00",
        True,
    )

    _save(scraper, [_course("1000", ["2026-27 Term 1"])], tmp_path)
    CuhkScraper._write_scrape_times(
        scraper,
        {"TEST": [str(tmp_path / "2026-27" / "TEST.json")]},
        "2027-01-01T00:00:00+00:00",
        True,
    )

    assert (tmp_path / "2025-26" / "_scraped_at.txt").read_text() == "2026-01-01T00:00:00+00:00\n"
    assert (tmp_path / "2026-27" / "_scraped_at.txt").read_text() == "2027-01-01T00:00:00+00:00\n"


def _tracker(progress_file, run_subjects, config=None):
    return ScrapingProgressTracker(
        str(progress_file), logging.getLogger("test"), run_subjects, config or ScrapingConfig()
    )


@pytest.fixture
def tracker(tmp_path):
    return _tracker(tmp_path / "progress.json", ["TEST"])


def _entry(tracker, subject):
    return tracker.progress_data["subjects"][subject]


def _saved(tracker):
    return json.loads(Path(tracker.progress_file).read_text(encoding="utf-8"))


# `latest_run` reports this run; `subjects` is the cumulative registry. Every test below
# is one way those two must not be confused.


def test_run_counters_cover_only_this_run(tmp_path):
    # Retrying one subject is the normal workflow, and its summary must describe the
    # retry rather than everything ever scraped.
    progress_file = tmp_path / "progress.json"
    first = _tracker(progress_file, ["AAAA", "BBBB", "CCCC"])
    for subject in ("AAAA", "BBBB", "CCCC"):
        first.complete_subject(subject, 1, f"data/{subject}.json", 1.0)

    retry = _tracker(progress_file, ["BBBB"])
    retry.complete_subject("BBBB", 2, "data/BBBB.json", 1.0)

    run = _saved(retry)["latest_run"]
    assert (run["subjects_total"], run["subjects_completed"]) == (1, 1)

    # The subjects it skipped are still on disk, so their entries survive untouched.
    registry = _saved(retry)["subjects"]
    assert sorted(registry) == ["AAAA", "BBBB", "CCCC"]
    assert registry["AAAA"]["courses_count"] == 1


def test_run_counters_split_completed_from_failed(tmp_path):
    tracker = _tracker(tmp_path / "progress.json", ["AAAA", "BBBB", "CCCC"])
    tracker.complete_subject("AAAA", 1, "data/AAAA.json", 1.0)
    tracker.complete_subject("BBBB", 1, "data/BBBB.json", 1.0)
    tracker.fail_subject("CCCC", "boom")

    run = _saved(tracker)["latest_run"]
    assert (run["subjects_completed"], run["subjects_failed"]) == (2, 1)
    assert tracker.get_failed_subjects() == ["CCCC"]


def test_run_counters_ignore_what_an_earlier_run_completed(tmp_path):
    # Mid-run the registry still reports last run's successes. Counting those would show
    # a run finished before it started work.
    progress_file = tmp_path / "progress.json"
    first = _tracker(progress_file, ["AAAA", "BBBB"])
    for subject in ("AAAA", "BBBB"):
        first.complete_subject(subject, 1, f"data/{subject}.json", 1.0)

    second = _tracker(progress_file, ["AAAA", "BBBB"])
    second.start_subject("AAAA")

    run = _saved(second)["latest_run"]
    assert (run["subjects_total"], run["subjects_completed"]) == (2, 0)


def test_finish_run_is_what_marks_a_run_completed(tracker):
    # A killed run can never write its own ending, so "in_progress" has to survive
    # everything except finish_run().
    tracker.complete_subject("TEST", 1, "data/TEST.json", 1.0)
    assert _saved(tracker)["latest_run"]["status"] == "in_progress"

    tracker.finish_run()
    assert _saved(tracker)["latest_run"]["status"] == "completed"


def test_a_run_reports_what_its_loop_actually_did(tmp_path):
    # The only cover for the wiring in scrape_all_subjects: the tracker's arguments and
    # the finish_run() that ends the run. Both network calls are stubbed, so this stays
    # off the live site.
    scraper = CuhkScraper.__new__(CuhkScraper)
    scraper.logger = logging.getLogger("test")
    scraper.config = ScrapingConfig(
        track_progress=True,
        output_directory=str(tmp_path / "data"),
        progress_file=str(tmp_path / "progress.json"),
    )
    scraper.progress_tracker = None
    scraper.get_subjects_with_titles_from_live_site = lambda: []
    scraper.scrape_subject = lambda subject: _boom() if subject == "BBBB" else []
    scraper._save_subject_immediately = lambda subject, courses, config: []
    scraper._report_course_outcome_failures = lambda: None

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
    tracker.complete_subject("AAAA", 1, "data/AAAA.json", 1.0)

    saved = _saved(tracker)
    assert saved["latest_run"]["config"]["max_courses"] == 5
    assert "config" not in saved["subjects"]["AAAA"]


def test_registry_stays_sorted_as_subjects_are_added(tmp_path):
    # Key order otherwise records scrape history: a subject CUHK adds later lands at the
    # end and stays there, so the file drifts out of order one addition at a time.
    tracker = _tracker(tmp_path / "progress.json", ["MATH", "AAAA"])
    tracker.complete_subject("MATH", 1, "data/MATH.json", 1.0)
    tracker.complete_subject("AAAA", 1, "data/AAAA.json", 1.0)

    saved = _saved(tracker)
    assert list(saved["subjects"]) == ["AAAA", "MATH"]

    # The other half: sorting recursively would alphabetize the run block, whose field
    # order is authored for a reader.
    assert list(saved["latest_run"])[:3] == ["started_at", "last_updated", "duration"]


def test_run_summary_reaches_the_log_file(tmp_path, caplog):
    # A 7-hour background run is the case that needs this: the summary is the part worth
    # keeping, and print() never reaches logs/scrape/.
    tracker = _tracker(tmp_path / "progress.json", ["AAAA", "BBBB"])
    tracker.complete_subject("AAAA", 1, "data/AAAA.json", 1.0)
    tracker.fail_subject("BBBB", "boom")

    with caplog.at_level(logging.INFO):
        tracker.log_summary()

    summary = caplog.records[-1].message
    assert "Total subjects: 2" in summary
    assert "Completed: 1" in summary
    assert "Failed: 1" in summary
    assert "Failed subjects: BBBB" in summary


# Each case below is one distinction: did this come back empty because it is empty, or
# because something broke?

DETAIL_HTML = '<span id="uc_course_lbl_course">TEST 1000 - Course 1000</span>'
TERM_OPTIONS = {"2390": "2025-26 Term 2", "2410": "2026-27 Term 1"}


def _term_page(selected):
    options = "".join(
        f'<option value="{code}"{' selected="selected"' if code == selected else ""}>{name}</option>'
        for code, name in TERM_OPTIONS.items()
    )
    return f'{DETAIL_HTML}<select id="uc_course_ddl_class_term">{options}</select>'


def _boom(*args, **kwargs):
    raise ConnectionError("network is down")


def _live_scraper(**overrides):
    """A CuhkScraper with no __init__ — the real one loads OCR models and opens log files."""
    scraper = CuhkScraper.__new__(CuhkScraper)
    scraper.logger = logging.getLogger("test")
    scraper.base_url = "http://test.invalid"
    scraper.config = ScrapingConfig(get_course_outcome=False, get_enrollment_details=False)
    scraper.current_config = None  # keeps _save_debug_html a no-op
    scraper.current_course_context = None
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


def test_permanent_outcome_failure_is_recorded_once_per_course():
    # An unrelated failure re-scrapes the course, reaching the same permanent failure.
    scraper = _live_scraper()
    for _ in range(3):
        CuhkScraper._track_failed_course_outcome(scraper, "TEST", "1000", "system_error_permanent")
    CuhkScraper._track_failed_course_outcome(scraper, "TEST", "1000", "other_reason")

    assert [f["reason"] for f in scraper._failed_course_outcomes] == [
        "system_error_permanent",
        "other_reason",
    ]


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


def _subject_scraper(page):
    return _live_scraper(
        config=ScrapingConfig(max_subject_attempts=MAX_SUBJECT_ATTEMPTS, get_details=False),
        progress_tracker=None,
        _set_context=lambda *a, **k: None,
        _extract_form_data=lambda soup: {},
        _robust_request=lambda *a, **k: SimpleNamespace(text=page),
    )


def test_exhausted_subject_raises_while_an_empty_subject_completes(monkeypatch):
    monkeypatch.setattr(time, "sleep", lambda _: None)

    # Every attempt rejected: returning [] here would be read as "this subject has no
    # courses" and the run would report success.
    rejected = '<span id="lbl_error" class="errorLabel">Invalid Verification Code</span>'
    with pytest.raises(RuntimeError, match=f"{MAX_SUBJECT_ATTEMPTS} attempts"):
        CuhkScraper.scrape_subject(_subject_scraper(rejected), "TEST")

    # A subject CUHK really has nothing for still succeeds with no courses.
    assert CuhkScraper.scrape_subject(_subject_scraper(NO_RECORDS_PAGE), "TEST") == []


def test_a_course_that_never_parses_gives_up_instead_of_looping(monkeypatch):
    # Retrying forever would strand every subject queued behind this one. Giving up fails
    # the subject, which blocks publishing and names it.
    monkeypatch.setattr(time, "sleep", lambda _: None)
    scraper = _live_scraper(_robust_request=lambda *a, **k: SimpleNamespace(text="<html></html>"))
    course = _course("1000", [])
    course.postback_target = "target"

    with pytest.raises(ValueError):
        CuhkScraper.get_course_details(scraper, course, DETAIL_HTML)


def test_a_course_that_parses_on_a_later_attempt_still_succeeds(monkeypatch):
    # The cap must only stop failures that never resolve. Transient corruption clears on
    # a re-fetch, and that course still has to come back rather than failing the subject.
    monkeypatch.setattr(time, "sleep", lambda _: None)
    pages = ["<html></html>", "<html></html>", DETAIL_HTML]
    scraper = _live_scraper(_robust_request=lambda *a, **k: SimpleNamespace(text=pages.pop(0)))
    course = _course("1000", [])
    course.postback_target = "target"

    assert CuhkScraper.get_course_details(scraper, course, DETAIL_HTML) is course
    assert pages == []  # took all three attempts


def test_missing_titles_abort_the_run_rather_than_blanking_every_subject_title():
    # An empty title list is not "no titles" — it would blank every subject title, and the
    # scrape would look successful.
    empty = '<select name="ddl_subject"><option value="">Select a subject</option></select>'
    for page in (DETAIL_HTML, empty):
        with pytest.raises(ValueError):
            CuhkScraper.get_subjects_with_titles_from_live_site(
                _live_scraper(_robust_request=lambda *a, **k: SimpleNamespace(text=page))
            )

    page = '<select name="ddl_subject"><option value="TEST">TEST - Test Subject</option></select>'
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


def _paced_scraper(get, delay=REQUEST_DELAY):
    return _live_scraper(
        config=ScrapingConfig(request_delay=delay),
        session=SimpleNamespace(get=get),
        _request_timeout=(10, 30),
    )


def _responder(clock, takes=0.0):
    def get(*args, **kwargs):
        clock.now += takes
        return SimpleNamespace(raise_for_status=lambda: None, content=b"")

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
    answers = [RequestsConnectionError("network is down"), None]

    def get(*args, **kwargs):
        answer = answers.pop(0)
        if answer is not None:
            raise answer
        return SimpleNamespace(raise_for_status=lambda: None, content=b"")

    CuhkScraper._robust_request(_paced_scraper(get, delay=3.0), "GET", "http://test.invalid")

    assert clock.sleeps == [1.0, 2.0]  # backoff, then the rest of the interval
    assert answers == []


def test_unknown_subject_title_is_recorded_empty_not_as_the_code(tmp_path):
    # getSubjectTitle in the web app already falls back to the code at render time, and
    # an empty string is falsy there — so this renders identically without a guess
    # sitting in the committed data.
    scraper = SimpleNamespace(subject_titles_cache={}, logger=logging.getLogger("test"))
    _save(scraper, [_course("1000", ["2025-26 Term 1"])], tmp_path)

    metadata = json.loads((tmp_path / "2025-26" / "TEST.json").read_text())["metadata"]
    assert metadata["subject_title"] == ""
