#!/usr/bin/env python3
"""
Debug script to simulate the exact HTML-to-Markdown conversion process
that happens in the scraper for Course Outcome data.
"""

from bs4 import BeautifulSoup
import os
import sys

def test_html_conversion():
    """Simulate the exact process that happens in the scraper"""
    
    # Path to the sample HTML file
    html_file = "tests/sample-webpages/Course Outcome - Recommended Reading - List.html"
    
    if not os.path.exists(html_file):
        print(f"ERROR: File not found: {html_file}")
        print("Please create the file with the HTML content from the span element")
        return
    
    # Read the HTML content
    with open(html_file, 'r', encoding='utf-8') as f:
        html_content = f.read()
    
    print("=== STEP 1: Raw HTML Input ===")
    print(f"File: {html_file}")
    print(f"Length: {len(html_content)} characters")
    print("First 200 chars:", repr(html_content[:200]))
    print()
    
    # Parse with BeautifulSoup (same as scraper)
    print("=== STEP 2: BeautifulSoup Parsing ===")
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # Try to find the span (if the file contains the full page)
    recommended_reading_span = soup.find('span', {'id': 'uc_course_outcome_lbl_rec_reading'})
    
    if recommended_reading_span:
        print("✅ Found span with id 'uc_course_outcome_lbl_rec_reading'")
        span_html = str(recommended_reading_span)
    else:
        print("⚠️ No span with id found, assuming file contains just the span content")
        span_html = str(soup)
    
    print(f"Span HTML length: {len(span_html)} characters")
    print("First 200 chars of span HTML:", repr(span_html[:200]))
    print()
    
    # Convert to markdown (same as scraper)
    print("=== STEP 3: HTML to Markdown Conversion ===")
    
    try:
        import markdownify
        print("✅ markdownify library available")
        
        # This is the exact call that happens in _html_to_markdown
        markdown_result = markdownify.markdownify(span_html, heading_style="ATX")
        
        print(f"Markdown result length: {len(markdown_result)} characters")
        print("Markdown result:", repr(markdown_result))
        print()
        print("=== STEP 4: Analysis ===")
        
        # Check for the problematic artifacts
        if "if !supportLists?" in markdown_result:
            print("🔴 FOUND: 'if !supportLists?' artifact!")
            print("Locations:", [i for i in range(len(markdown_result)) if markdown_result[i:].startswith("if !supportLists?")])
        
        if "endif?" in markdown_result:
            print("🔴 FOUND: 'endif?' artifact!")
            print("Locations:", [i for i in range(len(markdown_result)) if markdown_result[i:].startswith("endif?")])
        
        if "<!--[if !supportLists]-->" in span_html:
            print("🔍 ORIGINAL: Found '<!--[if !supportLists]-->' in HTML")
        
        if "<!--[endif]-->" in span_html:
            print("🔍 ORIGINAL: Found '<!--[endif]-->' in HTML")
            
        print()
        print("=== STEP 5: Detailed Comparison ===")
        
        # Find where the transformation happens
        if "<!--[if !supportLists]-->" in span_html and "if !supportLists?" in markdown_result:
            print("🎯 TRANSFORMATION DETECTED:")
            print("  HTML: <!--[if !supportLists]-->")
            print("  →    if !supportLists?")
            print()
            print("This suggests markdownify is converting HTML comments incorrectly!")
        
    except ImportError:
        print("❌ markdownify library not available")
        return
        
    except Exception as e:
        print(f"❌ Error during conversion: {e}")
        return

if __name__ == "__main__":
    test_html_conversion()