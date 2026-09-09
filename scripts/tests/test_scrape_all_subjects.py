from types import SimpleNamespace

import cuhk_scraper
import pytest
import scrape_all_subjects
from scrape_all_subjects import parse_args


def test_no_arguments_means_the_whole_catalog():
    assert parse_args([]).subjects is None


def test_a_subject_list_is_split_on_commas():
    assert parse_args(["CSCI,MATH"]).subjects == ["CSCI", "MATH"]


@pytest.mark.parametrize("argument", ["", " ", "CSCI,", ",", "CSCI, ,MATH"])
def test_an_empty_subject_is_rejected_rather_than_scraped(argument):
    # `script "$SUBJECTS"` with the variable unset would otherwise read as no subjects
    # at all and start a ~9-hour full scrape.
    with pytest.raises(SystemExit):
        parse_args([argument])


def test_a_mistyped_flag_is_rejected_rather_than_scraped():
    # Otherwise it lands in the positional and launches a ~9-hour full rescrape.
    with pytest.raises(SystemExit):
        parse_args(["--resune"])


def test_resume_is_a_flag_of_its_own():
    assert parse_args(["--resume"]).resume is True
    assert parse_args([]).resume is False


def test_resume_and_a_subject_list_are_rejected_together():
    # Finishing an interrupted scrape and refreshing chosen subjects are different jobs.
    with pytest.raises(SystemExit):
        parse_args(["--resume", "CSCI"])


@pytest.mark.parametrize(
    "error",
    [cuhk_scraper.NothingToResume, cuhk_scraper.UnreadableProgressLog],
    ids=["nothing to resume", "unreadable log"],
)
def test_a_refusal_to_scrape_exits_nonzero(monkeypatch, error):
    # Otherwise it lands in the catch-all below, which returns 0 — a caller would read
    # a scrape that never started as a scrape that worked.
    monkeypatch.setattr(
        cuhk_scraper.ScrapingConfig, "for_production", classmethod(lambda cls: cls())
    )
    monkeypatch.setattr(scrape_all_subjects, "CuhkScraper", lambda config: _raising_scraper(error))
    monkeypatch.setattr("sys.argv", ["scrape_all_subjects.py", "--resume"])

    with pytest.raises(SystemExit) as raised:
        scrape_all_subjects.main()

    assert raised.value.code == 1


def _raising_scraper(error):
    def scrape_all(subjects, mode):
        raise error("nope")

    return SimpleNamespace(scrape_all_subjects=scrape_all)
