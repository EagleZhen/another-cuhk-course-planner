import json
import os
import sys
from pathlib import Path

import publish_course_data
import pytest
from data_utils import (
    SCHEMA_VERSION,
    render_scrape_times_module,
    render_subjects_module,
    render_terms_module,
)
from publish_course_data import update_generated_file


def _configure_publisher(tmp_path, monkeypatch, *, dry_run=False):
    source_dir = tmp_path / "data"
    published_dir = tmp_path / "published"
    generated_dir = tmp_path / "generated"
    log_dir = tmp_path / "logs"

    monkeypatch.setattr(publish_course_data, "SOURCE_DATA_DIR", str(source_dir))
    monkeypatch.setattr(publish_course_data, "PUBLISHED_DATA_DIR", str(published_dir))
    monkeypatch.setattr(publish_course_data, "SUBJECTS_FILE", str(generated_dir / "subjects.ts"))
    monkeypatch.setattr(publish_course_data, "TERMS_FILE", str(generated_dir / "terms.ts"))
    monkeypatch.setattr(
        publish_course_data, "SCRAPE_TIMES_FILE", str(generated_dir / "scrape-times.ts")
    )
    monkeypatch.setattr(publish_course_data, "PUBLISH_LOG_DIR", str(log_dir / "publish"))
    monkeypatch.setattr(
        publish_course_data, "SCRAPING_PROGRESS_FILE", str(log_dir / "scraping_progress.json")
    )
    monkeypatch.setattr(
        publish_course_data, "LATEST_PUBLISH_LOG", str(log_dir / "latest_publish.log")
    )
    argv = ["publish_course_data.py"]
    if dry_run:
        argv.append("--dry-run")
    monkeypatch.setattr(publish_course_data.sys, "argv", argv)

    generated_dir.mkdir()
    return source_dir, published_dir, generated_dir


def _write_course_file(
    source_dir,
    *,
    filename="AAAA.json",
    subject="AAAA",
    subject_title="Subject A",
    term_name="2025-26 Term 1",
    extra_course_fields=None,
    year="2025-26",
):
    year_dir = source_dir / year
    year_dir.mkdir(parents=True, exist_ok=True)
    data = {
        "metadata": {
            "schema_version": SCHEMA_VERSION,
            "subject": subject,
            "subject_title": subject_title,
            "total_courses": 1,
        },
        "courses": [
            {
                "subject": subject,
                "course_code": "1000",
                "title": "Course A",
                "credits": "3.00",
                "terms": [{"term_name": term_name}],
                **(extra_course_fields or {}),
            }
        ],
    }
    (year_dir / filename).write_text(json.dumps(data))


def test_update_generated_file_replaces_changed_content(tmp_path):
    manifest = tmp_path / "manifest.ts"
    manifest.write_text("old")

    old_content, changed = update_generated_file(manifest, "new", dry_run=False)

    assert old_content == "old"
    assert changed is True
    assert manifest.read_text() == "new"


def test_update_generated_file_does_not_rewrite_unchanged_content(tmp_path):
    manifest = tmp_path / "manifest.ts"
    manifest.write_text("same")
    old_timestamp = 1_000_000_000
    os.utime(manifest, ns=(old_timestamp, old_timestamp))

    old_content, changed = update_generated_file(manifest, "same", dry_run=False)

    assert old_content == "same"
    assert changed is False
    assert manifest.stat().st_mtime_ns == old_timestamp


def test_update_generated_file_creates_missing_file(tmp_path):
    manifest = tmp_path / "generated" / "manifest.ts"

    old_content, changed = update_generated_file(manifest, "new", dry_run=False)

    assert old_content == ""
    assert changed is True
    assert manifest.read_text() == "new"


def test_update_generated_file_reports_dry_run_without_writing(tmp_path):
    manifest = tmp_path / "manifest.ts"
    manifest.write_text("old")

    old_content, changed = update_generated_file(manifest, "new", dry_run=True)

    assert old_content == "old"
    assert changed is True
    assert manifest.read_text() == "old"


