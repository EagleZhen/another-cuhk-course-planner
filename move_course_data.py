#!/usr/bin/env python3
"""
Course Data Migration Script

Validates and moves course JSON files from /data to /web/public/data with comprehensive checks.
- Validates scraped data integrity
- Checks against scraping_progress.json
- Reports total scraping time and statistics
- Saves console output to file

Usage: python move_course_data.py [--dry-run]
"""

import json
import os
import shutil
import glob
import sys
from typing import Dict, List, Tuple, Optional

def load_scraping_progress() -> Optional[Dict]:
    """Load scraping progress data for validation"""
    progress_file = "data/scraping_progress.json"
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
    if progress_data and 'subjects' in progress_data:
        subject_progress = progress_data['subjects'].get(subject_code)
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
    """Find all 4-letter course JSON files in /data directory"""
    data_dir = "data"
    if not os.path.exists(data_dir):
        return []
    
    # Find JSON files with exactly 4 letter names
    pattern = os.path.join(data_dir, "*.json")
    all_files = glob.glob(pattern)
    
    course_files = []
    for file_path in all_files:
        filename = os.path.basename(file_path)
        name_without_ext = filename[:-5]  # Remove .json
        
        # Check if it's exactly 4 letters
        if len(name_without_ext) == 4 and name_without_ext.isalpha():
            course_files.append(file_path)
    
    return sorted(course_files)

