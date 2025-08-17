#!/usr/bin/env python3
"""
HTML utilities for cleaning and processing HTML content.
Designed to handle Word HTML artifacts and provide clean markdown conversion.

Extracted from cuhk_scraper.py for maintainability and reusability.
This module has no external dependencies beyond BeautifulSoup and optional markdownify.
"""

import re
from typing import Tuple, Optional
from datetime import datetime, timezone
from bs4 import BeautifulSoup, Comment, Tag
from bs4.element import NavigableString


def clean_word_html(html_content: str) -> str:
    """
    Clean Word-specific HTML artifacts before markdown conversion.
    
    Removes Word HTML elements, attributes, and formatting that interfere
    with clean markdown conversion. Should be called before markdownify.
    
    Args:
        html_content: Raw HTML content (potentially from Word/Office)
        
    Returns:
        Cleaned HTML content ready for markdown conversion
    """
    if not html_content:
        return ""
    
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # Remove Word-specific elements entirely
    for element in soup.find_all(['meta', 'link', 'style', 'xml']):
        element.decompose()
    
    # Remove Word conditional comments (<!--[if !supportLists]-->, <!--[endif]-->, etc.)
    comments_to_remove = []
    for element in soup.contents:
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
        if isinstance(tag, Tag) and hasattr(tag, 'attrs'):
            # Remove Word-specific attributes
            attrs_to_remove = [attr for attr in tag.attrs.keys() 
                              if attr.startswith(('mso-', 'o:', 'v:', 'w:', 'class')) 
                              or attr in ['style', 'lang']]
            for attr in attrs_to_remove:
                if attr in tag.attrs:
                    del tag.attrs[attr]
    
    # Convert non-breaking spaces to regular spaces in text content
    for text_node in soup.find_all(string=True):
        if isinstance(text_node, NavigableString) and '\xa0' in str(text_node):
            # Create new NavigableString with replaced content
            new_text = str(text_node).replace('\xa0', ' ')
            text_node.replace_with(NavigableString(new_text))
    
    # Remove empty elements that might be left behind
    for tag in soup.find_all():
        if (isinstance(tag, Tag) and 
            tag.name in ['span', 'div', 'p'] and 
            not tag.get_text(strip=True) and 
            not tag.find_all()):
            tag.decompose()
    
    return str(soup)


def normalize_markdown_whitespace(text: str) -> str:
    """
    Clean whitespace while preserving markdown syntax for proper rendering.
    
    Handles:
    - Non-breaking spaces from Word HTML
    - Excessive whitespace that breaks markdown rendering
    - Proper markdown list and header formatting
    - Multiple consecutive blank lines
    
    Args:
        text: Raw markdown text (potentially with formatting issues)
        
    Returns:
        Clean markdown text with proper spacing and syntax
    """
    if not text:
        return ""
    
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
    
    # Multiple consecutive blank lines � single blank line (for readability)
    text = re.sub(r'\n\s*\n\s*\n+', '\n\n', text)
    
    return text.strip()


def fix_table_headers(markdown_text: str) -> str:
    """
    Fix empty header rows in markdown tables.
    
    Converts tables with empty headers to use the first data row as headers:
    |  |  |           �      | Header 1 | Header 2 |
    | --- | --- |            | -------- | -------- |
    | Value 1 | Value 2 |    | Value 1  | Value 2  |
    
    Args:
        markdown_text: Markdown text that may contain malformed tables
        
    Returns:
        Markdown text with properly formatted table headers
    """
    if not markdown_text:
        return ""
    
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
                        # Replace empty header with first data row
                        result.append(lines[i + 2])  # Use first data row as header
                        result.append(lines[i + 1])  # Keep separator
                        i += 3  # Skip empty header, separator, and used data row
                        continue
        
        result.append(line)
        i += 1
    
    return '\n'.join(result)


def html_to_plain_text(html_content: str) -> str:
    """
    Extract clean plain text from HTML content.
    
    This is the fallback method when markdownify is not available.
    Uses BeautifulSoup's text extraction with newline preservation.
    
    Args:
        html_content: Raw HTML content
        
    Returns:
        Clean plain text with basic structure preservation
    """
    if not html_content:
        return ""
    
    # Use BeautifulSoup's built-in text extraction with newline preservation
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # separator='\n' converts <br> tags to newlines, strip=True removes extra whitespace
    cleaned_text = soup.get_text(separator='\n', strip=True)
    
    # Basic cleanup: normalize multiple consecutive newlines
    cleaned_text = re.sub(r'\n\s*\n', '\n', cleaned_text)  # Remove empty lines
    
    return cleaned_text.strip()