def test_copy_commit_title_lists_only_years_from_latest_scrape(monkeypatch, capsys):
    copied_titles = []
    monkeypatch.setattr(publish_course_data.pyperclip, "copy", copied_titles.append)

    publish_course_data.copy_commit_title(
        {
            "2026-27": "2026-07-21T15:05:01.505056+00:00",
            "2024-25": "2026-06-01T10:00:00+00:00",
            "2025-26": "2026-07-21T15:05:01.505056+00:00",
        }
    )

    expected = "chore(data): update 2025-26, 2026-27 courses (2026-07-21 23:05 HKT)"
    assert copied_titles == [expected]
    assert f"Commit title copied: {expected}" in capsys.readouterr().err


def _progress(**scraping_log):
    scraping_log.setdefault(
        "subjects",
        {
            "CSCI": {"status": "completed", "duration_minutes": 2.5, "courses_scraped": 1234},
            "MATH": {"status": "completed", "duration_minutes": 1.0, "courses_scraped": 66},
            "PHYS": {"status": "failed"},
        },
    )
    return {"scraping_log": scraping_log}


def test_report_scrape_summary_states_start_time_in_hong_kong_time(capsys):
    publish_course_data.report_scrape_summary(
        _progress(completed=2, failed=1, started_at="2026-08-07T12:30:00+00:00")
    )

    assert capsys.readouterr().out == (
        "Scraped at 2026-08-07 20:30 HKT: 2 subjects, 1,300 courses, 1 failed\n"
    )


@pytest.mark.parametrize("started_at", [None, "", 12345])
def test_report_scrape_summary_falls_back_when_start_time_is_unusable(started_at, capsys):
    # An undated line still reports the counts rather than dropping the summary.
    publish_course_data.report_scrape_summary(
        _progress(completed=2, failed=1, started_at=started_at)
    )

    assert capsys.readouterr().out == "Scraped data: 2 subjects, 1,300 courses, 1 failed\n"


@pytest.mark.parametrize("progress_data", [None, {"other": 1}, {"scraping_log": {"completed": 2}}])
def test_report_scrape_summary_stays_silent_without_per_subject_stats(progress_data, capsys):
    publish_course_data.report_scrape_summary(progress_data)

    assert capsys.readouterr().out == ""


def _terms(*term_names):
    return render_terms_module({"2025-26": list(term_names)})


def test_publish_summary_reports_the_shortfall_when_a_file_fails_to_copy(
    tmp_path, monkeypatch, capsys
):
    # A failed file must not abort the publish, but the count has to show the gap -
    # it is the only signal that the published data is incomplete.
    source_dir, published_dir, _ = _configure_publisher(tmp_path, monkeypatch)
    _write_course_file(source_dir, filename="AAAA.json", subject="AAAA")
    _write_course_file(source_dir, filename="BBBB.json", subject="BBBB")

    real_save = publish_course_data.save_json_with_newline

    def save(dest_path, data):
        if "BBBB" in str(dest_path):
            raise OSError("disk full")
        return real_save(dest_path, data)

    monkeypatch.setattr(publish_course_data, "save_json_with_newline", save)

    publish_course_data.main()

    out = capsys.readouterr().out
    assert "\u274c Failed to copy BBBB.json: disk full" in out
    assert "Published: 1/2 files" in out
    assert (published_dir / "2025-26" / "AAAA.json").exists()
    assert not (published_dir / "2025-26" / "BBBB.json").exists()


def _configure_logging(tmp_path, monkeypatch):
    monkeypatch.setattr(publish_course_data, "PUBLISH_LOG_DIR", str(tmp_path / "publish"))
    monkeypatch.setattr(publish_course_data, "LATEST_PUBLISH_LOG", str(tmp_path / "latest.log"))


def test_publish_logging_mirrors_the_run_log_to_the_latest_log(tmp_path, monkeypatch):
    _configure_logging(tmp_path, monkeypatch)
    before = sys.stdout

    with publish_course_data.publish_logging() as (timestamped_log, latest_log):
        assert sys.stdout is not before
        print("published something")

    assert sys.stdout is before
    assert "published something" in Path(timestamped_log).read_text()
    assert Path(latest_log).read_text() == Path(timestamped_log).read_text()


def test_publish_logging_restores_stdout_when_the_publish_aborts(tmp_path, monkeypatch):
    # An aborted publish must not leave stdout pointing at a closed log file.
    _configure_logging(tmp_path, monkeypatch)
    before = sys.stdout

    with pytest.raises(SystemExit):
        with publish_course_data.publish_logging() as (_, latest_log):
            sys.exit(1)

    assert sys.stdout is before
    assert Path(latest_log).exists()
    print("still writable")


