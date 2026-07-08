import pytest
from data_utils import get_academic_year, partition_subject_by_year


@pytest.mark.parametrize(
    "term_name, expected",
    [
        ("2025-26 Term 2", "2025-26"),
        ("2026-27 Term 1", "2026-27"),  # the other year live during the transition
        ("2025-26 Acad Year (Medicine)", "2025-26"),  # real term with an unusual suffix
    ],
)
def test_get_academic_year(term_name, expected):
    assert get_academic_year(term_name) == expected


def _course(code, term_names):
    return {"course_code": code, "terms": [{"term_name": tn} for tn in term_names]}


def test_partition_splits_a_multi_year_course_into_each_year():
    # A course offered in both years lands in each file with only that year's terms;
    # a course with no terms goes to the no-terms bucket.
    data = {
        "metadata": {"subject": "TEST", "subject_title": "Test", "total_courses": 3},
        "courses": [
            _course("1000", ["2025-26 Term 1", "2026-27 Term 1"]),
            _course("2000", ["2025-26 Term 2"]),
            _course("9999", []),
        ],
    }

    parts = partition_subject_by_year(data)

    assert set(parts) == {"2025-26", "2026-27", None}
    y25 = {c["course_code"]: c for c in parts["2025-26"]["courses"]}
    y26 = {c["course_code"]: c for c in parts["2026-27"]["courses"]}
    assert set(y25) == {"1000", "2000"}
    assert set(y26) == {"1000"}
    assert [t["term_name"] for t in y25["1000"]["terms"]] == ["2025-26 Term 1"]
    assert [t["term_name"] for t in y26["1000"]["terms"]] == ["2026-27 Term 1"]
    assert [c["course_code"] for c in parts[None]["courses"]] == ["9999"]


def test_partition_recomputes_total_courses_per_slice():
    # Per-slice count (not the original), so metadata-vs-actual validation passes.
    data = {
        "metadata": {"subject": "TEST", "subject_title": "Test", "total_courses": 2},
        "courses": [_course("1000", ["2025-26 Term 1"]), _course("9999", [])],
    }

    parts = partition_subject_by_year(data)

    assert parts["2025-26"]["metadata"]["total_courses"] == 1
    assert parts[None]["metadata"]["total_courses"] == 1
    assert parts["2025-26"]["metadata"]["subject_title"] == "Test"  # metadata carries over


def test_partition_empty_subject_yields_no_slices():
    # Empty subject -> no slices -> scraper writes no file.
    data = {"metadata": {"subject": "EMPT", "total_courses": 0}, "courses": []}
    assert partition_subject_by_year(data) == {}