def html_to_clean_markdown(html_content: str) -> Tuple[str, bool]:
    """
    Convert HTML to clean markdown using robust preprocessing.
    
    This is the main entry point for HTML-to-markdown conversion that handles
    Word HTML artifacts and produces clean, readable markdown.
    
    Args:
        html_content: Raw HTML content
        
    Returns:
        Tuple of (clean_text, is_markdown) where:
        - clean_text: The processed text content
        - is_markdown: True if successfully converted to markdown, False if plain text fallback
    """
    if not html_content or not html_content.strip():
        return "", True
    
    try:
        # Try to import markdownify
        import markdownify
        
        # Step 1: Clean Word HTML artifacts
        cleaned_html = clean_word_html(html_content)
        
        # Step 2: Convert to markdown
        markdown_result = markdownify.markdownify(cleaned_html, heading_style="ATX")
        
        # Step 3: Normalize whitespace while preserving markdown syntax
        clean_markdown = normalize_markdown_whitespace(markdown_result)
        
        # Step 4: Fix any remaining table header issues
        final_markdown = fix_table_headers(clean_markdown)
        
        return final_markdown, True
        
    except ImportError:
        # Fallback: markdownify not available, return cleaned plain text
        plain_text = html_to_plain_text(html_content)
        normalized_text = normalize_markdown_whitespace(plain_text)
        return normalized_text, False
    
    except Exception:
        # Fallback: conversion failed, return cleaned plain text
        plain_text = html_to_plain_text(html_content)
        normalized_text = normalize_markdown_whitespace(plain_text)
        return normalized_text, False


# Convenience function for backward compatibility with scraper's expected interface
def convert_html_to_markdown(html_content: str) -> str:
    """
    Simple wrapper around html_to_clean_markdown for backward compatibility.
    
    Args:
        html_content: Raw HTML content
        
    Returns:
        Clean text content (markdown if possible, plain text as fallback)
    """
    result, _ = html_to_clean_markdown(html_content)
    return result


def utc_now_iso() -> str:
    """Get current UTC timestamp in ISO format with timezone info
    
    Returns:
        str: ISO 8601 formatted timestamp with timezone
        
    Examples:
        >>> utc_now_iso()
        '2025-08-17T14:32:15.123456+00:00'
        
        >>> utc_now_iso()  # Different time
        '2025-08-17T15:45:22.987654+00:00'
    """
    return datetime.now(timezone.utc).isoformat()


def clean_class_attributes(class_attrs: str, course_attrs: str) -> str:
    """Remove course attribute duplicates from class attributes
    
    This function implements line-by-line cleaning to remove course attributes
    that appear in both class_attributes and course_attributes fields.
    The result is clean class-specific attributes (typically teaching language).
    
    Args:
        class_attrs: Raw class attributes string (may contain duplicates)
        course_attrs: Course attributes string (authoritative source)
        
    Returns:
        str: Cleaned class attributes with course attribute duplicates removed
        
    Examples:
        >>> clean_class_attributes(
        ...     "SDG-GE #5 Gender Equality\\nEnglish only", 
        ...     "SDG-GE #5 Gender Equality"
        ... )
        'English only'
        
        >>> clean_class_attributes("English only", "")
        'English only'
        
        >>> clean_class_attributes("", "SDG Goals")
        ''
    """
    if not class_attrs or not course_attrs:
        return class_attrs or ""
    
    # Split by newlines and clean whitespace
    class_lines: list[str] = [line.strip() for line in class_attrs.split('\n') if line.strip()]
    course_lines: list[str] = [line.strip() for line in course_attrs.split('\n') if line.strip()]
    
    # Find lines in class_attrs that are NOT in course_attrs
    cleaned_lines: list[str] = [line for line in class_lines if line not in course_lines]
    
    return '\n'.join(cleaned_lines)


