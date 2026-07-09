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
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from data_utils import (
    collect_terms_by_year,
    diff_term_names,
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

# Frontend source files used for validation
SUBJECTS_FILE = os.path.join("web", "src", "lib", "generated", "subjects.ts")

# Auto-written on every publish (no manual-copy gate like SUBJECTS_FILE - term
# names are mechanical, not a judgment call).
TERMS_FILE = os.path.join("web", "src", "lib", "generated", "terms.ts")


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
        filename = os.path.basename(file_path)
        name_without_ext = os.path.splitext(filename)[0]  # Remove extension

        # Validate it's a proper subject code (4 letters or has underscore for special codes)
        if (
            len(name_without_ext) == 4 and name_without_ext.isalpha() and name_without_ext.isupper()
        ) or "_" in name_without_ext:
            course_files.append(file_path)
        else:
            # Unexpected file format - report but don't include
            unexpected_files.append(filename)

    return sorted(course_files), sorted(unexpected_files), len(all_files)


def load_expected_subjects_by_year() -> Optional[Dict[str, set]]:
    """Parse SUBJECTS_BY_YEAR from lib/generated/subjects.ts (the single source of
    truth) into {year: set(codes)}. Returns None if it can't be read, which blocks
    publishing.
    """
    if not os.path.exists(SUBJECTS_FILE):
        print("❌ Could not find lib/generated/subjects.ts - publishing blocked")
        print()
        return None

    try:
        with open(SUBJECTS_FILE, "r", encoding="utf-8") as f:
            content = f.read()

        # Scope to the SUBJECTS_BY_YEAR object (the first `} as const`) so the
        # SUBJECT_TITLES block below it is not matched.
        block = re.search(r"SUBJECTS_BY_YEAR[^{]*\{([\s\S]*?)\}\s*as const", content)
        if not block:
            print("❌ Could not find SUBJECTS_BY_YEAR in subjects.ts - publishing blocked")
            print()
            return None

        # Each entry is `'YYYY-YY': ['ACCT', 'AIST', ...],`.
        expected: Dict[str, set] = {}
        for year, body in re.findall(r"'(\d{4}-\d{2})':\s*\[([^\]]*)\]", block.group(1)):
            expected[year] = set(re.findall(r"'([^']+)'", body))

        if not expected:
            print("❌ Could not parse SUBJECTS_BY_YEAR entries - publishing blocked")
            print("   Re-run scripts/generate_subjects.py to regenerate subjects.ts.")
            print()
            return None

        return expected

    except Exception as e:
        print(f"❌ Error reading subjects.ts: {e}")
        print("   Publishing blocked due to validation error")
        print()
        return None


def validate_year_subjects(year: str, found_subjects: List[str], expected: Optional[set]) -> bool:
    """Check a year's scraped subject set exactly matches SUBJECTS_BY_YEAR[year].
    Returns False (blocks publishing) on any mismatch.
    """
    found_set = set(found_subjects)
    expected_set = expected or set()
    added = found_set - expected_set
    removed = expected_set - found_set

    if added or removed:
        print(f"❌ [{year}] SUBJECT LIST MISMATCH vs subjects.ts - PUBLISHING BLOCKED")
        if added:
            print(f"   In data, not in subjects.ts ({len(added)}): {', '.join(sorted(added))}")
        if removed:
            print(f"   In subjects.ts, not in data ({len(removed)}): {', '.join(sorted(removed))}")
        print("   Fix: run `uv run python scripts/generate_subjects.py`, review the diff, re-run.")
        print()
        return False

    print(f"[{year}] subject list matches subjects.ts ({len(found_set)} subjects)")
    return True


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

        # Load progress data (one-line summary)
        progress_data = load_scraping_progress()
        if progress_data:
            log_data = progress_data.get("scraping_log", {})
            stats = calculate_scraping_statistics(progress_data)
            if stats:
                # Convert UTC timestamp to HK timezone
                started_at_str = log_data.get("started_at")
                if isinstance(started_at_str, str) and started_at_str:
                    utc_time = datetime.fromisoformat(started_at_str)
                    hk_time = utc_time.astimezone(ZoneInfo("Asia/Hong_Kong"))
                    time_str = hk_time.strftime("%Y-%m-%d %H:%M HKT")
                    print(
                        f"Scraped at {time_str}: {log_data.get('completed', 0)} subjects, {stats['total_courses']:,} courses, {log_data.get('failed', 0)} failed"
                    )
                else:
                    print(
                        f"Scraped data: {log_data.get('completed', 0)} subjects, {stats['total_courses']:,} courses, {log_data.get('failed', 0)} failed"
                    )

        # Discover source years and the subjects each should contain.
        source_years = year_dirs(Path(SOURCE_DATA_DIR))
        if not source_years:
            print("❌ No source year directories (data/<year>/) found")
            return

        expected_by_year = load_expected_subjects_by_year()
        if expected_by_year is None:
            sys.exit(1)

        # Validate each year, building a (source, destination) copy plan. Abort if
        # any year has a subject mismatch or a file with blocking issues, but check
        # every year first so all problems are reported in one run.
        copy_plan: List[Tuple[str, str]] = []  # (source_path, dest_path)
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

            found_subjects = [os.path.splitext(os.path.basename(f))[0] for f in course_files]
            if not validate_year_subjects(year, found_subjects, expected_by_year.get(year)):
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

            dest_dir = os.path.join(PUBLISHED_DATA_DIR, year)
            for file_path in files_to_copy:
                copy_plan.append((file_path, os.path.join(dest_dir, os.path.basename(file_path))))

        print()
        if blocked:
            print("❌ Publishing aborted due to validation issues.")
            print("   Fix the source data (or regenerate subjects.ts), then run this script again.")
            sys.exit(1)

        if not copy_plan:
            print("❌ No files to publish")
            return

        published_root = Path(PUBLISHED_DATA_DIR).as_posix()
        if dry_run:
            print(f"Dry run: would publish {len(copy_plan)} files under {published_root}/<year>/")
        else:
            print(f"Publishing {len(copy_plan)} files under {published_root}/<year>/")

        # Regenerate the years->terms manifest across all source years (auto-written,
        # no manual-copy gate like subjects.ts - see TERMS_FILE). Warn if it changed
        # so a term-name change doesn't silently slip through. Done here, past the
        # abort gates, so a failed publish leaves the manifest untouched.
        terms_by_year: Dict[str, List[str]] = {}
        for year_path in source_years:
            terms_by_year.update(collect_terms_by_year(year_path))
        new_terms_content = render_terms_module(terms_by_year)
        old_terms_content = ""
        if os.path.exists(TERMS_FILE):
            with open(TERMS_FILE, "r", encoding="utf-8") as f:
                old_terms_content = f.read()
        if old_terms_content and old_terms_content != new_terms_content:
            added, removed = diff_term_names(old_terms_content, new_terms_content)
            print("⚠️  Terms manifest changed:")
            if added:
                print(f"   Added: {', '.join(sorted(added))}")
            if removed:
                print(f"   Removed: {', '.join(sorted(removed))}")
            print()
        if not dry_run:
            os.makedirs(os.path.dirname(TERMS_FILE), exist_ok=True)
            with open(TERMS_FILE, "w", encoding="utf-8") as f:
                f.write(new_terms_content)

        # Copy files, stripping unused fields, into web/public/data/<year>/.
        print()
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
            except Exception as e:
                print(f"❌ Failed to copy {os.path.basename(source_path)}: {e}")

        # Publishing summary
        print("Publishing Summary:")
        if not dry_run:
            print(f"   ✅ Published: {copied_count}/{len(copy_plan)} files")
            print(f"   Destination: {published_root}/<year>/")
        else:
            print(f"   Would publish: {copied_count}/{len(copy_plan)} files")
            print("   DRY RUN - No files actually copied")

        print()
        print("Logs saved to:")
        print(f"   {Path(timestamped_publish_log).as_posix()}")
        print(f"   {Path(latest_publish_log).as_posix()}")

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
