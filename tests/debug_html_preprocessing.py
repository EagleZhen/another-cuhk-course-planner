#!/usr/bin/env python3
"""
Debug script to test robust HTML pre-processing approach for Course Outcome data.
This tests cleaning Word HTML artifacts BEFORE markdownify conversion.
"""

from bs4 import BeautifulSoup, Comment
import os
import re

def clean_word_html(html_content: str) -> str:
    """Clean Word-specific HTML artifacts before markdown conversion"""
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # Remove Word-specific elements entirely
    for element in soup.find_all(['meta', 'link', 'style', 'xml']):
        element.decompose()
    
    # Remove Word conditional comments
    comments_to_remove = []
    for element in soup.contents:
        if hasattr(element, 'string') and element.string:
            # This catches Comment objects
            if isinstance(element, Comment):
                comment_text = str(element)
                if ('if' in comment_text and 
                    ('supportLists' in comment_text or 'mso' in comment_text or 'endif' in comment_text)):
                    comments_to_remove.append(element)
    
    # Remove the comments
    for comment in comments_to_remove:
        comment.extract()
    
    # Clean Word-specific attributes from all tags
    for tag in soup.find_all():
        if hasattr(tag, 'attrs'):
            # Remove Word-specific attributes
            attrs_to_remove = [attr for attr in tag.attrs.keys() 
                              if attr.startswith(('mso-', 'o:', 'v:', 'w:', 'class')) 
                              or attr in ['style', 'lang']]
            for attr in attrs_to_remove:
                if attr in tag.attrs:
                    del tag[attr]
    
    # Convert non-breaking spaces to regular spaces in text content
    for text_node in soup.find_all(string=True):
        if text_node.string and '\xa0' in text_node.string:
            text_node.string.replace_with(text_node.string.replace('\xa0', ' '))
    
    # Remove empty elements that might be left behind
    for tag in soup.find_all():
        if tag.name in ['span', 'div', 'p'] and not tag.get_text(strip=True) and not tag.find_all():
            tag.decompose()
    
    return str(soup)

def normalize_whitespace_markdown_aware(text: str) -> str:
    """Clean whitespace while preserving markdown syntax for proper rendering"""
    # Step 1: Replace non-breaking spaces (Word HTML artifact)
    text = text.replace('\xa0', ' ')
    
    lines = text.split('\n')
    cleaned_lines = []
    
    for line in lines:
        # Remove leading/trailing whitespace from each line
        stripped = line.strip()
        
        if not stripped:
            # Empty line - preserve for markdown structure
            cleaned_lines.append('')
            continue
        
        # Step 2: Handle markdown syntax elements
        if re.match(r'^\d+\.', stripped):
            # Numbered list: ensure exactly "1. " format (space required for markdown)
            line = re.sub(r'^(\d+)\.\s*', r'\1. ', stripped)
        elif re.match(r'^[-*+]', stripped):
            # Bullet list: ensure exactly "- " format  
            line = re.sub(r'^([-*+])\s*', r'\1 ', stripped)
        elif re.match(r'^#{1,6}', stripped):
            # Headers: ensure exactly "# " format
            line = re.sub(r'^(#{1,6})\s*', r'\1 ', stripped)
        else:
            # Regular line: just use stripped version
            line = stripped
        
        # Step 3: Clean excessive internal spaces (but preserve single spaces)
        line = re.sub(r'  +', ' ', line)
        
        cleaned_lines.append(line)
    
    # Step 4: Join and normalize line breaks (preserve structure)
    text = '\n'.join(cleaned_lines)
    
    # Multiple consecutive blank lines → single blank line (for readability)
    text = re.sub(r'\n\s*\n\s*\n+', '\n\n', text)
    
    return text.strip()

