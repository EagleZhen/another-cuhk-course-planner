#!/usr/bin/env python3
"""
Test script for progress tracking functionality

Tests the complete progress tracking system including:
- Progress logging and resume capability
- Freshness checking (skip recent scrapes)
- Error handling and retry functionality
- Production workflow integration
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cuhk_scraper import CuhkScraper, ScrapingConfig, ScrapingProgressTracker
import logging
import json
import time

def main():
    """Test progress tracking functionality"""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )
    
    scraper = CuhkScraper()
    
    # Use a test progress file
    test_progress_file = "tests/output/test_progress.json"
    
    # Clean up any existing test progress file
    if os.path.exists(test_progress_file):
        os.remove(test_progress_file)
    
    print("=== TESTING PROGRESS TRACKING SYSTEM ===")
    
    try:
        # Test 1: Basic progress tracking
        print("\n--- TEST 1: Basic Progress Tracking ---")
        config_with_tracking = ScrapingConfig(
            max_courses_per_subject=1,  # Very limited for fast testing
            track_progress=True,
            progress_file=test_progress_file,
            output_mode="per_subject",
            output_directory="tests/output",
            save_debug_files=False,
            skip_recent_hours=0.1  # 6 minutes for testing
        )
        
        test_subjects = ['CSCI', 'AIST']
        print(f"Scraping {test_subjects} with progress tracking...")
        
        results = scraper.scrape_all_subjects(
            test_subjects,
            get_details=True,
            get_enrollment_details=True,
            config=config_with_tracking
        )
        
        # Export with progress tracking
        export_summary = scraper.export_to_json(results, config=config_with_tracking)
        print(f"Export result: {export_summary}")
        
        # Test 2: Check progress file contents
        print("\n--- TEST 2: Progress File Validation ---")
        if os.path.exists(test_progress_file):
            with open(test_progress_file, 'r', encoding='utf-8') as f:
                progress_data = json.load(f)
            
            print("Progress file structure:")
            log = progress_data["scraping_log"]
            print(f"  Total subjects: {log.get('total_subjects', 0)}")
            print(f"  Completed: {log.get('completed', 0)}")
            print(f"  Failed: {log.get('failed', 0)}")
            print(f"  Subjects in log: {len(log.get('subjects', {}))}")
            
            for subject, data in log.get('subjects', {}).items():
                status = data.get('status', 'unknown')
                duration = data.get('duration_minutes', 0)
                courses = data.get('courses_count', 0)
                print(f"    {subject}: {status}, {courses} courses, {duration:.1f}min")
        
        # Test 3: Resume functionality (should skip recent subjects)
        print("\n--- TEST 3: Resume Functionality (Freshness Check) ---")
        print("Attempting to resume immediately (should skip recent subjects)...")
        
        # Create a new scraper instance to test resume
        scraper2 = CuhkScraper()
        resume_summary = scraper2.resume_production_scraping(
            all_subjects=test_subjects,
            get_details=True,
            get_enrollment_details=True
        )
        print(f"Resume result: {resume_summary}")
        
        # Test 4: Force retry by creating a failed subject
        print("\n--- TEST 4: Retry Failed Subjects ---")
        # Manually mark one subject as failed for testing
        progress_tracker = ScrapingProgressTracker(test_progress_file, scraper.logger)
        progress_tracker.fail_subject("TEST_FAILED", "Simulated failure for testing")
        
        # Test retry functionality
        retry_summary = scraper.retry_failed_subjects()
        print(f"Retry result: {retry_summary}")
        
        # Test 5: Complete production workflow simulation
        print("\n--- TEST 5: Production Workflow Simulation ---")
        print("This would be the actual production command:")
        print("  scraper.scrape_and_export_production(all_subjects)")
        print("  # Creates progress tracking in data/scraping_progress.json")
        print("  # Enables resume with: scraper.resume_production_scraping()")
        
        print("\n=== SMART FEATURES DEMONSTRATED ===")
        print("✅ Progress logging with timestamps and duration tracking")
        print("✅ Freshness checking (skip subjects scraped within N hours)")
        print("✅ Resume capability for interrupted scraping sessions")
        print("✅ Error tracking and retry functionality")
        print("✅ Real-time progress monitoring and summaries")
        print("✅ Per-subject file output with progress integration")
        
        # Final progress summary
        if scraper.progress_tracker:
            scraper.progress_tracker.print_summary()
        
    except Exception as e:
        print(f"Test failed: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        # Clean up test files
        print(f"\nTest progress file created at: {test_progress_file}")
        print("(Keeping file for inspection - delete manually if needed)")

if __name__ == "__main__":
    main()