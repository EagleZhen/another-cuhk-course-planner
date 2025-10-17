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

import json
import os
import shutil
import glob
import sys
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Dict, List, Tuple, Optional

def load_scraping_progress() -> Optional[Dict]:
    """Load scraping progress data for validation"""
    progress_file = "logs/summary/scraping_progress.json"
    if not os.path.exists(progress_file):
        print("⚠️ No scraping_progress.json found - validation will be limited")
        return None

    try:
        with open(progress_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"❌ Error reading scraping_progress.json: {e}")
        return None

def validate_course_file(file_path: str, subject_code: str, progress_data: Optional[Dict]) -> Tuple[bool, List[str]]:
    """
    Validate a course JSON file
    Returns (is_valid, list_of_issues)
    """
    issues = []
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        return False, [f"Failed to parse JSON: {e}"]
    
    # Check basic structure
    if 'metadata' not in data:
        issues.append("Missing 'metadata' section")
    if 'courses' not in data:
        issues.append("Missing 'courses' section")
        return False, issues  # Can't continue without courses
    
    courses = data.get('courses', [])
    metadata = data.get('metadata', {})
    
    # Check metadata
    if metadata.get('subject') != subject_code:
        issues.append(f"Subject mismatch: file says '{metadata.get('subject')}', expected '{subject_code}'")
    
    scraped_count = metadata.get('total_courses', 0)
    actual_count = len(courses)
    
    if scraped_count != actual_count:
        issues.append(f"Course count mismatch: metadata says {scraped_count}, found {actual_count} courses")
    
    if actual_count == 0:
        issues.append("No courses found in file")
    
    # Validate against progress data if available
    if progress_data and 'scraping_log' in progress_data and 'subjects' in progress_data['scraping_log']:
        subject_progress = progress_data['scraping_log']['subjects'].get(subject_code)
        if subject_progress:
            # Check completion status
            if subject_progress.get('status') != 'completed':
                issues.append(f"Subject status is '{subject_progress.get('status')}', not 'completed'")
            
            # Check course count consistency
            expected_count = subject_progress.get('courses_count', 0)
            scraped_count_progress = subject_progress.get('courses_scraped', 0)
            
            if expected_count != scraped_count_progress:
                issues.append(f"Progress mismatch: expected {expected_count}, scraped {scraped_count_progress}")
            
            if actual_count != scraped_count_progress:
                issues.append(f"File vs progress mismatch: file has {actual_count}, progress says {scraped_count_progress}")
    
    # Check course structure (sample a few courses)
    for i, course in enumerate(courses[:3]):  # Check first 3 courses
        if not isinstance(course, dict):
            issues.append(f"Course {i+1} is not a valid object")
            continue
        
        required_fields = ['subject', 'course_code', 'title', 'credits']
        for field in required_fields:
            if field not in course:
                issues.append(f"Course {i+1} missing required field '{field}'")
        
        # Check if subject matches
        if course.get('subject') != subject_code:
            issues.append(f"Course {i+1} subject mismatch: '{course.get('subject')}' vs '{subject_code}'")
    
    return len(issues) == 0, issues

def find_course_files() -> List[str]:
    """
    Find all 4-letter course JSON files in /data directory,
    excluding EX_ prefixed files (exempt courses with no actual course data)
    Validates file naming and warns about unexpected files
    """
    data_dir = "data"
    if not os.path.exists(data_dir):
        return []

    # Find JSON files with exactly 4 letter names
    pattern = os.path.join(data_dir, "*.json")
    all_files = glob.glob(pattern)

    course_files = []
    excluded_files = []
    unexpected_files = []

    for file_path in all_files:
        filename = os.path.basename(file_path)
        name_without_ext = os.path.splitext(filename)[0]  # Remove extension

        # Exclude EX_ prefixed files (exemption placeholders with no courses)
        if name_without_ext.startswith('EX_'):
            excluded_files.append(name_without_ext)
            continue

        # Validate it's a proper 4-letter subject code
        if len(name_without_ext) == 4 and name_without_ext.isalpha() and name_without_ext.isupper():
            course_files.append(file_path)
        else:
            # Unexpected file format - report but don't include
            unexpected_files.append(filename)

    # Report excluded files
    if excluded_files:
        print(f"🚫 Excluded {len(excluded_files)} EX_ prefixed files: {', '.join(sorted(excluded_files))}")
        print()

    # Warn about unexpected files
    if unexpected_files:
        print(f"⚠️  Found {len(unexpected_files)} unexpected files in /data:")
        for f in sorted(unexpected_files):
            print(f"   - {f}")
        print()

    return sorted(course_files)