def calculate_scraping_statistics(progress_data: Optional[Dict]) -> Optional[Dict]:
    """Calculate detailed scraping statistics"""
    if not progress_data or 'subjects' not in progress_data:
        return None
    
    total_minutes = 0
    completed_subjects = 0
    failed_subjects = 0
    total_courses = 0
    total_sections_scraped = 0
    fastest_subject = None
    slowest_subject = None
    min_time = float('inf')
    max_time = 0
    
    for subject_code, subject_data in progress_data['subjects'].items():
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
    log_dir = "logs/migration"
    os.makedirs(log_dir, exist_ok=True)
    
    log_filename = os.path.join(log_dir, f"migration_log_{timestamp}.txt")
    
    # Set up console logging
    logger = ConsoleLogger(log_filename)
    sys.stdout = logger
    
    try:
        # Check for dry-run flag
        dry_run = '--dry-run' in sys.argv
        if dry_run:
            print("🔍 DRY RUN MODE - No files will be moved")
            print()
        
        # Load progress data
        print("📊 Loading scraping progress data...")
        progress_data = load_scraping_progress()
        
        if progress_data:
            print(f"✅ Progress data loaded:")
            log_data = progress_data.get('scraping_log', {})
            print(f"   📈 Total subjects: {log_data.get('total_subjects', 'unknown')}")
            print(f"   ✅ Completed: {log_data.get('completed', 'unknown')}")
            print(f"   ❌ Failed: {log_data.get('failed', 'unknown')}")
            
            # Calculate and display detailed scraping statistics
            stats = calculate_scraping_statistics(progress_data)
            if stats:
                print()
                print("📊 Scraping Performance Analysis:")
                print(f"   ⏱️ Total time: {format_duration(stats['total_minutes'])}")
                print(f"   📚 Total courses: {stats['total_courses']:,}")
                print(f"   📋 Average per subject: {format_duration(stats['avg_time_per_subject'])}")
                print(f"   📖 Average per course: {stats['avg_time_per_course']:.2f} minutes")
                
                if stats['fastest_subject']:
                    subj, time, courses = stats['fastest_subject']
                    print(f"   🏃 Fastest: {subj} - {format_duration(time)} ({courses} courses)")
                
                if stats['slowest_subject']:
                    subj, time, courses = stats['slowest_subject'] 
                    print(f"   🐌 Slowest: {subj} - {format_duration(time)} ({courses} courses)")
            print()
        
        # Find course files
        print("🔍 Finding course data files...")
        course_files = find_course_files()
        print(f"📁 Found {len(course_files)} course JSON files")
        print()
        
        if not course_files:
            print("❌ No course files found to move")
            return
        
        # Create destination directory
        dest_dir = "web/public/data"
        if not dry_run:
            os.makedirs(dest_dir, exist_ok=True)
            print(f"📂 Destination directory ready: {dest_dir}")
        else:
            print(f"📂 Would create destination directory: {dest_dir}")
        print()
        
        # Validate and categorize files
        valid_files = []
        problematic_files = []
        empty_subjects = []
        
        print("🔍 Validating course files...")
        for file_path in course_files:
            filename = os.path.basename(file_path)
            subject_code = filename[:-5]  # Remove .json extension
            
            is_valid, issues = validate_course_file(file_path, subject_code, progress_data)
            
            if is_valid:
                valid_files.append(file_path)
            else:
                problematic_files.append((file_path, issues))
                # Check if this subject has no courses
                if any("No courses found" in issue for issue in issues):
                    empty_subjects.append(subject_code)
        
        print(f"✅ Valid files: {len(valid_files)}")
        
        # Report subjects with no courses
        if empty_subjects:
            print(f"📭 Subjects with no courses ({len(empty_subjects)}):")
            for i, subject in enumerate(empty_subjects, 1):
                print(f"   {i:2d}. {subject}")
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
                subject_code = filename[:-5]
                print(f"   - {subject_code}: {', '.join(issues)}")
        
        print()
        
        # Determine files to move (all valid files by default)
        files_to_move = valid_files.copy()
        
        # Ask if user wants to include problematic files (single confirmation)
        if problematic_files:
            print(f"📊 Summary:")
            print(f"   ✅ Valid files ready to move: {len(valid_files)}")
            print(f"   ⚠️ Problematic files: {len(problematic_files)}")
            print()
            
            # Restore original stdout for user input
            sys.stdout = logger.terminal
            include_problematic = input("Include problematic files in migration? [y/N]: ").strip().lower()
            sys.stdout = logger  # Restore logging
            
            if include_problematic in ['y', 'yes']:
                files_to_move.extend([file_path for file_path, _ in problematic_files])
                print("➡️ Including all problematic files in migration")
            else:
                print("⏭️ Skipping problematic files")
            print()
        
        # Final confirmation
        print(f"📋 FINAL SUMMARY:")
        print(f"   Files to move: {len(files_to_move)}")
        print(f"   Files to skip: {len(course_files) - len(files_to_move)}")
        print()
        
        if not files_to_move:
            print("❌ No files to move")
            return
        
        if not dry_run:
            # Restore original stdout for user input
            sys.stdout = logger.terminal
            proceed = input("Proceed with moving files? [Y/n]: ").strip().lower()
            sys.stdout = logger  # Restore logging
            
            if proceed in ['n', 'no']:
                print("❌ Operation cancelled by user")
                return
        
        # Move files
        print()
        print("🚀 Moving files...")
        moved_count = 0
        
        for file_path in files_to_move:
            filename = os.path.basename(file_path)
            dest_path = os.path.join(dest_dir, filename)
            
            try:
                if not dry_run:
                    shutil.copy2(file_path, dest_path)
                moved_count += 1
            except Exception as e:
                print(f"❌ Failed to move {filename}: {e}")
        
        if not dry_run:
            print(f"✅ Successfully moved {moved_count} files")
        else:
            print(f"✅ Would move {moved_count} files")
        
        # Final report
        print()
        print("🎉 MIGRATION COMPLETE!")
        print("=" * 30)
        print(f"📁 Total files processed: {len(course_files)}")
        print(f"✅ Files moved: {moved_count}")
        print(f"⏭️ Files skipped: {len(course_files) - moved_count}")
        
        if not dry_run:
            print(f"📂 Destination: {os.path.abspath(dest_dir)}")
        
        # Show final scraping statistics
        if progress_data:
            stats = calculate_scraping_statistics(progress_data)
            if stats:
                print()
                print("📈 SCRAPING PERFORMANCE SUMMARY:")
                print(f"   ⏱️ Total scraping time: {format_duration(stats['total_minutes'])}")
                print(f"   📚 Total courses scraped: {stats['total_courses']:,}")
                print(f"   📋 Subjects completed: {stats['completed_subjects']}")
                print(f"   📖 Efficiency: {stats['avg_time_per_course']:.2f} minutes per course")
                
                # Performance insights
                if stats['fastest_subject'] and stats['slowest_subject']:
                    fast_subj, fast_time, fast_courses = stats['fastest_subject']
                    slow_subj, slow_time, slow_courses = stats['slowest_subject']
                    
                    print()
                    print("🔍 Performance Insights:")
                    print(f"   🏆 Most efficient: {fast_subj} ({fast_time/fast_courses:.2f} min/course)")
                    print(f"   🐢 Least efficient: {slow_subj} ({slow_time/slow_courses:.2f} min/course)")
                    
                    efficiency_ratio = (slow_time/slow_courses) / (fast_time/fast_courses) if fast_courses > 0 else 0
                    print(f"   📊 Efficiency range: {efficiency_ratio:.1f}x difference")
        
        print()
        print(f"📝 Log saved to: {log_filename}")
        
    finally:
        # Restore original stdout and close log file
        sys.stdout = logger.terminal
        logger.close()

if __name__ == "__main__":
    main()