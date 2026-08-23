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
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple
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
) -> Tuple[str, bool]:
    """Return the previous content and whether it changed, writing only when needed."""
    path = Path(file_path)
    old_content = path.read_text("utf-8") if path.exists() else ""
    changed = old_content != new_content

    if changed and not dry_run:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(new_content, "utf-8")

    return old_content, changed


def load_scraping_progress() -> Optional[Dict]:
    """Load scraping progress data for validation"""
    if not os.path.exists(SCRAPING_PROGRESS_FILE):
        print("⚠️ No scraping_progress.json found - validation will be limited")
        return None

    try:
        with open(SCRAPING_PROGRESS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"❌ Error reading scraping_progress.json: {e}")
        return None


def validate_course_file(
    file_path: str, subject_code: str, progress_data: Optional[Dict]
) -> Tuple[bool, List[str]]:
    """
    Validate a course JSON file
    Returns (is_valid, list_of_issues)
    """
    issues = []

    try:
        with open(file_path, "r", encoding="utf-8") as f:
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
    if file_version != SCHEMA_VERSION:
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

    # Validate against progress data if available
    if (
        progress_data
        and "scraping_log" in progress_data
        and "subjects" in progress_data["scraping_log"]
    ):
        subject_progress = progress_data["scraping_log"]["subjects"].get(subject_code)
        if subject_progress:
            # Check completion status
            if subject_progress.get("status") != "completed":
                issues.append(
                    f"Subject status is '{subject_progress.get('status')}', not 'completed'"
                )

            # Check the scrape's own count consistency
            expected_count = subject_progress.get("courses_count", 0)
            scraped_count_progress = subject_progress.get("courses_scraped", 0)

            if expected_count != scraped_count_progress:
                issues.append(
                    f"Progress mismatch: expected {expected_count}, scraped {scraped_count_progress}"
                )

            # Note: no file-vs-progress count check here. progress_data counts a full
            # flat scrape, while a published file now holds only one year's slice of a
            # subject (data/<year>/), so the two legitimately differ. A per-year check
            # returns when the scraper records progress per year.

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


def find_course_files(year_dir: str) -> Tuple[List[str], List[str], int]:
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


def categorize_year_files(
    course_files: List[str], progress_data: Optional[Dict]
) -> Tuple[List[str], List[Tuple[str, List[str]]], List[str]]:
    """Validate each file in a year. Returns (files_to_copy, blocking_failures, empty_codes):
    - files_to_copy: valid files plus subjects whose only issue is having no courses
    - blocking_failures: (file, non-empty issues) that must abort publishing
    - empty_codes: subject codes with no courses (for reporting)
    """
    files_to_copy: List[str] = []
    blocking_failures: List[Tuple[str, List[str]]] = []
    empty_codes: List[str] = []

    for file_path in course_files:
        subject_code = os.path.splitext(os.path.basename(file_path))[0]
        is_valid, issues = validate_course_file(file_path, subject_code, progress_data)

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


def collect_scrape_times(years: Iterable[str]) -> Dict[str, str]:
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


def copy_commit_title(scrape_times: Dict[str, str]) -> None:
    """Put the commit title for this run on the clipboard, ready to paste.

    List only years stamped by the newest full scrape. Older source years remain
    publishable after CUHK drops them, but they were not updated by this run.

    Writes to stderr, which isn't teed into the publish log, so the committed
    log stays free of clipboard chatter either way.
    """
    if not scrape_times:
        return

    parsed_times = {
        year: datetime.fromisoformat(scraped_at) for year, scraped_at in scrape_times.items()
    }
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


def calculate_scraping_statistics(progress_data: Optional[Dict]) -> Optional[Dict]:
    """Calculate detailed scraping statistics"""
    if not progress_data or "scraping_log" not in progress_data:
        return None

    scraping_log = progress_data["scraping_log"]
    if "subjects" not in scraping_log:
        return None

    total_minutes = 0
    completed_subjects = 0
    failed_subjects = 0
    total_courses = 0
    fastest_subject = None
    slowest_subject = None
    min_time = float("inf")
    max_time = 0

    for subject_code, subject_data in scraping_log["subjects"].items():
        status = subject_data.get("status")
        duration = subject_data.get("duration_minutes", 0)
        courses_count = subject_data.get("courses_scraped", 0)

        if status == "completed":
            completed_subjects += 1
            total_courses += courses_count

            if duration > 0:
                total_minutes += duration

                # Track fastest/slowest subjects
                if duration < min_time:
                    min_time = duration
                    fastest_subject = (subject_code, duration, courses_count)

                if duration > max_time:
                    max_time = duration
                    slowest_subject = (subject_code, duration, courses_count)

        elif status == "failed":
            failed_subjects += 1

    # Calculate average time per course
    avg_time_per_course = total_minutes / total_courses if total_courses > 0 else 0
    avg_time_per_subject = total_minutes / completed_subjects if completed_subjects > 0 else 0

    return {
        "total_minutes": total_minutes,
        "completed_subjects": completed_subjects,
        "failed_subjects": failed_subjects,
        "total_courses": total_courses,
        "avg_time_per_course": avg_time_per_course,
        "avg_time_per_subject": avg_time_per_subject,
        "fastest_subject": fastest_subject,
        "slowest_subject": slowest_subject,
    }


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


