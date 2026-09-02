#!/usr/bin/env python3
"""
Course Data Publishing Script

Validates and publishes course JSON files from /data to /web/public/data for deployment.
- Validates scraped data integrity
- Checks against scraping_progress.json
- Reports total scraping time and statistics
- Saves console output to file
- Preserves original files in /data

Usage: python publish_course_data.py [--dry-run]
"""

import glob
import json
import os
import shutil
import sys
from collections.abc import Iterable, Iterator
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import NamedTuple
from zoneinfo import ZoneInfo

import pyperclip
from data_utils import (
    SCHEMA_VERSION,
    SCRAPE_TIME_FILENAME,
    collect_subjects_from_files,
    collect_terms_from_files,
    diff_subject_manifest,
    diff_term_names,
    is_subject_file,
    parse_iso_timestamp,
    render_scrape_times_module,
    render_subjects_module,
    render_terms_module,
    save_json_with_newline,
    year_dirs,
)

# Validation messages
EMPTY_COURSES_ISSUE = "No courses found in file"

# Log inputs and outputs
LOGS_DIR = "logs"
PUBLISH_LOG_DIR = os.path.join(LOGS_DIR, "publish")
SCRAPING_PROGRESS_FILE = os.path.join(LOGS_DIR, "scraping_progress.json")
LATEST_PUBLISH_LOG = os.path.join(LOGS_DIR, "latest_publish.log")

# Course data inputs and publish targets. Each source year data/<year>/ is
# published to its own web/public/data/<year>/ so the app can fetch per year.
SOURCE_DATA_DIR = "data"
PUBLISHED_DATA_DIR = os.path.join("web", "public", "data")

# Fields scraped into /data but never rendered by the web app, stripped from the
# published copy to cut payload (~68% of the gzipped transfer as of Jul 2026).
# Remove a field from this list once the app actually renders it.
STRIPPED_COURSE_FIELDS = (
    "course_syllabus",
    "required_readings",
    "recommended_readings",
    "feedback_evaluation",
)

# Generated frontend manifests
SUBJECTS_FILE = os.path.join("web", "src", "lib", "generated", "subjects.ts")
TERMS_FILE = os.path.join("web", "src", "lib", "generated", "terms.ts")
SCRAPE_TIMES_FILE = os.path.join("web", "src", "lib", "generated", "scrape-times.ts")

HONG_KONG_TZ = ZoneInfo("Asia/Hong_Kong")


def update_generated_file(
    file_path: str | Path, new_content: str, dry_run: bool
) -> tuple[str, bool]:
    """Return the previous content and whether it changed, writing only when needed."""
    path = Path(file_path)
    old_content = path.read_text("utf-8") if path.exists() else ""
    changed = old_content != new_content

    if changed and not dry_run:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(new_content, "utf-8")

    return old_content, changed


def load_scraping_progress() -> dict | None:
    """Load scraping progress data for validation"""
    if not os.path.exists(SCRAPING_PROGRESS_FILE):
        print("⚠️ No scraping_progress.json found - validation will be limited")
        return None

    try:
        with open(SCRAPING_PROGRESS_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"❌ Error reading scraping_progress.json: {e}")
        return None


def subject_code_of(file_path: str) -> str:
    """Course filenames are <subject>.json."""
    return os.path.splitext(os.path.basename(file_path))[0]


