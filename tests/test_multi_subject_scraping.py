#!/usr/bin/env python3
"""
Test script for multi-subject scraping with CSCI, AIST, FINA, PHYS
Tests production readiness without modifying core scraper code
"""

import logging
import time
from cuhk_scraper import CuhkScraper, ScrapingConfig

def test_multi_subject_scraping():
    """Test scraping with 4 different subjects to validate production readiness"""
    
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )
    
    print("=== MULTI-SUBJECT SCRAPING TEST ===")
    print("Testing subjects: CSCI, AIST, FINA, PHYS")
    print("Purpose: Validate production readiness and scalability")
    
    # Create test configuration with improved debug file organization
    config = ScrapingConfig(
        max_courses_per_subject=None,  # No limit - get all courses
        save_debug_files=True,         # Keep debug files for analysis
        request_delay=2.0,             # Safe server-friendly delays
        max_retries=10,
        output_mode="per_subject",     # Each subject gets its own JSON file
        output_directory="tests/output",  # Follow project directory structure
        track_progress=True,           # Enable progress tracking for periodic saves
    )
    
    # Initialize scraper
    scraper = CuhkScraper()
    
    # Test subjects (diverse selection across different faculties)
    test_subjects = ["CSCI", "AIST", "FINA", "PHYS"]
    
    print(f"\nStarting test with config:")
    print(f"- Max courses per subject: {config.max_courses_per_subject}")
    print(f"- Request delay: {config.request_delay}s")
    print(f"- Debug files: {config.save_debug_files}")
    print(f"- Debug HTML directory: {config.debug_html_directory}")
    print(f"- Output mode: {config.output_mode} (each subject → separate JSON file)")
    print(f"- JSON output directory: {config.output_directory}")
    
    # Track timing
    start_time = time.time()
    
    try:
        # Use existing scraper method - no code changes needed!
        print(f"\n=== SCRAPING STARTED ===")
        results = scraper.scrape_all_subjects(
            test_subjects, 
            get_details=True,           # Full course details
            get_enrollment_details=True, # Enrollment data
            config=config
        )
        
        # Export results using existing method
        json_file = scraper.export_to_json(results, config)
        
        # Calculate timing
        duration_minutes = (time.time() - start_time) / 60
        
        # Print summary
        print(f"\n=== TEST RESULTS SUMMARY ===")
        print(f"Duration: {duration_minutes:.1f} minutes")
        print(f"Subjects processed: {len(results)}")
        
        total_courses = 0
        for subject, courses in results.items():
            course_count = len(courses)
            total_courses += course_count
            print(f"  {subject}: {course_count} courses")
            
            # Show first course as sample
            if courses:
                sample_course = courses[0]
                terms_count = len(sample_course.terms)
                print(f"    Sample: {sample_course.course_code} - {sample_course.title}")
                print(f"    Terms: {terms_count}")
        
        print(f"\nTotal courses scraped: {total_courses}")
        print(f"Average: {total_courses / len(test_subjects):.1f} courses per subject")
        print(f"Speed: {total_courses / duration_minutes:.1f} courses per minute")
        print(f"Results exported to: {json_file}")
        
        # Validate data quality
        print(f"\n=== DATA QUALITY CHECK ===")
        for subject, courses in results.items():
            courses_with_schedules = sum(1 for course in courses if any(term.schedule for term in course.terms))
            schedule_percentage = (courses_with_schedules / len(courses) * 100) if courses else 0
            print(f"{subject}: {courses_with_schedules}/{len(courses)} courses have schedules ({schedule_percentage:.1f}%)")
        
        print(f"\n✅ Multi-subject test completed successfully!")
        return True
        
    except KeyboardInterrupt:
        print(f"\n❌ Test interrupted by user")
        return False
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    finally:
        duration_minutes = (time.time() - start_time) / 60
        print(f"\nTest duration: {duration_minutes:.1f} minutes")

if __name__ == "__main__":
    success = test_multi_subject_scraping()
    exit(0 if success else 1)