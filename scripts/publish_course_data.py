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

from data_utils import INTERIM_LIVE_YEAR, save_json_with_newline

# Validation messages
EMPTY_COURSES_ISSUE = "No courses found in file"

# Log inputs and outputs
LOGS_DIR = "logs"
PUBLISH_LOG_DIR = os.path.join(LOGS_DIR, "publish")
SCRAPING_PROGRESS_FILE = os.path.join(LOGS_DIR, "scraping_progress.json")
LATEST_PUBLISH_LOG = os.path.join(LOGS_DIR, "latest_publish.log")

# Course data inputs and publish targets
SOURCE_DATA_DIR = "data"
PUBLISHED_DATA_DIR = os.path.join("web", "public", "data")

# Interim: publish only the current live year, flattened to web/public/data/ as
# before, so the app is unchanged. Removed once the app fetches per-year.
SOURCE_YEAR_DIR = os.path.join(SOURCE_DATA_DIR, INTERIM_LIVE_YEAR)

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


def find_course_files() -> Tuple[List[str], List[str], int]:
    """
    Find all course JSON files in /data directory.
    Validates file naming and warns about unexpected files
    """
    if not os.path.exists(SOURCE_YEAR_DIR):
        return [], [], 0

    # Find JSON files (current live year only; see INTERIM_LIVE_YEAR)
    pattern = os.path.join(SOURCE_YEAR_DIR, "*.json")
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


