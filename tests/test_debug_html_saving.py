#!/usr/bin/env python3
"""
Test script to verify that debug HTML files are saved for class details pages
"""

from cuhk_scraper import CuhkScraper, ScrapingConfig
import os

def test_debug_html_saving():
    scraper = CuhkScraper()
    config = ScrapingConfig(
        max_courses_per_subject=1,  # Test just 1 course
        save_debug_files=True,      # Enable debug files
        request_delay=2.0
    )

    print('=== Testing Debug HTML File Saving ===')
    print('This will test if sections and class details HTML files are saved')
    
    # Clear old debug files
    debug_files_before = set(f for f in os.listdir('tests/output') if f.endswith('.html'))
    
    # Run scraping with enrollment details to trigger section clicking
    results = scraper.scrape_all_subjects(['CSCI'], get_details=True, get_enrollment_details=True, config=config)
    
    # Check what new debug files were created
    debug_files_after = set(f for f in os.listdir('tests/output') if f.endswith('.html'))
    new_files = debug_files_after - debug_files_before
    
    print(f'\n=== Debug Files Created ===')
    print(f'New HTML files: {len(new_files)}')
    
    sections_files = [f for f in new_files if 'sections_' in f]
    class_details_files = [f for f in new_files if 'class_details_' in f]
    course_details_files = [f for f in new_files if f.startswith('course_details_')]
    
    print(f'- Course details files: {len(course_details_files)}')
    for f in course_details_files:
        print(f'  {f}')
    
    print(f'- Sections files: {len(sections_files)}')
    for f in sections_files:
        print(f'  {f}')
    
    print(f'- Class details files: {len(class_details_files)}')
    for f in class_details_files:
        print(f'  {f}')
    
    print(f'\n=== Results Summary ===')
    if 'CSCI' in results and results['CSCI']:
        course = results['CSCI'][0]
        print(f'Course: {course.course_code} - {course.title}')
        print(f'Terms: {len(course.terms)}')
        
        if course.terms:
            term = course.terms[0]
            print(f'  Term: {term.term_name} ({term.term_code})')
            print(f'  Schedule sections: {len(term.schedule)}')
            
            if term.schedule:
                print('  ✅ Sections found!')
                for section in term.schedule:
                    print(f'    {section["section"]}: {len(section["meetings"])} meetings')
            else:
                print('  ❌ No sections found')
        else:
            print('  ❌ No terms found')
    
    print(f'\n=== Debug File Analysis ===')
    print(f'✅ Course details saved: {len(course_details_files) > 0}')
    print(f'✅ Sections files saved: {len(sections_files) > 0}')
    print(f'✅ Class details saved: {len(class_details_files) > 0}')
    
    if len(class_details_files) > 0:
        print('🎉 SUCCESS: Class details HTML files are being saved!')
    else:
        print('❌ No class details files saved - sections may not be accessible')

if __name__ == "__main__":
    test_debug_html_saving()