def report_scrape_summary(progress_data: Optional[Dict]) -> None:
    """Print the one-line summary of the scrape the publish is based on."""
    if not progress_data:
        return

    stats = calculate_scraping_statistics(progress_data)
    if not stats:
        return

    log_data = progress_data.get("scraping_log", {})
    started_at = log_data.get("started_at")
    # Fall back to an undated line when the scrape log has no usable start time.
    when = "data"
    if isinstance(started_at, str) and started_at:
        hk_time = datetime.fromisoformat(started_at).astimezone(HONG_KONG_TZ)
        when = f"at {hk_time.strftime('%Y-%m-%d %H:%M HKT')}"

    print(
        f"Scraped {when}: {log_data.get('completed', 0)} subjects, "
        f"{stats['total_courses']:,} courses, {log_data.get('failed', 0)} failed"
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


def copy_published_files(copy_plan: List[Tuple[str, str]], dry_run: bool) -> int:
    """Copy each planned file, stripping unrendered fields. Returns how many were copied."""
    copied_count = 0
    for source_path, dest_path in copy_plan:
        try:
            if not dry_run:
                os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                with open(source_path, "r", encoding="utf-8") as f:
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


# TODO(#154): extract each phase into a named helper so this reads as a sequence of steps
def main():
    # Generate log filename with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    # Create verbose publish log directory
    os.makedirs(PUBLISH_LOG_DIR, exist_ok=True)

    # Create timestamped log file
    timestamped_publish_log = os.path.join(PUBLISH_LOG_DIR, f"publish_{timestamp}.log")
    latest_publish_log = LATEST_PUBLISH_LOG

    # Set up console logging (write to timestamped file)
    logger = ConsoleLogger(timestamped_publish_log)
    sys.stdout = logger

    try:
        # Check for dry-run flag
        dry_run = "--dry-run" in sys.argv
        if dry_run:
            print("DRY RUN MODE - No files will be copied")
            print()

        progress_data = load_scraping_progress()
        report_scrape_summary(progress_data)

        # Discover and validate every source year before changing any output.
        source_years = year_dirs(Path(SOURCE_DATA_DIR))
        if not source_years:
            print("❌ No source year directories (data/<year>/) found")
            return

        # Validate each year, building a (source, destination) copy plan. Abort if
        # any file has blocking issues, but check every year first so all problems
        # are reported in one run.
        copy_plan: List[Tuple[str, str]] = []  # (source_path, dest_path)
        publishable_files_by_year: Dict[str, List[Path]] = {}
        blocked = False

        for year_path in source_years:
            year = year_path.name
            course_files, unexpected_files, total_json_files = find_course_files(str(year_path))

            print(f"[{year}] source files: {total_json_files}, selected: {len(course_files)}")
            if unexpected_files:
                print(f"   Skipped unexpected filenames: {', '.join(unexpected_files)}")
            if not course_files:
                print(f"❌ [{year}] no course files found")
                blocked = True
                continue

            files_to_copy, blocking_failures, empty_codes = categorize_year_files(
                course_files, progress_data
            )
            if empty_codes:
                print(
                    f"   Subjects with no courses ({len(empty_codes)}): "
                    f"{', '.join(sorted(empty_codes))}"
                )
            if blocking_failures:
                print(f"   ⚠️ Files with issues ({len(blocking_failures)}):")
                for file_path, issues in blocking_failures:
                    code = os.path.splitext(os.path.basename(file_path))[0]
                    print(f"      - {code}: {', '.join(issues)}")
                blocked = True
                continue

            publishable_files_by_year[year] = [Path(file_path) for file_path in files_to_copy]
            dest_dir = os.path.join(PUBLISHED_DATA_DIR, year)
            for file_path in files_to_copy:
                copy_plan.append((file_path, os.path.join(dest_dir, os.path.basename(file_path))))

        print()
        if blocked:
            print("❌ Publishing aborted due to validation issues.")
            print("   Fix the source data, then run this script again.")
            sys.exit(1)

        if not copy_plan:
            print("❌ No files to publish")
            return

        published_root = Path(PUBLISHED_DATA_DIR).as_posix()
        if dry_run:
            print(f"Dry run: would publish {len(copy_plan)} files under {published_root}/<year>/")
        else:
            print(f"Publishing {len(copy_plan)} files under {published_root}/<year>/")

        # Render the subject and term manifests before writing either one, and run the
        # whole block after every validation gate, so a failed publish leaves the
        # generated files untouched.
        subjects_by_year, subject_titles = collect_subjects_from_files(publishable_files_by_year)
        new_subjects_content = render_subjects_module(subjects_by_year, subject_titles)

        terms_by_year = collect_terms_from_files(
            filepath for filepaths in publishable_files_by_year.values() for filepath in filepaths
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
        scrape_times = collect_scrape_times(publishable_files_by_year)
        update_generated_file(SCRAPE_TIMES_FILE, render_scrape_times_module(scrape_times), dry_run)

        # Copy files, stripping unused fields, into web/public/data/<year>/.
        print()
        copied_count = copy_published_files(copy_plan, dry_run)

        report_publish_summary(copied_count, len(copy_plan), published_root, dry_run)

        print()
        print("Logs saved to:")
        print(f"   {Path(timestamped_publish_log).as_posix()}")
        print(f"   {Path(latest_publish_log).as_posix()}")

        copy_commit_title(scrape_times)

    finally:
        # Restore original stdout and close log file
        sys.stdout = logger.terminal
        logger.close()

        # Copy timestamped log to latest log for quick reference
        try:
            shutil.copy2(timestamped_publish_log, latest_publish_log)
        except Exception as e:
            print(f"⚠️ Warning: Could not create latest log: {e}")


if __name__ == "__main__":
    main()
