#!/usr/bin/env python3
"""
Test the improved debug file organization
Tests that HTML files go to separate debug directory
"""

import os
import shutil
from cuhk_scraper import CuhkScraper, ScrapingConfig

def test_debug_file_organization():
    """Test that debug files are properly organized in separate directory"""
    
    print("=== DEBUG FILE ORGANIZATION TEST ===")
    
    # Clean up any existing debug files
    debug_dir = "tests/output/debug_html"
    if os.path.exists(debug_dir):
        shutil.rmtree(debug_dir)
        print(f"Cleaned up existing debug directory: {debug_dir}")
    
    # Create test configuration with separate debug directory
    config = ScrapingConfig(
        max_courses_per_subject=1,  # Only 1 course for quick test
        save_debug_files=True,      # Enable debug files
        debug_html_directory="tests/output/debug_html",  # Separate debug folder
        output_directory="tests/output",  # JSON results in main folder
        request_delay=2.0
    )
    
    print(f"Testing with:")
    print(f"- Debug HTML directory: {config.debug_html_directory}")
    print(f"- JSON output directory: {config.output_directory}")
    print(f"- Debug files enabled: {config.save_debug_files}")
    
    # Initialize scraper and test with one subject
    scraper = CuhkScraper()
    
    try:
        print(f"\n=== SCRAPING TEST SUBJECT ===")
        results = scraper.scrape_all_subjects(
            ["CSCI"],  # Just one subject for quick test
            get_details=True,
            get_enrollment_details=False,  # Skip enrollment details for speed
            config=config
        )
        
        # Export JSON results
        json_summary = scraper.export_to_json(results, config)
        print(f"JSON export: {json_summary}")
        
        # Check file organization
        print(f"\n=== FILE ORGANIZATION CHECK ===")
        
        # Check if debug directory was created
        debug_exists = os.path.exists(debug_dir)
        print(f"Debug directory exists: {debug_exists}")
        
        if debug_exists:
            debug_files = [f for f in os.listdir(debug_dir) if f.endswith('.html')]
            print(f"Debug HTML files found: {len(debug_files)}")
            for f in debug_files[:5]:  # Show first 5
                print(f"  - {f}")
            if len(debug_files) > 5:
                print(f"  ... and {len(debug_files) - 5} more")
        
        # Check JSON files are in main output directory
        json_files = [f for f in os.listdir("tests/output") if f.endswith('.json')]
        html_files_in_output = [f for f in os.listdir("tests/output") if f.endswith('.html')]
        
        print(f"\nMain output directory:")
        print(f"  JSON files: {len(json_files)}")
        print(f"  HTML files: {len(html_files_in_output)} (should be 0 with new organization)")
        
        # Success criteria
        success = (debug_exists and 
                  len(debug_files) > 0 and 
                  len(html_files_in_output) == 0 and
                  len(json_files) > 0)
        
        if success:
            print(f"\n✅ SUCCESS: Debug files properly organized!")
            print(f"  - HTML debug files: {debug_dir}/")
            print(f"  - JSON results: tests/output/")
            print(f"  - Clean separation achieved")
        else:
            print(f"\n❌ ISSUE: File organization needs improvement")
            if not debug_exists:
                print("  - Debug directory not created")
            if len(html_files_in_output) > 0:
                print(f"  - {len(html_files_in_output)} HTML files still in main output")
            if len(debug_files) == 0:
                print("  - No debug files saved")
        
        return success
        
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_debug_file_organization()
    exit(0 if success else 1)