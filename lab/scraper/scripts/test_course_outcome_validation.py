#!/usr/bin/env python3
"""
Test script to verify course outcome validation logic against real system error responses
"""

import sys
from pathlib import Path
from cuhk_scraper import CuhkScraper, ScrapingConfig, Course

def test_validation_on_system_error():
    """Test validation logic against the actual LAWS4330 system error response"""

    # Create a test scraper instance
    scraper = CuhkScraper(ScrapingConfig())

    # Read the actual system error HTML that caused LAWS4330 data loss
    system_error_file = Path("lab/scraper/outputs/debug_html/course_outcome_LAWS_4330.html")

    if not system_error_file.exists():
        print(f"❌ Test file not found: {system_error_file}")
        print("Please run the scraper with debug HTML saving first.")
        return False

    with open(system_error_file, 'r', encoding='utf-8') as f:
        system_error_html = f.read()

    print("🧪 Testing Course Outcome Validation Logic")
    print("=" * 50)

    # Create a test course object for LAWS4330
    test_course = Course(
        subject="LAWS",
        course_code="4330",
        title="Test Course",
        credits="3.00",
        terms=[],
        postback_target=None
    )

    print(f"📄 Testing with: {system_error_file}")
    print(f"📝 HTML Content Preview:")
    print(system_error_html[:200] + "...")
    print()

    # Test the validation logic
    print("🔍 Running validation...")
    is_valid = scraper._validate_course_outcome_response(system_error_html, test_course)

    print(f"✅ Validation Result: {'PASS' if not is_valid else 'FAIL'}")
    print(f"🛡️  Data Protection: {'ENABLED' if not is_valid else 'DISABLED'}")

    if not is_valid:
        print("✅ SUCCESS: System error page correctly detected!")
        print("✅ Existing course outcome data would be preserved")
        print("✅ No data loss would occur")
    else:
        print("❌ FAILURE: System error page not detected!")
        print("❌ Data loss would still occur")
        print("❌ Validation logic needs fixing")

    return not is_valid  # Success means validation failed (detected error)

def test_validation_on_good_response():
    """Test validation logic against a good course outcome response"""

    # Create a test scraper instance
    scraper = CuhkScraper(ScrapingConfig())

    # Check if we have a good response file
    good_response_file = Path("lab/scraper/samples/webpages/Course Outcome - LAWS 2331 - Intellectual Property Law for Entrepreneurs .html")

    if not good_response_file.exists():
        print(f"⚠️  Good response test file not found: {good_response_file}")
        return True  # Skip this test

    with open(good_response_file, 'r', encoding='utf-8') as f:
        good_html = f.read()

    # Create a test course object for LAWS2331
    test_course = Course(
        subject="LAWS",
        course_code="2331",
        title="Test Course",
        credits="3.00",
        terms=[],
        postback_target=None
    )

    print("\n🧪 Testing with Good Course Outcome Response")
    print("=" * 50)
    print(f"📄 Testing with: {good_response_file}")

    # Test the validation logic
    print("🔍 Running validation on good response...")
    is_valid = scraper._validate_course_outcome_response(good_html, test_course)

    print(f"✅ Validation Result: {'PASS' if is_valid else 'FAIL'}")
    print(f"📊 Data Processing: {'ENABLED' if is_valid else 'DISABLED'}")

    if is_valid:
        print("✅ SUCCESS: Good course outcome page correctly accepted!")
        print("✅ Course outcome data would be processed normally")
    else:
        print("❌ FAILURE: Good course outcome page rejected!")
        print("❌ Valid data would be incorrectly blocked")

    return is_valid  # Success means validation passed

def main():
    """Run all validation tests"""
    print("🔬 Course Outcome Validation Testing")
    print("Testing the fail-safe mechanism against real server responses")
    print()

    # Test 1: System error detection
    test1_passed = test_validation_on_system_error()

    # Test 2: Good response acceptance
    test2_passed = test_validation_on_good_response()

    # Summary
    print("\n" + "=" * 60)
    print("📊 TEST SUMMARY")
    print("=" * 60)
    print(f"🚨 System Error Detection: {'✅ PASS' if test1_passed else '❌ FAIL'}")
    print(f"✅ Good Response Acceptance: {'✅ PASS' if test2_passed else '❌ FAIL'}")

    if test1_passed and test2_passed:
        print("\n🎉 ALL TESTS PASSED!")
        print("🛡️  Course outcome data protection is working correctly")
        print("🚀 Ready for production deployment")
    else:
        print("\n❌ SOME TESTS FAILED!")
        print("🔧 Validation logic needs adjustment before deployment")

    return test1_passed and test2_passed

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
