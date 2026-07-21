import json
import logging
from pathlib import Path
from types import SimpleNamespace

import pytest
from cuhk_scraper import Course, CuhkScraper, ScrapingProgressTracker, TermInfo
from data_utils import SCHEMA_VERSION


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

    assert (tmp_path / "2025-26" / "scraped-at.txt").read_text() == "2026-07-18T00:41:13+00:00\n"
    assert (tmp_path / "no-terms" / "scraped-at.txt").exists()


def test_partial_scrape_leaves_scrape_times_alone(scraper, tmp_path):
    # A few refreshed subjects can't speak for the rest of the directory.
    _write_scrape_times(scraper, tmp_path, full_catalog=False)

    assert not list(tmp_path.rglob("scraped-at.txt"))


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

    assert (tmp_path / "2025-26" / "scraped-at.txt").read_text() == "2026-01-01T00:00:00+00:00\n"
    assert (tmp_path / "2026-27" / "scraped-at.txt").read_text() == "2027-01-01T00:00:00+00:00\n"


@pytest.fixture
def tracker(tmp_path):
    return ScrapingProgressTracker(str(tmp_path / "progress.json"), logging.getLogger("test"))


def _entry(tracker, subject):
    return tracker.progress_data["scraping_log"]["subjects"][subject]


def test_last_scraped_survives_retry_and_failure(tracker):
    # The subject's data file outlives a failed re-scrape, so the log should keep
    # reporting when that data is from.
    tracker.complete_subject("TEST", 5, "data/2025-26/TEST.json", 1.0, {})
    completed_at = _entry(tracker, "TEST")["last_scraped"]

    tracker.start_subject("TEST")
    assert _entry(tracker, "TEST")["last_scraped"] == completed_at

    tracker.fail_subject("TEST", "boom")
    assert _entry(tracker, "TEST")["last_scraped"] == completed_at

    # The publisher reads the file, not the tracker.
    saved = json.loads(Path(tracker.progress_file).read_text(encoding="utf-8"))
    assert saved["scraping_log"]["subjects"]["TEST"]["last_scraped"] == completed_at


def test_never_scraped_subject_omits_last_scraped(tracker):
    # Absent, not null: publishing must be able to tell "never scraped" from a real
    # timestamp, and a null would have to be special-cased everywhere downstream.
    tracker.fail_subject("TEST", "boom")
    assert "last_scraped" not in _entry(tracker, "TEST")