def validate_subject_list(found_subjects: List[str]) -> bool:
    """
    Validate found subjects against SUBJECT_TITLES in lib/generated/subjects.ts (single source of truth)
    Returns True if validation passes, False if there are discrepancies (blocks publishing)
    """
    if not os.path.exists(SUBJECTS_FILE):
        print("❌ Could not find lib/generated/subjects.ts - publishing blocked")
        print()
        return False

    try:
        # Read subjects.ts and extract SUBJECT_TITLES keys
        with open(SUBJECTS_FILE, "r", encoding="utf-8") as f:
            content = f.read()

        # Find SUBJECT_TITLES object using regex
        pattern = r"const SUBJECT_TITLES[^{]*\{([\s\S]*?)\} as const"
        match = re.search(pattern, content)

        if not match:
            print("❌ Could not find SUBJECT_TITLES in subjects.ts - publishing blocked")
            print()
            return False

        # Parse canonical generated object keys, e.g. `ACCT: 'Accountancy',`.
        # Regex: line start, optional whitespace, 4-letter subject code, optional whitespace, colon.
        object_content = match.group(1)
        registered_subjects = re.findall(r"^\s*([A-Z]{4})\s*:", object_content, re.MULTILINE)

        if not registered_subjects:
            print("❌ Could not parse subject codes from SUBJECT_TITLES - publishing blocked")
            print()
            print("   This may be a formatting mismatch between:")
            print("      - scripts/generate_subjects.py")
            print("      - scripts/publish_course_data.py")
            print()
            print("   Expected entries like:")
            print("      ACCT: 'Accountancy',")
            print()
            return False

        # Compare lists
        found_set = set(found_subjects)
        registered_set = set(registered_subjects)

        added = found_set - registered_set
        removed = registered_set - found_set

        if added or removed:
            print("❌ SUBJECT LIST MISMATCH - PUBLISHING BLOCKED")
            print()
            if added:
                print(f"   New subjects in data ({len(added)}): {', '.join(sorted(added))}")
            if removed:
                print(
                    f"   Subjects missing from data ({len(removed)}): {', '.join(sorted(removed))}"
                )
            print()
            print("   To fix:")
            print("      1. Run: uv run python scripts/generate_subjects.py")
            print(
                "      2. Copy output to web/src/lib/generated/subjects.ts (replace SUBJECT_TITLES constant)"
            )
            print("      3. Run this script again")
            print()
            return False
        else:
            print(
                f"Subject list matches lib/generated/subjects.ts ({len(found_subjects)} subjects)"
            )
            print()
            return True

    except Exception as e:
        print(f"❌ Error validating subject list: {e}")
        print("   Publishing blocked due to validation error")
        print()
        return False


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

        # Find course files
        course_files, unexpected_files, total_json_files = find_course_files()
        print("Course JSON files:")
        print(f"   Source files in data/: {total_json_files}")
        if unexpected_files:
            print(f"   Skipped unexpected filenames: {len(unexpected_files)}")
            for filename in unexpected_files:
                print(f"      - {filename}")
        print(f"   Selected for publishing: {len(course_files)}")
        print()

        if not course_files:
            print("❌ No course files found to copy")
            return

        # Validate subject list against subjects.ts (single source of truth)
        found_subjects = [
            os.path.splitext(os.path.basename(f))[0] for f in course_files
        ]  # Extract subject codes
        if not validate_subject_list(found_subjects):
            print("❌ Publishing aborted due to subject list mismatch")
            sys.exit(1)

        # Create published data directory
        published_data_dir = PUBLISHED_DATA_DIR
        if not dry_run:
            os.makedirs(published_data_dir, exist_ok=True)

        # Validate and categorize files
        valid_files: List[str] = []
        problematic_files: List[Tuple[str, List[str]]] = []
        publishable_empty_subject_files: List[str] = []
        empty_subject_codes_for_report: List[str] = []
        for file_path in course_files:
            filename = os.path.basename(file_path)
            subject_code = os.path.splitext(filename)[0]  # Remove extension

            is_valid, issues = validate_course_file(file_path, subject_code, progress_data)

            if is_valid:
                valid_files.append(file_path)
            else:
                problematic_files.append((file_path, issues))
                # Check if this subject has no courses
                if EMPTY_COURSES_ISSUE in issues:
                    empty_subject_codes_for_report.append(subject_code)
                if issues == [EMPTY_COURSES_ISSUE]:
                    publishable_empty_subject_files.append(file_path)

        # Report subjects with no courses (compact single-line format)
        if empty_subject_codes_for_report:
            print(
                f"Subjects with no courses ({len(empty_subject_codes_for_report)}): "
                f"{', '.join(sorted(empty_subject_codes_for_report))}"
            )
        else:
            print("All subjects have courses")

        # Report blocking validation failures (everything except known-empty subjects)
        blocking_validation_failures = [
            (
                file_path,
                [issue for issue in issues if issue != EMPTY_COURSES_ISSUE],
            )
            for file_path, issues in problematic_files
            if any(issue != EMPTY_COURSES_ISSUE for issue in issues)
        ]

        if blocking_validation_failures:
            print(f"⚠️ Files with other issues ({len(blocking_validation_failures)}):")
            for file_path, issues in blocking_validation_failures:
                filename = os.path.basename(file_path)
                subject_code = os.path.splitext(filename)[0]
                print(f"   - {subject_code}: {', '.join(issues)}")

        if blocking_validation_failures:
            print("Summary:")
            print(
                f"   Files ready to copy: {len(valid_files) + len(publishable_empty_subject_files)}"
            )
            print(f"   ❌ Files with validation issues: {len(blocking_validation_failures)}")
            if empty_subject_codes_for_report:
                print(f"   Subjects with no courses: {len(empty_subject_codes_for_report)}")
            print()
            print("❌ Publishing aborted due to validation issues.")
            print("   Please double-check the scraped data before publishing.")
            print("   Re-run the scraper or fix the source JSON files, then run this script again.")
            sys.exit(1)

        # Determine files to copy (valid files plus known-empty subjects)
        files_to_copy = valid_files + publishable_empty_subject_files

        if empty_subject_codes_for_report:
            print(f"Including {len(publishable_empty_subject_files)} subjects with no courses")

        if not files_to_copy:
            print("❌ No files to publish")
            return

        if dry_run:
            print(f"Dry run: would publish {len(files_to_copy)} files")
        else:
            print(f"Publishing {len(files_to_copy)} files to {Path(published_data_dir).as_posix()}")

        # Copy files
        print()
        copied_count = 0

        for file_path in files_to_copy:
            filename = os.path.basename(file_path)
            dest_path = os.path.join(published_data_dir, filename)

            try:
                if not dry_run:
                    with open(file_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    for course in data.get("courses", []):
                        for field in STRIPPED_COURSE_FIELDS:
                            course.pop(field, None)
                    save_json_with_newline(dest_path, data)
                copied_count += 1
            except Exception as e:
                print(f"❌ Failed to copy {filename}: {e}")

        # Publishing summary
        print("Publishing Summary:")
        if not dry_run:
            print(f"   ✅ Published: {copied_count}/{len(files_to_copy)} files")
            print(f"   Destination: {Path(published_data_dir).as_posix()}")
        else:
            print(f"   Would publish: {copied_count}/{len(files_to_copy)} files")
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