def clean_html_text(text: str) -> str:
    """Clean and normalize HTML text content with proper structure preservation
    
    Extracted from cuhk_scraper.py for reusability. Uses BeautifulSoup's built-in
    text extraction with newline preservation and basic cleanup.
    
    Args:
        text: Raw HTML text content to clean
        
    Returns:
        str: Clean text with normalized whitespace and structure
        
    Examples:
        >>> clean_html_text("<p>Hello</p><br><p>World</p>")
        'Hello\\nWorld'
        
        >>> clean_html_text("  Multiple   spaces  ")
        'Multiple spaces'
    """
    if not text:
        return ""
    
    # Use BeautifulSoup's built-in text extraction with newline preservation
    soup = BeautifulSoup(text, 'html.parser')
    
    # separator='\n' converts <br> tags to newlines, strip=True removes extra whitespace
    cleaned_text = soup.get_text(separator='\n', strip=True)
    
    # Basic cleanup: normalize multiple consecutive newlines
    cleaned_text = re.sub(r'\n\s*\n', '\n', cleaned_text)  # Remove empty lines
    
    return cleaned_text.strip()


def parse_enrollment_status_from_image(img_src: str) -> str:
    """Parse enrollment status from status icon image source
    
    Maps CUHK course catalog status icons to standardized status strings.
    Extracted from cuhk_scraper.py for reusability and easier testing.
    
    Args:
        img_src: Image source URL containing status icon filename
        
    Returns:
        str: Standardized status string ('Open', 'Closed', 'Waitlisted', 'Unknown')
        
    Examples:
        >>> parse_enrollment_status_from_image("images/class_open.gif")
        'Open'
        
        >>> parse_enrollment_status_from_image("images/class_closed.gif")
        'Closed'
        
        >>> parse_enrollment_status_from_image("images/class_wait.gif")
        'Waitlisted'
        
        >>> parse_enrollment_status_from_image("unknown.gif")
        'Unknown'
    """
    if not img_src:
        return "Unknown"
    
    if "class_open.gif" in img_src:
        return "Open"
    elif "class_closed.gif" in img_src:
        return "Closed"  
    elif "class_wait.gif" in img_src:
        return "Waitlisted"
    else:
        return "Unknown"


def calculate_duration_seconds(started_at_iso: str) -> Optional[int]:
    """Calculate duration in seconds from ISO timestamp to now
    
    Calculates the time difference between a given ISO timestamp and the current UTC time.
    Useful for progress tracking, performance measurement, and duration calculations.
    
    Args:
        started_at_iso: ISO 8601 formatted timestamp string with timezone info
        
    Returns:
        Optional[int]: Duration in seconds, or None if timestamp is invalid
        
    Examples:
        >>> import datetime, timezone
        >>> now = datetime.datetime.now(timezone.utc)
        >>> past = (now - datetime.timedelta(hours=1)).isoformat()
        >>> duration = calculate_duration_seconds(past)
        >>> 3500 <= duration <= 3700  # ~1 hour (allowing for execution time)
        True
        
        >>> calculate_duration_seconds("invalid-timestamp")
        None
    """
    try:
        started_time = datetime.fromisoformat(started_at_iso.replace('Z', '+00:00'))
        current_time = datetime.now(timezone.utc)
        duration = current_time - started_time
        return int(duration.total_seconds())
    except (ValueError, TypeError):
        return None


def format_duration_human(seconds: int) -> str:
    """Format duration in seconds to human-readable string
    
    Converts seconds into a readable format like '2h 45m 30s' for easy interpretation
    of scraping durations and other time measurements.
    
    Args:
        seconds: Duration in seconds
        
    Returns:
        str: Human-readable duration string
        
    Examples:
        >>> format_duration_human(90)
        '1m 30s'
        
        >>> format_duration_human(3661)
        '1h 1m 1s'
        
        >>> format_duration_human(7200)
        '2h'
        
        >>> format_duration_human(45)
        '45s'
        
        >>> format_duration_human(0)
        '0s'
    """
    if seconds < 0:
        return "0s"
    
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    
    parts = []
    if hours > 0:
        parts.append(f"{hours}h")
    if minutes > 0:
        parts.append(f"{minutes}m")
    if secs > 0 or not parts:  # Always show seconds if nothing else, or if there are leftover seconds
        parts.append(f"{secs}s")
    
    return " ".join(parts)