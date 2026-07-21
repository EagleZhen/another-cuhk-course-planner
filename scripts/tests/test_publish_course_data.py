import json
import os

import publish_course_data
import pytest
from data_utils import (
    SCHEMA_VERSION,
    render_scrape_time_module,
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
        publish_course_data, "SCRAPE_TIME_FILE", str(generated_dir / "scrape-time.ts")
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
):
    year_dir = source_dir / "2025-26"
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


def _write_progress(tmp_path, last_scraped_by_subject):
    log_dir = tmp_path / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    subjects = {
        subject: {
            "status": "completed",
            "last_scraped": last_scraped,
            "courses_count": 1,
            "courses_scraped": 1,
        }
        for subject, last_scraped in last_scraped_by_subject.items()
    }
    (log_dir / "scraping_progress.json").write_text(
        json.dumps({"scraping_log": {"subjects": subjects}})
    )


def test_publish_writes_the_oldest_scrape_time(tmp_path, monkeypatch):
    # The oldest is the only time true of every subject; the newest would claim BBBB's
    # data is hours fresher than it is.
    source_dir, _, generated_dir = _configure_publisher(tmp_path, monkeypatch)
    _write_course_file(source_dir)
    _write_course_file(source_dir, filename="BBBB.json", subject="BBBB", subject_title="Subject B")
    _write_progress(
        tmp_path,
        {"AAAA": "2026-07-18T11:16:31+00:00", "BBBB": "2026-07-18T00:48:36+00:00"},
    )

    publish_course_data.main()

    assert (generated_dir / "scrape-time.ts").read_text() == render_scrape_time_module(
        "2026-07-18T00:48:36+00:00"
    )


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
