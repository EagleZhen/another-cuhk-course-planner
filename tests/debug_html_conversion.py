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
        print("=== STEP 5: Detailed Output Files ===")
        
        # Write step-by-step output for analysis
        output_dir = "tests/output/debug_html_conversion"
        os.makedirs(output_dir, exist_ok=True)
        
        # Step 1: Original HTML (first 2000 chars for analysis)
        with open(f"{output_dir}/step1_original_html.txt", "w", encoding="utf-8") as f:
            f.write("=== ORIGINAL HTML (first 2000 chars) ===\n")
            f.write(html_content[:2000])
            f.write("\n\n=== FULL LENGTH ===\n")
            f.write(f"Total length: {len(html_content)} characters")
        
        # Step 2: Span HTML (BeautifulSoup processed)
        with open(f"{output_dir}/step2_span_html.txt", "w", encoding="utf-8") as f:
            f.write("=== SPAN HTML (BeautifulSoup processed) ===\n")
            f.write(span_html[:2000])
            f.write("\n\n=== FULL LENGTH ===\n")
            f.write(f"Total length: {len(span_html)} characters")
        
        # Step 3: Raw markdown result
        with open(f"{output_dir}/step3_raw_markdown.txt", "w", encoding="utf-8") as f:
            f.write("=== RAW MARKDOWN RESULT ===\n")
            f.write(repr(markdown_result))
            f.write("\n\n=== READABLE VERSION ===\n")
            f.write(markdown_result)
        
        # Step 4: Clean markdown for preview
        with open(f"{output_dir}/step4_markdown_preview.md", "w", encoding="utf-8") as f:
            f.write(markdown_result)
        
        # Step 5: Analysis of whitespace
        with open(f"{output_dir}/step5_whitespace_analysis.txt", "w", encoding="utf-8") as f:
            f.write("=== WHITESPACE ANALYSIS ===\n")
            f.write(f"Markdown length: {len(markdown_result)} characters\n")
            f.write(f"Leading whitespace: {len(markdown_result) - len(markdown_result.lstrip())} characters\n")
            f.write(f"Trailing whitespace: {len(markdown_result) - len(markdown_result.rstrip())} characters\n")
            
            # Count different types of whitespace
            spaces = markdown_result.count(' ')
            tabs = markdown_result.count('\t')
            newlines = markdown_result.count('\n')
            
            f.write(f"Space characters: {spaces}\n")
            f.write(f"Tab characters: {tabs}\n")
            f.write(f"Newline characters: {newlines}\n")
            
            # Show first 200 characters with whitespace visible
            f.write(f"\nFirst 200 chars (repr): {repr(markdown_result[:200])}\n")
            
            # Check for non-breaking spaces
            nbsp_count = markdown_result.count('\xa0')
            f.write(f"Non-breaking spaces (\\xa0): {nbsp_count}\n")
            
            if nbsp_count > 0:
                f.write("⚠️ Found non-breaking spaces - likely from Word HTML!\n")
        
        # Step 6: Cleaned markdown (potential fix)
        import re
        cleaned_markdown = markdown_result
        # Replace non-breaking spaces with regular spaces
        cleaned_markdown = cleaned_markdown.replace('\xa0', ' ')
        # Clean up excessive whitespace while preserving structure
        cleaned_markdown = re.sub(r'^\s+', '', cleaned_markdown, flags=re.MULTILINE)  # Remove leading whitespace from each line
        cleaned_markdown = re.sub(r' +', ' ', cleaned_markdown)    # Multiple spaces → single space
        cleaned_markdown = re.sub(r'\n\s*\n\s*\n+', '\n\n', cleaned_markdown)  # Multiple newlines → double newlines
        cleaned_markdown = cleaned_markdown.strip()
        
        with open(f"{output_dir}/step6_cleaned_markdown.md", "w", encoding="utf-8") as f:
            f.write(cleaned_markdown)
        
        with open(f"{output_dir}/step6_cleaned_analysis.txt", "w", encoding="utf-8") as f:
            f.write("=== CLEANED MARKDOWN ANALYSIS ===\n")
            f.write(f"Original length: {len(markdown_result)} characters\n")
            f.write(f"Cleaned length: {len(cleaned_markdown)} characters\n")
            f.write(f"Reduction: {len(markdown_result) - len(cleaned_markdown)} characters\n")
            f.write(f"\nOriginal first line: {repr(markdown_result.split(chr(10))[0])}\n")
            f.write(f"Cleaned first line: {repr(cleaned_markdown.split(chr(10))[0])}\n")
        
        print(f"📁 Step-by-step analysis written to {output_dir}/:")
        print("  - step1_original_html.txt")
        print("  - step2_span_html.txt")
        print("  - step3_raw_markdown.txt")
        print("  - step4_markdown_preview.md")
        print("  - step5_whitespace_analysis.txt")
        print("  - step6_cleaned_markdown.md (✨ cleaned version)")
        print("  - step6_cleaned_analysis.txt")
        
        print()
        print("=== STEP 6: Conclusion ===")
        
        # Find where the transformation happens
        if "<!--[if !supportLists]-->" in span_html and "if !supportLists?" in markdown_result:
            print("🎯 TRANSFORMATION DETECTED:")
            print("  HTML: <!--[if !supportLists]-->")
            print("  →    if !supportLists?")
            print()
            print("❌ This suggests markdownify is converting HTML comments incorrectly!")
        else:
            print("✅ NO PROBLEMATIC TRANSFORMATION DETECTED!")
            print("✅ markdownify is working correctly!")
            print("✅ The artifacts in HIST.json must be from a different source.")
            print()
            print("🔍 Possible explanations:")
            print("  1. HIST.json was generated before markdownify implementation")
            print("  2. markdownify failed and fallback _clean_text() was used")
            print("  3. Different HTML structure during live scraping")
            
            # Check for common HTML comment patterns
            html_comments = [
                "<!--[if !supportLists]-->",
                "<!--[endif]-->", 
                "if !supportLists?",
                "endif?"
            ]
            
            print("\n=== PATTERN ANALYSIS ===")
            for pattern in html_comments:
                in_html = pattern in span_html
                in_markdown = pattern in markdown_result
                status = "✅" if not in_markdown else "🔴"
                print(f"{status} '{pattern}': HTML={in_html}, Markdown={in_markdown}")
        
    except ImportError:
        print("❌ markdownify library not available")
        return
        
    except Exception as e:
        print(f"❌ Error during conversion: {e}")
        return

if __name__ == "__main__":
    test_html_conversion()