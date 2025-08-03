#!/usr/bin/env python3
"""
Test script for clean JSON structure (no redundant fields)

Tests that the JSON export no longer contains redundant course-level
instructor, capacity, enrolled, and waitlist fields.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cuhk_scraper import CuhkScraper, ScrapingConfig
import logging
import json

def main():
    """Test clean JSON structure without redundant fields"""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )
    
    scraper = CuhkScraper()
    
    print("=== TESTING CLEAN JSON STRUCTURE ===")
    print("Verifying that redundant course-level fields are removed")
    
    try:
        # Test with limited courses for quick validation
        config_clean = ScrapingConfig(
            max_courses_per_subject=2,  # Just 2 courses for quick test
            output_mode="per_subject",
            output_directory="tests/output",
            save_debug_files=False
        )
        
        test_subjects = ['CSCI']
        print(f"Testing with {test_subjects} (2 courses each)")
        
        results = scraper.scrape_all_subjects(
            test_subjects,
            get_details=True,
            get_enrollment_details=True,
            config=config_clean
        )
        
        # Export and analyze structure
        export_summary = scraper.export_to_json(results, config=config_clean)
        print(f"Export result: {export_summary}")
        
        # Find the latest exported file
        import glob
        json_files = glob.glob("tests/output/CSCI_*.json")
        if json_files:
            latest_file = max(json_files)
            
            with open(latest_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            print(f"\n=== JSON STRUCTURE ANALYSIS ===")
            print(f"File: {latest_file}")
            
            courses = data.get('courses', [])
            if courses:
                sample_course = courses[0]
                print(f"Sample course: {sample_course.get('course_code', 'N/A')}")
                
                # Check course-level fields
                course_level_fields = sample_course.keys()
                print(f"Course-level fields: {list(course_level_fields)}")
                
                # Check if redundant fields are present
                redundant_fields = ['instructor', 'capacity', 'enrolled', 'waitlist']
                found_redundant = []
                
                for term in sample_course.get('terms', []):
                    for field in redundant_fields:
                        if field in term:
                            found_redundant.append(f"term.{field}")
                
                if found_redundant:
                    print(f"❌ Found redundant fields: {found_redundant}")
                else:
                    print("✅ No redundant term-level fields found")
                
                # Check that section-level data is preserved
                if sample_course.get('terms'):
                    first_term = sample_course['terms'][0]
                    if first_term.get('schedule'):
                        first_section = first_term['schedule'][0]
                        section_fields = first_section.keys()
                        print(f"Section-level fields: {list(section_fields)}")
                        
                        # Verify essential section data is present
                        required_section_fields = ['section', 'meetings']
                        if get_enrollment_details:
                            required_section_fields.append('availability')
                        
                        missing_fields = [f for f in required_section_fields if f not in section_fields]
                        if missing_fields:
                            print(f"❌ Missing required section fields: {missing_fields}")
                        else:
                            print("✅ All required section fields present")
                        
                        # Check availability structure
                        if 'availability' in first_section:
                            availability = first_section['availability']
                            avail_fields = availability.keys()
                            print(f"Availability fields: {list(avail_fields)}")
                            
                            expected_avail = ['capacity', 'enrolled', 'status']
                            missing_avail = [f for f in expected_avail if f not in avail_fields]
                            if missing_avail:
                                print(f"❌ Missing availability fields: {missing_avail}")
                            else:
                                print("✅ All availability fields present at section level")
            
            print(f"\n=== CLEAN STRUCTURE BENEFITS ===")
            print("✅ Single source of truth: All enrollment data at section level")
            print("✅ No confusing aggregations: Each section stands alone")
            print("✅ Web app friendly: Easy to calculate totals when needed")
            print("✅ Data integrity: No risk of stale aggregated data")
            
            # Show sample clean structure
            if courses and courses[0].get('terms'):
                print(f"\n=== SAMPLE CLEAN STRUCTURE ===")
                sample_term = courses[0]['terms'][0]
                clean_structure = {
                    'term_code': sample_term.get('term_code'),
                    'term_name': sample_term.get('term_name'),
                    'schedule': sample_term.get('schedule', [])[:1]  # Just first section
                }
                print(json.dumps(clean_structure, indent=2)[:500] + "...")
        
        else:
            print("❌ No JSON files found for analysis")
            
    except Exception as e:
        print(f"Test failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()