def validate_course_file(
    file_path: str, subject_code: str, *, check_schema_version: bool = True
) -> tuple[bool, list[str]]:
    """
    Validate a course JSON file
    Returns (is_valid, list_of_issues)

    File scope only; the scrape's own record is validate_scrape_progress.

    `check_schema_version` is off for an archived year, whose files no scrape can
    rewrite — see archived_years.
    """
    issues = []

    try:
        with open(file_path, encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        return False, [f"Failed to parse JSON: {e}"]

    # Check basic structure
    if "metadata" not in data:
        issues.append("Missing 'metadata' section")
    if "courses" not in data:
        issues.append("Missing 'courses' section")
        return False, issues  # Can't continue without courses

    courses = data.get("courses", [])
    metadata = data.get("metadata", {})

    # Check metadata
    file_version = metadata.get("schema_version")
    if check_schema_version and file_version != SCHEMA_VERSION:
        issues.append(
            f"Schema version is {file_version!r}, expected {SCHEMA_VERSION} — re-scrape this subject"
        )

    if metadata.get("subject") != subject_code:
        issues.append(
            f"Subject mismatch: file says '{metadata.get('subject')}', expected '{subject_code}'"
        )

    scraped_count = metadata.get("total_courses", 0)
    actual_count = len(courses)

    if scraped_count != actual_count:
        issues.append(
            f"Course count mismatch: metadata says {scraped_count}, found {actual_count} courses"
        )

    if actual_count == 0:
        issues.append(EMPTY_COURSES_ISSUE)

    # Check course structure (sample a few courses)
    for i, course in enumerate(courses[:3]):  # Check first 3 courses
        if not isinstance(course, dict):
            issues.append(f"Course {i + 1} is not a valid object")
            continue

        required_fields = ["subject", "course_code", "title", "credits"]
        for field in required_fields:
            if field not in course:
                issues.append(f"Course {i + 1} missing required field '{field}'")

        # Check if subject matches
        if course.get("subject") != subject_code:
            issues.append(
                f"Course {i + 1} subject mismatch: '{course.get('subject')}' vs '{subject_code}'"
            )

    return len(issues) == 0, issues


def validate_scrape_progress(progress_data: dict | None) -> dict[str, list[str]]:
    """Issues by subject code, from what the scrape recorded.

    Reads the progress log, not the files on disk: a subject that failed before writing
    anything has no file to carry the failure.

    No file-vs-progress count check — progress counts a whole scrape, a published file
    holds one year's slice, so the two legitimately differ.
    """
    if not progress_data:
        return {}

    # TODO(#290): nothing prunes the registry, so a subject CUHK drops keeps whatever
    # status it last recorded — a stale `failed` blocks every publish.
    return {
        subject_code: [f"Subject status is '{status}', not 'completed'"]
        for subject_code, subject_progress in progress_data.get("subjects", {}).items()
        if (status := subject_progress.get("status")) != "completed"
    }


def find_course_files(year_dir: str) -> tuple[list[str], list[str], int]:
    """
    Find all course JSON files in a data/<year>/ directory.
    Validates file naming and warns about unexpected files
    """
    if not os.path.exists(year_dir):
        return [], [], 0

    pattern = os.path.join(year_dir, "*.json")
    all_files = glob.glob(pattern)

    course_files = []
    unexpected_files = []

    for file_path in all_files:
        if is_subject_file(file_path):
            course_files.append(file_path)
        else:
            # Unexpected file format - report but don't include
            unexpected_files.append(os.path.basename(file_path))

    return sorted(course_files), sorted(unexpected_files), len(all_files)


def archived_years(source_years: list[Path]) -> set[str]:
    """Years the last full scrape did not produce, so nothing can rewrite them.

    Only full scrapes stamp a year directory, and only the ones they wrote, so a stamp
    older than the newest means CUHK stopped serving that year. Re-validating it against
    the current schema would reject it forever, since no re-scrape can satisfy the check.

    Not taken from the progress log, the obvious alternative: its subject registry is
    cumulative, so a subject this run skipped keeps an `output_file` naming a year CUHK
    has since dropped, and that year would look current again.

    A year with no stamp is treated as current and published as before.
    """
    stamps = {}
    for year_path in source_years:
        stamp = year_path / SCRAPE_TIME_FILENAME
        scraped_at = (
            parse_iso_timestamp(stamp.read_text("utf-8").strip()) if stamp.exists() else None
        )
        if scraped_at:
            stamps[year_path.name] = scraped_at

    if not stamps:
        return set()

    newest = max(stamps.values())
    return {year for year, scraped_at in stamps.items() if scraped_at < newest}


def categorize_year_files(
    course_files: list[str], *, check_schema_version: bool = True
) -> tuple[list[str], list[tuple[str, list[str]]], list[str]]:
    """Validate each file in a year. Returns (files_to_copy, blocking_failures, empty_codes):
    - files_to_copy: valid files plus subjects whose only issue is having no courses
    - blocking_failures: (file, non-empty issues) that must abort publishing
    - empty_codes: subject codes with no courses (for reporting)
    """
    files_to_copy: list[str] = []
    blocking_failures: list[tuple[str, list[str]]] = []
    empty_codes: list[str] = []

    for file_path in course_files:
        subject_code = subject_code_of(file_path)
        is_valid, issues = validate_course_file(
            file_path, subject_code, check_schema_version=check_schema_version
        )

        if is_valid:
            files_to_copy.append(file_path)
            continue

        if EMPTY_COURSES_ISSUE in issues:
            empty_codes.append(subject_code)

        other_issues = [issue for issue in issues if issue != EMPTY_COURSES_ISSUE]
        if other_issues:
            blocking_failures.append((file_path, other_issues))
        else:
            # Only issue is "no courses" - still publishable.
            files_to_copy.append(file_path)

    return files_to_copy, blocking_failures, empty_codes


class PublishPlan(NamedTuple):
    """What to copy where, plus whether validation found a blocking problem."""

    copy_plan: list[tuple[str, str]]  # (source_path, dest_path)
    files_by_year: dict[str, list[Path]]
    blocked: bool
    blocked_subjects: list[str]  # subject codes to re-scrape, named in the abort message


def build_publish_plan(source_years: list[Path], progress_data: dict | None) -> PublishPlan:
    """Validate the scrape and every source year, then build the copy plan.

    Every year is checked even after one fails, so a single run reports all problems.
    A blocked year contributes nothing to the plan, and neither does a blocked subject.
    """
    copy_plan: list[tuple[str, str]] = []
    files_by_year: dict[str, list[Path]] = {}
    blocked = False
    blocked_subjects: set[str] = set()

    progress_issues = validate_scrape_progress(progress_data)
    if progress_issues:
        print(f"⚠️ Subjects the scrape did not complete ({len(progress_issues)}):")
        for subject_code, issues in sorted(progress_issues.items()):
            print(f"      - {subject_code}: {', '.join(issues)}")
        blocked_subjects.update(progress_issues)
        blocked = True

    archived = archived_years(source_years)

    for year_path in source_years:
        year = year_path.name
        is_archived = year in archived
        course_files, unexpected_files, total_json_files = find_course_files(str(year_path))

        label = " (archived, not re-published)" if is_archived else ""
        print(f"[{year}] source files: {total_json_files}, selected: {len(course_files)}{label}")
        if unexpected_files:
            print(f"   Skipped unexpected filenames: {', '.join(unexpected_files)}")
        if not course_files:
            print(f"❌ [{year}] no course files found")
            blocked = True
            continue

        files_to_copy, blocking_failures, empty_codes = categorize_year_files(
            course_files, check_schema_version=not is_archived
        )
        if empty_codes:
            print(
                f"   Subjects with no courses ({len(empty_codes)}): "
                f"{', '.join(sorted(empty_codes))}"
            )
        if blocking_failures:
            print(f"   ⚠️ Files with issues ({len(blocking_failures)}):")
            for file_path, issues in blocking_failures:
                code = subject_code_of(file_path)
                blocked_subjects.add(code)
                print(f"      - {code}: {', '.join(issues)}")
            blocked = True
            continue

        # A subject this scrape failed says nothing about a year the scrape never touched.
        if not is_archived:
            files_to_copy = [
                file_path
                for file_path in files_to_copy
                if subject_code_of(file_path) not in progress_issues
            ]

        # An archived year still feeds the subject, term and scrape-time manifests —
        # dropping it here would erase the year from the app — but its published copy is
        # already complete and can no longer change, so nothing is copied.
        files_by_year[year] = [Path(file_path) for file_path in files_to_copy]
        if is_archived:
            continue

        dest_dir = os.path.join(PUBLISHED_DATA_DIR, year)
        for file_path in files_to_copy:
            copy_plan.append((file_path, os.path.join(dest_dir, os.path.basename(file_path))))

    return PublishPlan(copy_plan, files_by_year, blocked, sorted(blocked_subjects))


def collect_scrape_times(years: Iterable[str]) -> dict[str, str]:
    """Each year's scrape time, read from the directory the scraper stamped.

    A year with no stamp is left out, so the app shows no sync time for it rather
    than borrowing another year's.
    """
    times = {}
    for year in years:
        stamp = Path(SOURCE_DATA_DIR) / year / SCRAPE_TIME_FILENAME
        if stamp.exists():
            times[year] = stamp.read_text(encoding="utf-8").strip()
    return times


def copy_commit_title(scrape_times: dict[str, str]) -> None:
    """Put the commit title for this run on the clipboard, ready to paste.

    List only years stamped by the newest full scrape — the same rule archived_years
    inverts. An older year is archived rather than republished, so it never belongs in
    a title describing what this run wrote.

    Writes to stderr, which isn't teed into the publish log, so the committed
    log stays free of clipboard chatter either way.
    """
    parsed_times = {
        year: parsed
        for year, scraped_at in scrape_times.items()
        if (parsed := parse_iso_timestamp(scraped_at))
    }
    if not parsed_times:
        return

    latest = max(parsed_times.values())
    years = ", ".join(
        sorted(year for year, scraped_at in parsed_times.items() if scraped_at == latest)
    )
    title = (
        f"chore(data): update {years} courses "
        f"({latest.astimezone(HONG_KONG_TZ):%Y-%m-%d %H:%M HKT})"
    )
    try:
        pyperclip.copy(title)
        print(f"\nCommit title copied: {title}", file=sys.stderr)
    except pyperclip.PyperclipException:
        # Headless runs, or Linux without xclip/wl-copy.
        print(f"\nClipboard unavailable. Commit title: {title}", file=sys.stderr)


def summarize_subject_registry(progress_data: dict | None) -> dict | None:
    """Summarize every subject in the registry, which describes what sits in data/"""
    if not progress_data or "subjects" not in progress_data:
        return None

    completed_subjects = 0
    failed_subjects = 0
    total_courses = 0

    for subject_data in progress_data["subjects"].values():
        status = subject_data.get("status")
        if status == "completed":
            completed_subjects += 1
            total_courses += subject_data.get("courses_count", 0)
        elif status == "failed":
            failed_subjects += 1

    return {
        "completed_subjects": completed_subjects,
        "failed_subjects": failed_subjects,
        "total_courses": total_courses,
    }


# TODO(#272): dead - no caller anywhere; delete rather than build on it
def format_duration(minutes: float) -> str:
    """Format duration in a human-readable way"""
    if minutes < 60:
        return f"{minutes:.1f} minutes"

    hours = int(minutes // 60)
    remaining_minutes = minutes % 60

    if hours == 1:
        return f"{hours} hour {remaining_minutes:.1f} minutes"
    else:
        return f"{hours} hours {remaining_minutes:.1f} minutes"


def report_scrape_summary(progress_data: dict | None, scrape_times: dict[str, str]) -> None:
    """Print the one-line summary of the scrape the publish is based on.

    The counts cover the whole scrape corpus in data/, so they exceed the number of
    published files: no-terms/ holds courses that belong to no year directory.
    """
    stats = summarize_subject_registry(progress_data)
    if not stats:
        return

    # The stamp the app shows as "Last Data Sync" and the commit title carries, so all
    # three report one time by construction rather than three that nearly agree.
    scraped_at = max(
        (parsed for parsed in map(parse_iso_timestamp, scrape_times.values()) if parsed),
        default=None,
    )
    # An unstamped corpus still reports its counts, undated.
    when = (
        f"as of {scraped_at.astimezone(HONG_KONG_TZ):%Y-%m-%d %H:%M HKT}" if scraped_at else "data"
    )

    print(
        f"Scraped {when}: {stats['completed_subjects']} subjects, "
        f"{stats['total_courses']:,} courses, {stats['failed_subjects']} failed"
    )


def report_subject_manifest_changes(old_content: str, new_content: str) -> None:
    """Print how the subjects manifest changed, so it can be reviewed before committing."""
    print("⚠️  Subjects manifest changed:")
    changes = diff_subject_manifest(old_content, new_content)
    if changes is None:
        print("   Details unavailable; review the generated diff.")
    else:
        for year in sorted(changes.by_year):
            year_changes = changes.by_year[year]
            if year_changes.added:
                print(
                    f"   [{year}] Added ({len(year_changes.added)}): "
                    f"{', '.join(sorted(year_changes.added))}"
                )
            if year_changes.removed:
                print(
                    f"   [{year}] Removed ({len(year_changes.removed)}): "
                    f"{', '.join(sorted(year_changes.removed))}"
                )
        if changes.changed_titles:
            print(
                f"   Titles changed ({len(changes.changed_titles)}): "
                f"{', '.join(sorted(changes.changed_titles))}"
            )
    print(f"   Review the Git diff and commit {Path(SUBJECTS_FILE).as_posix()}.")
    print()


def report_term_manifest_changes(old_content: str, new_content: str) -> None:
    """Print how the terms manifest changed, so it can be reviewed before committing."""
    print("⚠️  Terms manifest changed:")
    # No previous file means every term reads as new; the diff would be noise.
    if old_content:
        added, removed = diff_term_names(old_content, new_content)
        if added:
            print(f"   Added: {', '.join(sorted(added))}")
        if removed:
            print(f"   Removed: {', '.join(sorted(removed))}")
    print(f"   Review the Git diff and commit {Path(TERMS_FILE).as_posix()}.")
    print()


def copy_published_files(copy_plan: list[tuple[str, str]], dry_run: bool) -> int:
    """Copy each planned file, stripping unrendered fields. Returns how many were copied."""
    copied_count = 0
    for source_path, dest_path in copy_plan:
        try:
            if not dry_run:
                os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                with open(source_path, encoding="utf-8") as f:
                    data = json.load(f)
                for course in data.get("courses", []):
                    for field in STRIPPED_COURSE_FIELDS:
                        course.pop(field, None)
                save_json_with_newline(dest_path, data)
            copied_count += 1
        # One unreadable or unwritable file must not abort the rest of the publish.
        except Exception as e:
            print(f"❌ Failed to copy {os.path.basename(source_path)}: {e}")
    return copied_count


def report_publish_summary(
    copied_count: int, planned_count: int, published_root: str, dry_run: bool
) -> None:
    """Print what was, or would have been, published."""
    print("Publishing Summary:")
    if dry_run:
        print(f"   Would publish: {copied_count}/{planned_count} files")
        print("   DRY RUN - No files actually copied")
    else:
        print(f"   ✅ Published: {copied_count}/{planned_count} files")
        print(f"   Destination: {published_root}/<year>/")


class ConsoleLogger:
    """Captures console output to both terminal and file"""

    def __init__(self, filename):
        self.terminal = sys.stdout
        self.log_file = open(filename, "w", encoding="utf-8")

    def write(self, message):
        self.terminal.write(message)
        self.log_file.write(message)

    def flush(self):
        self.terminal.flush()
        self.log_file.flush()

    def close(self):
        self.log_file.close()


@contextmanager
def publish_logging() -> Iterator[tuple[str, str]]:
    """Tee stdout to a timestamped log, then mirror it to the latest-log path.

    Yields both paths so the run can report where its output went.
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    os.makedirs(PUBLISH_LOG_DIR, exist_ok=True)
    timestamped_log = os.path.join(PUBLISH_LOG_DIR, f"publish_{timestamp}.log")
    latest_log = LATEST_PUBLISH_LOG

    logger = ConsoleLogger(timestamped_log)
    sys.stdout = logger
    try:
        yield timestamped_log, latest_log
    finally:
        sys.stdout = logger.terminal
        logger.close()
        # Mirroring is best effort: a publish that already ran must not fail here.
        try:
            shutil.copy2(timestamped_log, latest_log)
        except Exception as e:
            print(f"⚠️ Warning: Could not create latest log: {e}")


def main():
    """Publish scraped course data to the web app.

    One linear pass with three abort points: no source years, validation blocked, and
    nothing to publish. Every write happens after the last gate, so an aborted run leaves
    the published data and the generated manifests exactly as they were.
    """
    with publish_logging() as (timestamped_publish_log, latest_publish_log):
        dry_run = "--dry-run" in sys.argv
        if dry_run:
            print("DRY RUN MODE - No files will be copied")
            print()

        # 1. Report the scrape this publish is based on.
        source_years = year_dirs(Path(SOURCE_DATA_DIR))
        if not source_years:
            print("❌ No source year directories (data/<year>/) found")
            return

        progress_data = load_scraping_progress()
        report_scrape_summary(progress_data, collect_scrape_times(y.name for y in source_years))

        # 2. Validate every source year and plan the copy. The gates below are the last
        # point at which nothing has been written yet.
        plan = build_publish_plan(source_years, progress_data)

        print()
        if plan.blocked:
            # Publishing what passed would leave the manifests describing a catalog the
            # app doesn't have. Publish is manual, so someone is here to fix it.
            print("❌ Publishing aborted: the scraped data is incomplete (reasons above).")
            if plan.blocked_subjects:
                subjects = ",".join(plan.blocked_subjects)
                print("   Re-scrape, then run this script again:")
                print(f"      uv run python scripts/scrape_all_subjects.py {subjects}")
            else:
                print("   Fix the source data, then run this script again.")
            sys.exit(1)

        if not plan.copy_plan:
            print("❌ No files to publish")
            return

        published_root = Path(PUBLISHED_DATA_DIR).as_posix()
        if dry_run:
            print(
                f"Dry run: would publish {len(plan.copy_plan)} files under {published_root}/<year>/"
            )
        else:
            print(f"Publishing {len(plan.copy_plan)} files under {published_root}/<year>/")

        # 3. Regenerate the frontend manifests from the plan, not the source tree, so they
        # describe exactly what ships. Both are rendered before either is written, so a
        # rendering failure cannot leave the pair half-updated.
        subjects_by_year, subject_titles = collect_subjects_from_files(plan.files_by_year)
        new_subjects_content = render_subjects_module(subjects_by_year, subject_titles)

        terms_by_year = collect_terms_from_files(
            filepath for filepaths in plan.files_by_year.values() for filepath in filepaths
        )
        new_terms_content = render_terms_module(terms_by_year)

        old_subjects_content, subjects_changed = update_generated_file(
            SUBJECTS_FILE, new_subjects_content, dry_run
        )
        if subjects_changed:
            report_subject_manifest_changes(old_subjects_content, new_subjects_content)

        old_terms_content, terms_changed = update_generated_file(
            TERMS_FILE, new_terms_content, dry_run
        )
        if terms_changed:
            report_term_manifest_changes(old_terms_content, new_terms_content)

        # Written even when empty, so the module always reflects the data just published
        # rather than leaving times behind from an earlier run. No "changed" warning:
        # these move with every scrape by design.
        scrape_times = collect_scrape_times(plan.files_by_year)
        update_generated_file(SCRAPE_TIMES_FILE, render_scrape_times_module(scrape_times), dry_run)

        # 4. Copy the data files into web/public/data/<year>/, stripping fields the app
        # never renders.
        print()
        copied_count = copy_published_files(plan.copy_plan, dry_run)

        # 5. Report the outcome, and hand over a commit title for the data change.
        report_publish_summary(copied_count, len(plan.copy_plan), published_root, dry_run)

        print()
        print("Logs saved to:")
        print(f"   {Path(timestamped_publish_log).as_posix()}")
        print(f"   {Path(latest_publish_log).as_posix()}")

        copy_commit_title(scrape_times)


if __name__ == "__main__":
    main()