def test_publish_logging_warns_but_survives_an_unwritable_latest_log(tmp_path, monkeypatch, capsys):
    _configure_logging(tmp_path, monkeypatch)
    monkeypatch.setattr(
        publish_course_data, "LATEST_PUBLISH_LOG", str(tmp_path / "missing" / "latest.log")
    )

    with publish_course_data.publish_logging():
        print("published something")

    assert "\u26a0\ufe0f Warning: Could not create latest log:" in capsys.readouterr().out


def test_build_publish_plan_checks_every_year_before_blocking(tmp_path, monkeypatch, capsys):
    # One run must surface every problem, rather than making the user fix and rerun
    # year by year. A blocked year contributes nothing, but later years are still checked.
    source_dir, _, _ = _configure_publisher(tmp_path, monkeypatch)
    (source_dir / "2025-26").mkdir(parents=True)  # no course files at all

    _write_course_file(source_dir, year="2026-27", filename="BBBB.json", subject="BBBB")
    unversioned = source_dir / "2026-27" / "BBBB.json"
    data = json.loads(unversioned.read_text())
    del data["metadata"]["schema_version"]
    unversioned.write_text(json.dumps(data))

    _write_course_file(
        source_dir,
        year="2027-28",
        filename="CCCC.json",
        subject="CCCC",
        term_name="2027-28 Term 1",
    )

    plan = publish_course_data.build_publish_plan(
        [source_dir / "2025-26", source_dir / "2026-27", source_dir / "2027-28"], None
    )

    out = capsys.readouterr().out
    assert "[2025-26] no course files found" in out
    assert "Schema version" in out, "stopped before checking the second bad year"
    assert "[2027-28] source files:" in out, "stopped before checking the last year"

    assert plan.blocked
    assert list(plan.files_by_year) == ["2027-28"]
    assert [os.path.basename(source) for source, _ in plan.copy_plan] == ["CCCC.json"]


def test_a_failed_subject_blocks_the_publish_and_is_named(tmp_path, monkeypatch):
    # A failed scrape leaves the previous run's file in place, so the progress status is
    # the only thing saying that file no longer describes the subject.
    source_dir, _, _ = _configure_publisher(tmp_path, monkeypatch)
    _write_course_file(source_dir)

    def _plan(status):
        subject = {"status": status, "courses_count": 1, "courses_scraped": 1}
        return publish_course_data.build_publish_plan(
            [source_dir / "2025-26"], {"scraping_log": {"subjects": {"AAAA": subject}}}
        )

    blocked = _plan("failed")
    assert blocked.blocked
    assert blocked.blocked_subjects == ["AAAA"]
    assert blocked.copy_plan == []

    ok = _plan("completed")
    assert not ok.blocked
    assert not ok.blocked_subjects
    assert [os.path.basename(source) for source, _ in ok.copy_plan] == ["AAAA.json"]


def test_a_subject_that_failed_before_writing_any_file_still_blocks(tmp_path, monkeypatch):
    # A first-ever failure writes no file, so nothing on disk carries it.
    source_dir, _, _ = _configure_publisher(tmp_path, monkeypatch)
    _write_course_file(source_dir)  # AAAA scraped fine and has a file

    plan = publish_course_data.build_publish_plan(
        [source_dir / "2025-26"],
        {
            "scraping_log": {
                "subjects": {
                    "AAAA": {"status": "completed", "courses_count": 1, "courses_scraped": 1},
                    "ZZZZ": {"status": "failed", "retry_count": 3},
                }
            }
        },
    )

    assert plan.blocked
    assert plan.blocked_subjects == ["ZZZZ"]


def test_publish_strips_unrendered_fields_but_leaves_the_source_intact(tmp_path, monkeypatch):
    # These fields carry base64 images and are never rendered; shipping them roughly
    # tripled the gzipped payload. data/ stays complete so a field can be republished.
    source_dir, published_dir, _ = _configure_publisher(tmp_path, monkeypatch)
    stripped = {field: "payload" for field in publish_course_data.STRIPPED_COURSE_FIELDS}
    _write_course_file(source_dir, extra_course_fields={**stripped, "description": "kept"})

    publish_course_data.main()

    published = json.loads((published_dir / "2025-26" / "AAAA.json").read_text())["courses"][0]
    assert not [f for f in publish_course_data.STRIPPED_COURSE_FIELDS if f in published]
    assert published["description"] == "kept"

    source = json.loads((source_dir / "2025-26" / "AAAA.json").read_text())["courses"][0]
    assert [f for f in publish_course_data.STRIPPED_COURSE_FIELDS if f in source] == list(
        publish_course_data.STRIPPED_COURSE_FIELDS
    )


