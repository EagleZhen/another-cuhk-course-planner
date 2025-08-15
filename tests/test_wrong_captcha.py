#!/usr/bin/env python3
"""
Test script to intentionally submit wrong captcha answers to validate our detection logic
"""

import sys
import logging
from cuhk_scraper import CuhkScraper, ScrapingConfig

class TestCaptchaScraper(CuhkScraper):
    """Test scraper that intentionally provides wrong captcha answers"""
    
    def __init__(self):
        super().__init__()
        self.wrong_captcha_count = 0
        
    def _solve_captcha(self, image_bytes):
        """Override to return intentionally wrong captcha answers for testing"""
        
        # For the first 2 attempts, return obviously wrong answers
        if self.wrong_captcha_count < 2:
            self.wrong_captcha_count += 1
            wrong_answer = f"WR0{self.wrong_captcha_count}"  # Obviously wrong format
            self.logger.info(f"🧪 TEST: Intentionally returning wrong captcha: {wrong_answer}")
            return wrong_answer
        else:
            # After 2 wrong attempts, fall back to real OCR
            self.logger.info(f"🧪 TEST: Switching to real OCR after {self.wrong_captcha_count} wrong attempts")
            return super()._solve_captcha(image_bytes)

def test_wrong_captcha_detection():
    """Test our captcha validation with intentionally wrong answers"""
    
    # Setup logging
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    logger = logging.getLogger(__name__)
    
    logger.info("🧪 Testing wrong captcha detection with live server")
    logger.info("📝 This test will intentionally submit wrong captchas to verify rejection detection")
    
    # Create test scraper that gives wrong answers
    scraper = TestCaptchaScraper()
    
    # Test with a subject that should exist
    test_subject = 'CSCI'
    
    # Use config with more retries to see the progression
    config = ScrapingConfig(
        max_courses_per_subject=1,  # Minimal for testing
        max_retries=3,              # Allow enough retries to see wrong→correct progression
        save_debug_files=True,      # Save responses for analysis
        save_debug_on_error=True
    )
    
    logger.info(f"🎯 Testing with subject: {test_subject}")
    logger.info("Expected behavior:")
    logger.info("  1. First 2 attempts should be rejected (wrong captcha)")
    logger.info("  2. 3rd attempt should use real OCR and succeed")
    
    try:
        courses = scraper.scrape_subject(
            subject_code=test_subject,
            get_details=False,
            get_enrollment_details=False,
            config=config
        )
        
        if courses:
            logger.info(f"✅ SUCCESS: Eventually found {len(courses)} courses after wrong captcha attempts")
            logger.info(f"📚 Sample course: {courses[0].course_code}: {courses[0].title}")
        else:
            logger.warning("⚠️  No courses found - this could indicate the validation isn't working properly")
        
    except Exception as e:
        logger.error(f"❌ Test failed with error: {e}")
    
    logger.info("🏁 Wrong captcha test complete!")
    logger.info("💡 Check the logs above to verify:")
    logger.info("   - Wrong captchas were properly rejected by server")
    logger.info("   - Our validation detected the rejections") 
    logger.info("   - Retry logic eventually succeeded with correct captcha")

if __name__ == "__main__":
    test_wrong_captcha_detection()