def test_robust_html_processing():
    """Test the robust HTML pre-processing approach"""
    
    # Path to the sample HTML file  
    html_file = "tests/sample-webpages/Course Outcome - Recommended Reading - List.html"
    
    if not os.path.exists(html_file):
        print(f"ERROR: File not found: {html_file}")
        return
    
    # Read the HTML content
    with open(html_file, 'r', encoding='utf-8') as f:
        html_content = f.read()
    
    print("=== ROBUST HTML PRE-PROCESSING TEST ===")
    print(f"Input file: {html_file}")
    print(f"Original HTML length: {len(html_content)} characters")
    print()
    
    # Step 1: Parse with BeautifulSoup to get the span
    print("=== STEP 1: Extract Target Span ===")
    soup = BeautifulSoup(html_content, 'html.parser')
    recommended_reading_span = soup.find('span', {'id': 'uc_course_outcome_lbl_rec_reading'})
    
    if recommended_reading_span:
        print("✅ Found target span")
        span_html = str(recommended_reading_span)
    else:
        print("⚠️ Using entire content as span")
        span_html = str(soup)
    
    print(f"Span HTML length: {len(span_html)} characters")
    print()
    
    # Step 2: Clean Word HTML artifacts
    print("=== STEP 2: Clean Word HTML Artifacts ===")
    cleaned_html = clean_word_html(span_html)
    print(f"Cleaned HTML length: {len(cleaned_html)} characters")
    print(f"Size reduction: {len(span_html) - len(cleaned_html)} characters")
    
    # Check what was removed
    original_comments = span_html.count('<!--')
    cleaned_comments = cleaned_html.count('<!--')
    print(f"HTML comments: {original_comments} → {cleaned_comments}")
    
    original_meta = span_html.count('<meta')
    cleaned_meta = cleaned_html.count('<meta')
    print(f"Meta tags: {original_meta} → {cleaned_meta}")
    
    original_nbsp = span_html.count('\xa0')
    cleaned_nbsp = cleaned_html.count('\xa0')
    print(f"Non-breaking spaces: {original_nbsp} → {cleaned_nbsp}")
    print()
    
    # Step 3: Convert to markdown
    print("=== STEP 3: Convert to Markdown ===")
    try:
        import markdownify
        print("✅ markdownify available")
        
        # Convert cleaned HTML to markdown
        markdown_result = markdownify.markdownify(cleaned_html, heading_style="ATX")
        print(f"Raw markdown length: {len(markdown_result)} characters")
        
        # Apply markdown-aware whitespace normalization
        final_markdown = normalize_whitespace_markdown_aware(markdown_result)
        print(f"Final markdown length: {len(final_markdown)} characters")
        print(f"Final reduction: {len(markdown_result) - len(final_markdown)} characters")
        print()
        
    except ImportError:
        print("❌ markdownify not available")
        return
    
    # Step 4: Write clean output files for preview
    print("=== STEP 4: Write Files for Preview ===")
    output_dir = "tests/output/debug_html_preprocessing"
    os.makedirs(output_dir, exist_ok=True)
    
    # Pure HTML files (no analysis text - for direct browser preview)
    with open(f"{output_dir}/original_span.html", "w", encoding="utf-8") as f:
        f.write(span_html)
    
    with open(f"{output_dir}/cleaned_html.html", "w", encoding="utf-8") as f:
        f.write(cleaned_html)
    
    # Pure markdown files
    with open(f"{output_dir}/raw_markdown.md", "w", encoding="utf-8") as f:
        f.write(markdown_result)
    
    with open(f"{output_dir}/final_markdown.md", "w", encoding="utf-8") as f:
        f.write(final_markdown)
    
    # Raw text representation for debugging
    with open(f"{output_dir}/raw_markdown_repr.txt", "w", encoding="utf-8") as f:
        f.write(repr(markdown_result))
    
    print(f"📁 Files written to {output_dir}/:")
    print("  - original_span.html (open in browser)")
    print("  - cleaned_html.html (open in browser)")
    print("  - raw_markdown.md (preview in IDE)")
    print("  - final_markdown.md (✨ final result)")
    print("  - raw_markdown_repr.txt (debugging)")
    print()
    
    # Step 5: Console analysis (instead of files)
    print("=== STEP 5: Analysis Summary ===")
    print(f"📊 Size Analysis:")
    print(f"   Original HTML: {len(span_html):,} chars")
    print(f"   Cleaned HTML:  {len(cleaned_html):,} chars ({len(span_html) - len(cleaned_html):,} removed)")
    print(f"   Raw markdown:  {len(markdown_result):,} chars")
    print(f"   Final result:  {len(final_markdown):,} chars")
    print(f"   Total reduction: {len(span_html) - len(final_markdown):,} chars")
    print(f"   Compression ratio: {len(final_markdown) / len(span_html) * 100:.1f}%")
    print()
    print(f"🧹 Artifacts Removed:")
    print(f"   HTML comments: {original_comments - cleaned_comments}")
    print(f"   Meta tags: {original_meta - cleaned_meta}")
    print(f"   Non-breaking spaces: {original_nbsp - cleaned_nbsp}")
    print()
    print(f"📝 Quality Check:")
    leading_spaces_raw = len(markdown_result) - len(markdown_result.lstrip())
    leading_spaces_final = len(final_markdown) - len(final_markdown.lstrip())
    print(f"   Leading whitespace: {leading_spaces_raw} → {leading_spaces_final}")
    print(f"   Non-breaking spaces in final: {final_markdown.count(chr(160))}")
    print(f"   Multiple spaces in final: {bool(re.search(r'  +', final_markdown))}")
    
    # Check markdown syntax preservation
    numbered_lists_raw = len(re.findall(r'^\d+\. ', markdown_result, re.MULTILINE))
    numbered_lists_final = len(re.findall(r'^\d+\. ', final_markdown, re.MULTILINE))
    print(f"   Numbered list syntax preserved: {numbered_lists_raw} → {numbered_lists_final}")
    
    # Show first line comparison
    first_line_raw = markdown_result.split('\n')[0] if markdown_result else ""
    first_line_final = final_markdown.split('\n')[0] if final_markdown else ""
    print(f"   First line transformation:")
    print(f"     Raw:   {repr(first_line_raw)}")
    print(f"     Final: {repr(first_line_final)}")
    print()
    
    # Step 6: Preview final results
    print("=== STEP 6: Final Results Preview ===")
    print("✨ Final cleaned markdown:")
    print("─" * 50)
    print(final_markdown[:300] + "..." if len(final_markdown) > 300 else final_markdown)
    print("─" * 50)
    print()
    print("🎯 Success! Check the HTML files in your browser and markdown files in your IDE.")

if __name__ == "__main__":
    test_robust_html_processing()