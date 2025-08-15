#!/usr/bin/env python3
"""
Test script for the enhanced captcha validation system
"""

import sys
import logging
from cuhk_scraper import CuhkScraper, ScrapingConfig

def test_captcha_validation():
    """Test the enhanced captcha validation with a known subject"""
    
    # Setup logging
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    logger = logging.getLogger(__name__)
    
    logger.info("🧪 Testing enhanced captcha validation system")
    
    # Create scraper instance
    scraper = CuhkScraper()
    
    # Test with a subject that should have courses (CSCI) and one that might be empty (AENP)
    test_subjects = ['CSCI', 'AENP']
    
    # Use limited config for testing
    config = ScrapingConfig(
        max_courses_per_subject=3,  # Limit courses for faster testing
        max_retries=2,              # Fewer retries for testing
        save_debug_files=True,      # Save debug files to analyze
        save_debug_on_error=True
    )
    
    results = {}
    
    for subject in test_subjects:
        logger.info(f"\n🔬 Testing subject: {subject}")
        
        try:
            courses = scraper.scrape_subject(
                subject_code=subject,
                get_details=False,  # Skip details for faster testing
                get_enrollment_details=False,
                config=config
            )
            
            results[subject] = {
                'success': True,
                'course_count': len(courses),
                'courses': [f"{c.course_code}: {c.title}" for c in courses[:3]]  # First 3 for display
            }
            
            logger.info(f"✅ {subject}: {len(courses)} courses found")
            
        except Exception as e:
            results[subject] = {
                'success': False,
                'error': str(e)
            }
            logger.error(f"❌ {subject}: Failed with error: {e}")
    
    # Print summary
    logger.info("\n📊 Test Results Summary:")
    for subject, result in results.items():
        if result['success']:
            logger.info(f"  {subject}: ✅ {result['course_count']} courses")
            if result['courses']:
                for course in result['courses']:
                    logger.info(f"    - {course}")
        else:
            logger.info(f"  {subject}: ❌ Error: {result['error']}")
    
    # Test the validation method directly with sample HTML
    logger.info("\n🧪 Testing validation method with sample files...")
    
    try:
        # Test with invalid captcha response
        with open('tests/sample-webpages/Invalid Verification Code - AENP.html', 'r', encoding='utf-8') as f:
            invalid_html = f.read()
        
        validation = scraper._validate_captcha_response(invalid_html)
        logger.info(f"Invalid captcha validation: {validation}")
        
        # Test with no records response  
        with open('tests/sample-webpages/No record found - AENP.html', 'r', encoding='utf-8') as f:
            no_records_html = f.read()
        
        validation = scraper._validate_captcha_response(no_records_html)
        logger.info(f"No records validation: {validation}")
        
    except FileNotFoundError as e:
        logger.warning(f"Sample files not found for validation testing: {e}")
    
    logger.info("🏁 Testing complete!")

if __name__ == "__main__":
    test_captcha_validation()