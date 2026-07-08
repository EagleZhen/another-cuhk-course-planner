import logging
from types import SimpleNamespace

import pytest
from cuhk_scraper import Course, CuhkScraper, TermInfo


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
