#!/usr/bin/env python3
"""
Test HTML to Markdown conversion with different libraries
"""

import os
import sys

# Add the parent directory to the path to import cuhk_scraper
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def read_test_html():
    """Read the test HTML file"""
    test_file = "lab/scraper/samples/webpages/Course Syllabus - List + Table.html"
    with open(test_file, 'r', encoding='utf-8') as f:
        return f.read()

def save_output(method_name, content):
    """Save conversion output to /lab/scraper/outputs/"""
    output_dir = "lab/scraper/outputs"
    os.makedirs(output_dir, exist_ok=True)

    output_file = f"{output_dir}/{method_name}_output.md"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"💾 Saved to: {output_file}")

def test_markdownify():
    """Test markdownify library"""
    try:
        import markdownify
        print("🧪 Testing markdownify...")

        html_content = read_test_html()

        # Basic conversion
        markdown = markdownify.markdownify(html_content)

        print("✅ markdownify conversion successful")
        print("📝 Sample output (first 500 chars):")
        print("=" * 50)
        print(markdown[:500])
        print("=" * 50)
        print()

        save_output("markdownify", markdown)
        return markdown

    except ImportError:
        print("❌ markdownify not installed. Run: pip install markdownify")
        return None
    except Exception as e:
        print(f"❌ markdownify error: {e}")
        return None

def test_html2text():
    """Test html2text library"""
    try:
        import html2text
        print("🧪 Testing html2text...")

        html_content = read_test_html()

        # Configure html2text
        h = html2text.HTML2Text()
        h.ignore_links = False
        h.ignore_images = True
        h.body_width = 0  # No line wrapping

        markdown = h.handle(html_content)

        print("✅ html2text conversion successful")
        print("📝 Sample output (first 500 chars):")
        print("=" * 50)
        print(markdown[:500])
        print("=" * 50)
        print()

        save_output("html2text", markdown)
        return markdown

    except ImportError:
        print("❌ html2text not installed. Run: pip install html2text")
        return None
    except Exception as e:
        print(f"❌ html2text error: {e}")
        return None

def test_html_to_markdown():
    """Test html-to-markdown library (modern 2024 version)"""
    try:
        from html_to_markdown import convert
        print("🧪 Testing html-to-markdown...")

        html_content = read_test_html()

        markdown = convert(html_content)

        print("✅ html-to-markdown conversion successful")
        print("📝 Sample output (first 500 chars):")
        print("=" * 50)
        print(markdown[:500])
        print("=" * 50)
        print()

        save_output("html-to-markdown", markdown)
        return markdown

    except ImportError:
        print("❌ html-to-markdown not installed. Run: pip install html-to-markdown")
        return None
    except Exception as e:
        print(f"❌ html-to-markdown error: {e}")
        return None

def test_beautifulsoup_fallback():
    """Test simple BeautifulSoup text extraction as fallback"""
    try:
        from bs4 import BeautifulSoup
        print("🧪 Testing BeautifulSoup fallback...")

        html_content = read_test_html()

        soup = BeautifulSoup(html_content, 'html.parser')
        text = soup.get_text(separator='\n', strip=True)

        # Clean up excessive whitespace
        import re
        text = re.sub(r'\n\s*\n', '\n', text)

        print("✅ BeautifulSoup extraction successful")
        print("📝 Sample output (first 500 chars):")
        print("=" * 50)
        print(text[:500])
        print("=" * 50)
        print()

        save_output("beautifulsoup", text)
        return text

    except Exception as e:
        print(f"❌ BeautifulSoup error: {e}")
        return None

def compare_results():
    """Compare all conversion methods"""
    print("🔍 HTML to Markdown Conversion Test")
    print("=" * 60)
    print()

    # Test all methods
    results = {}

    results['markdownify'] = test_markdownify()
    results['html2text'] = test_html2text()
    results['html-to-markdown'] = test_html_to_markdown()
    results['beautifulsoup'] = test_beautifulsoup_fallback()

    # Summary
    print("📊 COMPARISON SUMMARY:")
    print("=" * 60)

    for method, result in results.items():
        if result is not None:
            lines = result.count('\n')
            chars = len(result)
            print(f"✅ {method:15} - {lines:3} lines, {chars:4} chars")
        else:
            print(f"❌ {method:15} - Failed")

    print()
    print("💡 Recommendation:")

    # Find the best working method
    working_methods = [name for name, result in results.items() if result is not None]

    if 'markdownify' in working_methods:
        print("   Use markdownify - most reliable for table conversion")
    elif 'html-to-markdown' in working_methods:
        print("   Use html-to-markdown - modern alternative")
    elif 'html2text' in working_methods:
        print("   Use html2text - fallback option")
    else:
        print("   Use BeautifulSoup text extraction - minimal but safe")

if __name__ == "__main__":
    compare_results()