def test_report_term_manifest_changes_lists_added_and_removed_terms(monkeypatch, capsys):
    monkeypatch.setattr(publish_course_data, "TERMS_FILE", "generated/terms.ts")

    publish_course_data.report_term_manifest_changes(
        _terms("2025-26 Term 1", "2025-26 Term 2"), _terms("2025-26 Term 2", "2025-26 Term 3")
    )

    assert capsys.readouterr().out == (
        "\u26a0\ufe0f  Terms manifest changed:\n"
        "   Added: 2025-26 Term 3\n"
        "   Removed: 2025-26 Term 1\n"
        "   Review the Git diff and commit generated/terms.ts.\n"
        "\n"
    )


def test_report_term_manifest_changes_skips_the_diff_without_a_previous_manifest(
    monkeypatch, capsys
):
    # Every term would read as "added", which is noise rather than a reviewable change.
    monkeypatch.setattr(publish_course_data, "TERMS_FILE", "generated/terms.ts")

    publish_course_data.report_term_manifest_changes("", _terms("2025-26 Term 1"))

    assert capsys.readouterr().out == (
        "\u26a0\ufe0f  Terms manifest changed:\n"
        "   Review the Git diff and commit generated/terms.ts.\n"
        "\n"
    )


def test_publish_regenerates_changed_manifests(tmp_path, monkeypatch, capsys):
    source_dir, published_dir, generated_dir = _configure_publisher(tmp_path, monkeypatch)
    _write_course_file(source_dir)
    (generated_dir / "subjects.ts").write_text(render_subjects_module({"2025-26": []}, {}))
    (generated_dir / "terms.ts").write_text(render_terms_module({"2025-26": ["2025-26 Term 2"]}))

    publish_course_data.main()

    assert (generated_dir / "subjects.ts").read_text() == render_subjects_module(
        {"2025-26": ["AAAA"]}, {"AAAA": "Subject A"}
    )
    assert (generated_dir / "terms.ts").read_text() == render_terms_module(
        {"2025-26": ["2025-26 Term 1"]}
    )
    assert (published_dir / "2025-26" / "AAAA.json").exists()
    output = capsys.readouterr().out
    assert "Subjects manifest changed" in output
    assert "[2025-26] Added (1): AAAA" in output
    assert "Terms manifest changed" in output
    assert "Review the Git diff" in output


def test_publish_manifests_exclude_unexpected_files(tmp_path, monkeypatch, capsys):
    source_dir, published_dir, generated_dir = _configure_publisher(tmp_path, monkeypatch)
    _write_course_file(source_dir)
    _write_course_file(
        source_dir,
        filename="ABCDE.json",
        subject="ABCDE",
        subject_title="Unexpected subject",
        term_name="2025-26 Term 2",
    )

    publish_course_data.main()

    assert (generated_dir / "subjects.ts").read_text() == render_subjects_module(
        {"2025-26": ["AAAA"]}, {"AAAA": "Subject A"}
    )
    assert (generated_dir / "terms.ts").read_text() == render_terms_module(
        {"2025-26": ["2025-26 Term 1"]}
    )
    assert not (published_dir / "2025-26" / "ABCDE.json").exists()
    assert "Skipped unexpected filenames: ABCDE.json" in capsys.readouterr().out


def test_publish_reports_removed_subject_by_year(tmp_path, monkeypatch, capsys):
    source_dir, _, generated_dir = _configure_publisher(tmp_path, monkeypatch)
    _write_course_file(source_dir)
    (generated_dir / "subjects.ts").write_text(
        render_subjects_module(
            {"2025-26": ["AAAA", "BAMS"]},
            {"AAAA": "Subject A", "BAMS": "Subject B"},
        )
    )
    (generated_dir / "terms.ts").write_text(render_terms_module({"2025-26": ["2025-26 Term 1"]}))

    publish_course_data.main()

    output = capsys.readouterr().out
    assert "[2025-26] Removed (1): BAMS" in output


