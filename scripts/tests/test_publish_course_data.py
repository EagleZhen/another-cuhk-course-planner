import os

from publish_course_data import update_generated_file


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
