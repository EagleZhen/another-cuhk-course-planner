#!/usr/bin/env python3
"""
Test script for per-subject export functionality

Tests both single-file and per-subject export modes with multiple subjects
to validate proper file separation.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cuhk_scraper import CuhkScraper, ScrapingConfig
import logging
import json

def main():
    """Test per-subject export functionality"""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )
    
    scraper = CuhkScraper()
    
    # Test with multiple subjects to validate separation
    test_subjects = ['CSCI', 'AIST']
    print(f"Testing per-subject export with subjects: {test_subjects}")
    
    try:
        print("\n=== TEST 1: Single File Mode (Testing Default) ===")
        config_single = ScrapingConfig(
            max_courses_per_subject=2,  # Limit for testing
            output_mode="single_file",
            output_directory="tests/output"
        )
        
        results_single = scraper.scrape_all_subjects(
            test_subjects, 
            get_details=True, 
            get_enrollment_details=True,
            config=config_single
        )
        
        export_result_single = scraper.export_to_json(results_single, config=config_single)
        print(f"Single file export: {export_result_single}")
        
        print("\n=== TEST 2: Per-Subject Mode (Production Style) ===")
        config_per_subject = ScrapingConfig(
            max_courses_per_subject=2,  # Limit for testing
            output_mode="per_subject",
            output_directory="data",
            save_debug_files=False  # Clean output
        )
        
        results_per_subject = scraper.scrape_all_subjects(
            test_subjects,
            get_details=True,
            get_enrollment_details=True, 
            config=config_per_subject
        )
        
        export_result_per_subject = scraper.export_to_json(results_per_subject, config=config_per_subject)
        print(f"Per-subject export: {export_result_per_subject}")
        
        print("\n=== VALIDATION ===")
        # Validate that files were created correctly
        validate_exports(test_subjects, config_single, config_per_subject)
        
        print("\n=== TEST 3: Production Workflow Method ===")
        print("Testing the convenience method scrape_and_export_production()...")
        print("(Would run: scraper.scrape_and_export_production(['CSCI', 'AIST']))")
        print("This would create unlimited courses per subject in /data/ directory")
        
    except Exception as e:
        print(f"Test failed: {e}")
        import traceback
        traceback.print_exc()

def validate_exports(subjects, config_single, config_per_subject):
    """Validate that exports were created correctly"""
    import glob
    
    print("Checking single file export...")
    single_files = glob.glob(f"{config_single.output_directory}/cuhk_courses_*.json")
    if single_files:
        latest_single = max(single_files)
        with open(latest_single, 'r', encoding='utf-8') as f:
            single_data = json.load(f)
        print(f"  ✅ Single file contains {len(single_data['subjects'])} subjects")
        for subject in subjects:
            if subject in single_data['subjects']:
                course_count = len(single_data['subjects'][subject])
                print(f"  ✅ {subject}: {course_count} courses")
            else:
                print(f"  ❌ {subject}: missing")
    
    print("\nChecking per-subject files...")
    for subject in subjects:
        subject_files = glob.glob(f"{config_per_subject.output_directory}/{subject}_*.json")
        if subject_files:
            latest_subject = max(subject_files)
            with open(latest_subject, 'r', encoding='utf-8') as f:
                subject_data = json.load(f)
            course_count = len(subject_data['courses'])
            print(f"  ✅ {subject}: {course_count} courses in {os.path.basename(latest_subject)}")
        else:
            print(f"  ❌ {subject}: no file found")

if __name__ == "__main__":
    main()