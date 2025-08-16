#!/usr/bin/env python3
"""
Test fixing table header issues in markdownify output
"""

import os
import sys

# Add the parent directory to the path to import cuhk_scraper
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def read_markdownify_output():
    """Read the markdownify output file"""
    output_file = "tests/output/markdownify_output.md"
    with open(output_file, 'r', encoding='utf-8') as f:
        return f.read()

def fix_table_headers(markdown_text):
    """Fix empty header rows in markdown tables"""
    lines = markdown_text.split('\n')
    result = []
    
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # Detect empty header pattern: |  |  |
        if line.strip().startswith('|') and line.strip().endswith('|'):
            # Split by | and check if all cells are empty (ignoring first/last empty splits)
            cells = line.split('|')[1:-1]  # Remove first and last empty elements
            if all(cell.strip() == '' for cell in cells):
                # Check if next line is separator: | --- | --- |
                if i + 1 < len(lines) and '---' in lines[i + 1]:
                    # Check if line after separator has content
                    if i + 2 < len(lines) and lines[i + 2].strip().startswith('|'):
                        print(f"🔧 Fixing empty header at line {i + 1}")
                        print(f"   Empty header: {line.strip()}")
                        print(f"   Separator: {lines[i + 1].strip()}")
                        print(f"   Using as header: {lines[i + 2].strip()}")
                        print()
                        
                        # Replace empty header with first data row
                        result.append(lines[i + 2])  # Use first data row as header
                        result.append(lines[i + 1])  # Keep separator
                        i += 3  # Skip empty header, separator, and used data row
                        continue
        
        result.append(line)
        i += 1
    
    return '\n'.join(result)

def test_header_fix():
    """Test the header fix function"""
    print("🧪 Testing Table Header Fix")
    print("=" * 50)
    
    try:
        # Read original markdownify output
        original_markdown = read_markdownify_output()
        
        print("📝 Original markdownify output (first 20 lines):")
        print("-" * 30)
        original_lines = original_markdown.split('\n')
        for i, line in enumerate(original_lines[:20], 1):
            print(f"{i:2d}: {line}")
        print("-" * 30)
        print()
        
        # Apply the fix
        fixed_markdown = fix_table_headers(original_markdown)
        
        print("✅ Applied header fix")
        print()
        
        print("📝 Fixed output (first 20 lines):")
        print("-" * 30)
        fixed_lines = fixed_markdown.split('\n')
        for i, line in enumerate(fixed_lines[:20], 1):
            print(f"{i:2d}: {line}")
        print("-" * 30)
        print()
        
        # Save fixed output
        output_dir = "tests/output"
        os.makedirs(output_dir, exist_ok=True)
        
        fixed_file = f"{output_dir}/markdownify_fixed.md"
        with open(fixed_file, 'w', encoding='utf-8') as f:
            f.write(fixed_markdown)
        print(f"💾 Saved fixed output to: {fixed_file}")
        print()
        
        # Compare statistics
        original_table_count = original_markdown.count('| --- |')
        fixed_table_count = fixed_markdown.count('| --- |')
        empty_headers_found = original_markdown.count('|  |')
        empty_headers_remaining = fixed_markdown.count('|  |')
        
        print("📊 Comparison Statistics:")
        print(f"   Tables found: {original_table_count}")
        print(f"   Empty headers in original: {empty_headers_found}")
        print(f"   Empty headers after fix: {empty_headers_remaining}")
        print(f"   Empty headers fixed: {empty_headers_found - empty_headers_remaining}")
        print()
        
        # Show side-by-side comparison of first table
        print("🔍 First Table Comparison:")
        print("=" * 50)
        
        # Find first table in original
        orig_table_start = original_markdown.find('|')
        orig_table_lines = []
        if orig_table_start != -1:
            orig_from_table = original_markdown[orig_table_start:].split('\n')
            for line in orig_from_table:
                if line.strip().startswith('|'):
                    orig_table_lines.append(line)
                else:
                    break
        
        # Find first table in fixed
        fixed_table_start = fixed_markdown.find('|')
        fixed_table_lines = []
        if fixed_table_start != -1:
            fixed_from_table = fixed_markdown[fixed_table_start:].split('\n')
            for line in fixed_from_table:
                if line.strip().startswith('|'):
                    fixed_table_lines.append(line)
                else:
                    break
        
        print("ORIGINAL:")
        for line in orig_table_lines[:5]:
            print(f"  {line}")
        print()
        print("FIXED:")
        for line in fixed_table_lines[:5]:
            print(f"  {line}")
        
        return fixed_markdown
        
    except FileNotFoundError:
        print("❌ markdownify output file not found. Run test_html_to_markdown.py first.")
        return None
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return None

if __name__ == "__main__":
    test_header_fix()