def validate_subject_list(found_subjects: List[str]) -> None:
    """
    Validate found subjects against hardcoded ALL_SUBJECTS in CourseSearch.tsx
    Warns if there are discrepancies (added/removed subjects)
    """
    # Path to CourseSearch.tsx
    course_search_path = "web/src/components/CourseSearch.tsx"

    if not os.path.exists(course_search_path):
        print("⚠️ Could not find CourseSearch.tsx - skipping subject list validation")
        print()
        return

    try:
        # Read CourseSearch.tsx and extract ALL_SUBJECTS array
        with open(course_search_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Find ALL_SUBJECTS array using regex
        import re
        pattern = r'const ALL_SUBJECTS = \[([\s\S]*?)\]'
        match = re.search(pattern, content)

        if not match:
            print("⚠️ Could not find ALL_SUBJECTS in CourseSearch.tsx")
            print()
            return

        # Parse the array content
        array_content = match.group(1)
        # Extract subject codes (remove quotes, whitespace, commas)
        hardcoded_subjects = re.findall(r"'([A-Z]{4})'", array_content)

        # Compare lists
        found_set = set(found_subjects)
        hardcoded_set = set(hardcoded_subjects)

        added = found_set - hardcoded_set
        removed = hardcoded_set - found_set

        if added or removed:
            print("⚠️  SUBJECT LIST CHANGES DETECTED:")
            if added:
                print(f"   ➕ Added ({len(added)}): {', '.join(sorted(added))}")
            if removed:
                print(f"   ➖ Removed ({len(removed)}): {', '.join(sorted(removed))}")
            print(f"   📝 Please update ALL_SUBJECTS in {course_search_path}")
            print()
        else:
            print(f"✅ Subject list matches CourseSearch.tsx ({len(found_subjects)} subjects)")
            print()

    except Exception as e:
        print(f"⚠️ Error validating subject list: {e}")
        print()

def calculate_scraping_statistics(progress_data: Optional[Dict]) -> Optional[Dict]:
    """Calculate detailed scraping statistics"""
    if not progress_data or 'scraping_log' not in progress_data:
        return None
    
    scraping_log = progress_data['scraping_log']
    if 'subjects' not in scraping_log:
        return None
    
    total_minutes = 0
    completed_subjects = 0
    failed_subjects = 0
    total_courses = 0
    fastest_subject = None
    slowest_subject = None
    min_time = float('inf')
    max_time = 0
    
    for subject_code, subject_data in scraping_log['subjects'].items():
        status = subject_data.get('status')
        duration = subject_data.get('duration_minutes', 0)
        courses_count = subject_data.get('courses_scraped', 0)
        
        if status == 'completed':
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
        
        elif status == 'failed':
            failed_subjects += 1
    
    # Calculate average time per course
    avg_time_per_course = total_minutes / total_courses if total_courses > 0 else 0
    avg_time_per_subject = total_minutes / completed_subjects if completed_subjects > 0 else 0
    
    return {
        'total_minutes': total_minutes,
        'completed_subjects': completed_subjects,
        'failed_subjects': failed_subjects,
        'total_courses': total_courses,
        'avg_time_per_course': avg_time_per_course,
        'avg_time_per_subject': avg_time_per_subject,
        'fastest_subject': fastest_subject,
        'slowest_subject': slowest_subject
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
        self.log_file = open(filename, 'w', encoding='utf-8')
    
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
    from datetime import datetime
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    # Create logs directory structure
    log_dir = "logs/publish"
    os.makedirs(log_dir, exist_ok=True)

    # Create timestamped log file
    timestamped_log = os.path.join(log_dir, f"publish_{timestamp}.log")
    latest_log = os.path.join(log_dir, "latest_publish.log")

    # Set up console logging (write to timestamped file)
    logger = ConsoleLogger(timestamped_log)
    sys.stdout = logger
    
    try:
        # Check for dry-run flag
        dry_run = '--dry-run' in sys.argv
        if dry_run:
            print("🔍 DRY RUN MODE - No files will be copied")
            print()
        
        # Load progress data (one-line summary)
        progress_data = load_scraping_progress()
        if progress_data:
            log_data = progress_data.get('scraping_log', {})
            stats = calculate_scraping_statistics(progress_data)
            if stats:
                # Convert UTC timestamp to HK timezone
                started_at_str = log_data.get('started_at')
                if started_at_str:
                    utc_time = datetime.fromisoformat(started_at_str)
                    hk_time = utc_time.astimezone(ZoneInfo('Asia/Hong_Kong'))
                    time_str = hk_time.strftime('%Y-%m-%d %H:%M HKT')
                    print(f"📊 Scraped at {time_str}: {log_data.get('completed', 0)} subjects, {stats['total_courses']:,} courses, {log_data.get('failed', 0)} failed")
                else:
                    print(f"📊 Scraped data: {log_data.get('completed', 0)} subjects, {stats['total_courses']:,} courses, {log_data.get('failed', 0)} failed")

        # Find course files
        course_files = find_course_files()
        print(f"📁 Found {len(course_files)} course JSON files")

        if not course_files:
            print("❌ No course files found to copy")
            return

        # Validate subject list against CourseSearch.tsx
        found_subjects = [os.path.splitext(os.path.basename(f))[0] for f in course_files]  # Extract subject codes
        validate_subject_list(found_subjects)

        # Create destination directory
        dest_dir = "web/public/data"
        if not dry_run:
            os.makedirs(dest_dir, exist_ok=True)

        # Validate and categorize files
        valid_files = []
        problematic_files = []
        empty_subjects = []
        for file_path in course_files:
            filename = os.path.basename(file_path)
            subject_code = os.path.splitext(filename)[0]  # Remove extension

            is_valid, issues = validate_course_file(file_path, subject_code, progress_data)
            
            if is_valid:
                valid_files.append(file_path)
            else:
                problematic_files.append((file_path, issues))
                # Check if this subject has no courses
                if any("No courses found" in issue for issue in issues):
                    empty_subjects.append(subject_code)

        # Report subjects with no courses (compact single-line format)
        if empty_subjects:
            print(f"📭 Subjects with no courses ({len(empty_subjects)}): {', '.join(sorted(empty_subjects))}")
        else:
            print("✅ All subjects have courses")
        
        # Report other problematic files (not empty)
        non_empty_problematic = [
            (file_path, issues) for file_path, issues in problematic_files 
            if not any("No courses found" in issue for issue in issues)
        ]
        
        if non_empty_problematic:
            print(f"⚠️ Files with other issues ({len(non_empty_problematic)}):")
            for file_path, issues in non_empty_problematic:
                filename = os.path.basename(file_path)
                subject_code = os.path.splitext(filename)[0]
                print(f"   - {subject_code}: {', '.join(issues)}")

        # Determine files to copy (all valid files by default)
        files_to_copy = valid_files.copy()
        
        # Ask if user wants to include problematic files (single confirmation)
        if problematic_files:
            print("📊 Summary:")
            print(f"   ✅ Valid files ready to copy: {len(valid_files)}")
            print(f"   ⚠️ Problematic files: {len(problematic_files)}")
            print()
            
            # Restore original stdout for user input
            sys.stdout = logger.terminal
            include_problematic = input("Include problematic files in migration? [y/N]: ").strip().lower()
            sys.stdout = logger  # Restore logging
            
            if include_problematic in ['y', 'yes']:
                files_to_copy.extend([file_path for file_path, _ in problematic_files])
                print("➡️ Including all problematic files in copy operation")
            else:
                print("⏭️ Skipping problematic files")

        if not files_to_copy:
            print("❌ No files to publish")
            return

        if not dry_run:
            # Restore original stdout for user input
            sys.stdout = logger.terminal
            proceed = input(f"\nProceed with publishing {len(files_to_copy)} files? [Y/n]: ").strip().lower()
            sys.stdout = logger  # Restore logging

            if proceed in ['n', 'no']:
                print("❌ Operation cancelled by user")
                return

        # Copy files
        print()
        copied_count = 0

        for file_path in files_to_copy:
            filename = os.path.basename(file_path)
            dest_path = os.path.join(dest_dir, filename)

            try:
                if not dry_run:
                    shutil.copy2(file_path, dest_path)
                copied_count += 1
            except Exception as e:
                print(f"❌ Failed to copy {filename}: {e}")

        # Publishing summary
        print("📋 Publishing Summary:")
        print(f"   ✅ Published: {copied_count}/{len(course_files)} files")
        if not dry_run:
            print(f"   📂 Destination: {dest_dir}")
        else:
            print("   🔍 DRY RUN - No files actually copied")

        print()
        print("📝 Logs saved to:")
        print(f"   📄 {timestamped_log}")
        print(f"   🔄 {latest_log}")

    finally:
        # Restore original stdout and close log file
        sys.stdout = logger.terminal
        logger.close()

        # Copy timestamped log to latest log for quick reference
        try:
            shutil.copy2(timestamped_log, latest_log)
        except Exception as e:
            print(f"⚠️ Warning: Could not create latest log: {e}")

if __name__ == "__main__":
    main()