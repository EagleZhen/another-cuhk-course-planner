import pytest
from scrape_all_subjects import parse_args


def test_no_arguments_means_the_whole_catalog():
    assert parse_args([]).subjects is None


def test_a_subject_list_is_taken_as_given():
    assert parse_args(["CSCI,MATH"]).subjects == "CSCI,MATH"


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