def test_publish_reports_changed_subject_titles(tmp_path, monkeypatch, capsys):
    source_dir, _, generated_dir = _configure_publisher(tmp_path, monkeypatch)
    _write_course_file(source_dir, subject_title="New title")
    (generated_dir / "subjects.ts").write_text(
        render_subjects_module({"2025-26": ["AAAA"]}, {"AAAA": "Old title"})
    )
    (generated_dir / "terms.ts").write_text(render_terms_module({"2025-26": ["2025-26 Term 1"]}))

    publish_course_data.main()

    output = capsys.readouterr().out
    assert "Titles changed (1): AAAA" in output
    assert "[2025-26] Added" not in output
    assert "[2025-26] Removed" not in output


def test_validation_failure_leaves_manifests_untouched(tmp_path, monkeypatch):
    source_dir, published_dir, generated_dir = _configure_publisher(tmp_path, monkeypatch)
    _write_course_file(source_dir, subject="BBBB")
    subjects_file = generated_dir / "subjects.ts"
    terms_file = generated_dir / "terms.ts"
    subjects_file.write_text("subjects-old")
    terms_file.write_text("terms-old")

    with pytest.raises(SystemExit, match="1"):
        publish_course_data.main()

    assert subjects_file.read_text() == "subjects-old"
    assert terms_file.read_text() == "terms-old"
    assert not published_dir.exists()


def test_publish_writes_each_year_scrape_time(tmp_path, monkeypatch):
    # Read from the year directory, so a year CUHK stopped serving keeps its own time
    # instead of inheriting one from the years still being scraped.
    source_dir, _, generated_dir = _configure_publisher(tmp_path, monkeypatch)
    _write_course_file(source_dir)
    (source_dir / "2025-26" / "_scraped_at.txt").write_text("2026-07-18T00:41:13+00:00\n")

    publish_course_data.main()

    assert (generated_dir / "scrape-times.ts").read_text() == render_scrape_times_module(
        {"2025-26": "2026-07-18T00:41:13+00:00"}
    )


def test_publish_clears_scrape_times_for_years_without_a_stamp(tmp_path, monkeypatch):
    # Better no sync time than one left over from a previous publish, which the app
    # would still display as if it described the data now on disk.
    source_dir, _, generated_dir = _configure_publisher(tmp_path, monkeypatch)
    _write_course_file(source_dir)
    (generated_dir / "scrape-times.ts").write_text(
        render_scrape_times_module({"2025-26": "2020-01-01T00:00:00+00:00"})
    )

    publish_course_data.main()

    assert (generated_dir / "scrape-times.ts").read_text() == render_scrape_times_module({})


def test_publish_blocks_on_unversioned_data(tmp_path, monkeypatch, capsys):
    # Blocks, not warns: an unrecognized shape must never reach the app. Pre-versioned
    # data omits the key, so treating "absent" as current would let all of it through.
    source_dir, published_dir, _ = _configure_publisher(tmp_path, monkeypatch)
    _write_course_file(source_dir)
    course_file = source_dir / "2025-26" / "AAAA.json"
    data = json.loads(course_file.read_text())
    del data["metadata"]["schema_version"]
    course_file.write_text(json.dumps(data))

    with pytest.raises(SystemExit, match="1"):
        publish_course_data.main()

    assert "Schema version" in capsys.readouterr().out
    assert not published_dir.exists()


def test_dry_run_reports_manifest_changes_without_writing(tmp_path, monkeypatch, capsys):
    source_dir, published_dir, generated_dir = _configure_publisher(
        tmp_path, monkeypatch, dry_run=True
    )
    _write_course_file(source_dir)
    subjects_file = generated_dir / "subjects.ts"
    terms_file = generated_dir / "terms.ts"
    subjects_file.write_text("subjects-old")
    terms_file.write_text("terms-old")

    publish_course_data.main()

    assert subjects_file.read_text() == "subjects-old"
    assert terms_file.read_text() == "terms-old"
    assert not published_dir.exists()
    output = capsys.readouterr().out
    assert "Subjects manifest changed" in output
    assert "Details unavailable; review the generated diff." in output
    assert "Terms manifest changed" in output
    assert "Would publish: 1/1 files" in output
