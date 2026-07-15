import json
import os

import publish_course_data
import pytest
from data_utils import render_subjects_module, render_terms_module
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


def _write_course_file(source_dir, *, filename="AAAA.json", subject="AAAA"):
    year_dir = source_dir / "2025-26"
    year_dir.mkdir(parents=True)
    data = {
        "metadata": {
            "subject": subject,
            "subject_title": "Subject A",
            "total_courses": 1,
        },
        "courses": [
            {
                "subject": subject,
                "course_code": "1000",
                "title": "Course A",
                "credits": "3.00",
                "terms": [{"term_name": "2025-26 Term 1"}],
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
    assert "Terms manifest changed" in output
    assert "Review the Git diff" in output


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
    assert "Terms manifest changed" in output
    assert "Would publish: 1/1 files" in output
