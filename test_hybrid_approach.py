#!/usr/bin/env python3
"""
Test script for hybrid approach: compare current vs enrollment details parsing
"""

from cuhk_scraper import CuhkScraper
import json
import time


def test_performance_comparison():
    """Compare performance between current and enrollment details approaches"""
    print("=== HYBRID APPROACH PERFORMANCE TEST ===")
    print("Testing with CSCI courses (known to work well)")
    print("-" * 60)
    
    scraper = CuhkScraper()
    
    # Test 1: Current approach (fast)
    print("\n🚀 TEST 1: Current Approach (Status Icons)")
    start_time = time.time()
    results_fast = scraper.scrape_all_subjects(['CSCI'], get_details=True, get_enrollment_details=False)
    fast_time = time.time() - start_time
    
    json_file_fast = scraper.export_to_json(results_fast)
    print(f"✅ Completed in {fast_time:.2f} seconds")
    print(f"📄 JSON saved: {json_file_fast}")
    
    # Test 2: Hybrid approach (detailed enrollment)
    print("\n📊 TEST 2: Hybrid Approach (Detailed Enrollment)")
    start_time = time.time()
    results_detailed = scraper.scrape_all_subjects(['CSCI'], get_details=True, get_enrollment_details=True)
    detailed_time = time.time() - start_time
    
    json_file_detailed = scraper.export_to_json(results_detailed)
    print(f"✅ Completed in {detailed_time:.2f} seconds")
    print(f"📄 JSON saved: {json_file_detailed}")
    
    # Performance comparison
    print("\n📈 PERFORMANCE COMPARISON")
    print("-" * 40)
    print(f"Current approach:  {fast_time:.2f}s")
    print(f"Detailed approach: {detailed_time:.2f}s")
    print(f"Time difference:   {detailed_time - fast_time:.2f}s ({detailed_time/fast_time:.1f}x slower)")
    
    # Data quality comparison
    print("\n📊 DATA QUALITY COMPARISON")
    print("-" * 40)
    
    if 'CSCI' in results_fast and 'CSCI' in results_detailed:
        # Compare first course
        fast_course = results_fast['CSCI'][0] if results_fast['CSCI'] else None
        detailed_course = results_detailed['CSCI'][0] if results_detailed['CSCI'] else None
        
        if fast_course and detailed_course and fast_course.terms and detailed_course.terms:
            fast_section = fast_course.terms[0].schedule[0] if fast_course.terms[0].schedule else {}
            detailed_section = detailed_course.terms[0].schedule[0] if detailed_course.terms[0].schedule else {}
            
            print("Current approach sample section:")
            print(f"  Section: {fast_section.get('section', 'N/A')}")
            print(f"  Status: {fast_section.get('status', 'N/A')}")
            print(f"  Meetings: {len(fast_section.get('meetings', []))}")
            
            print("\nDetailed approach sample section:")
            print(f"  Section: {detailed_section.get('section', 'N/A')}")
            if 'availability' in detailed_section:
                avail = detailed_section['availability']
                print(f"  Status: {avail.get('status', 'N/A')}")
                print(f"  Capacity: {avail.get('capacity', 'N/A')}")
                print(f"  Enrolled: {avail.get('enrolled', 'N/A')}")
                print(f"  Available: {avail.get('available_seats', 'N/A')}")
                print(f"  Waitlist: {avail.get('waitlist_total', 'N/A')}")
            print(f"  Meetings: {len(detailed_section.get('meetings', []))}")
    
    return results_fast, results_detailed, fast_time, detailed_time


def analyze_enrollment_data(results):
    """Analyze enrollment data from detailed results"""
    print("\n🔍 ENROLLMENT DATA ANALYSIS")
    print("-" * 40)
    
    total_sections = 0
    status_counts = {'Open': 0, 'Closed': 0, 'Waitlisted': 0, 'Unknown': 0}
    capacity_total = 0
    enrolled_total = 0
    available_total = 0
    waitlist_total = 0
    
    for subject, courses in results.items():
        for course in courses:
            for term in course.terms:
                for section in term.schedule:
                    total_sections += 1
                    
                    if 'availability' in section:
                        avail = section['availability']
                        status = avail.get('status', 'Unknown')
                        status_counts[status] = status_counts.get(status, 0) + 1
                        
                        # Aggregate numbers
                        try:
                            capacity_total += int(avail.get('capacity', 0) or 0)
                            enrolled_total += int(avail.get('enrolled', 0) or 0)
                            available_total += int(avail.get('available_seats', 0) or 0)
                            waitlist_total += int(avail.get('waitlist_total', 0) or 0)
                        except (ValueError, TypeError):
                            pass
    
    print(f"Total sections analyzed: {total_sections}")
    print(f"Status distribution:")
    for status, count in status_counts.items():
        if total_sections > 0:
            percentage = count / total_sections * 100
            print(f"  {status}: {count} ({percentage:.1f}%)")
    
    print(f"\nAggregate enrollment data:")
    print(f"  Total capacity: {capacity_total}")
    print(f"  Total enrolled: {enrolled_total}")
    print(f"  Total available: {available_total}")
    print(f"  Total waitlisted: {waitlist_total}")
    
    if capacity_total > 0:
        utilization = enrolled_total / capacity_total * 100
        print(f"  Utilization rate: {utilization:.1f}%")


if __name__ == "__main__":
    try:
        results_fast, results_detailed, fast_time, detailed_time = test_performance_comparison()
        
        # Analyze detailed enrollment data
        if results_detailed:
            analyze_enrollment_data(results_detailed)
        
        print(f"\n🎯 RECOMMENDATION")
        print("-" * 40)
        if detailed_time / fast_time < 3:
            print("✅ Hybrid approach is reasonably fast (less than 3x slower)")
            print("💡 Recommend enabling enrollment details for data-rich applications")
        else:
            print("⚠️  Hybrid approach is significantly slower")
            print("💡 Recommend using current approach for fast scraping")
            print("💡 Use hybrid approach only when precise enrollment data is needed")
            
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()