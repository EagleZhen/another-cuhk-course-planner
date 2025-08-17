#!/usr/bin/env python3
"""
Course Data Analysis Script

Analyzes all subject JSON files to extract insights about:
1. Section types (to ensure complete handling)
2. Time ranges (earliest/latest class times)
3. Other useful patterns and insights

Usage: python analyze_course_data.py
"""

import json
import os
import glob
from collections import Counter
from typing import Dict, Tuple
import re
from datetime import datetime

def load_subject_data(data_directory: str = "data") -> Dict[str, any]:
    """Load all subject JSON files from data directory"""
    subjects_data = {}
    
    # Find all JSON files in data directory
    json_files = glob.glob(os.path.join(data_directory, "*.json"))
    
    print(f"📂 Found {len(json_files)} JSON files in {data_directory}/")
    
    for file_path in json_files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            # Extract subject code from filename
            subject_code = os.path.basename(file_path).replace('.json', '')
            subjects_data[subject_code] = data
            
        except Exception as e:
            print(f"⚠️ Error loading {file_path}: {e}")
    
    print(f"✅ Successfully loaded {len(subjects_data)} subjects")
    return subjects_data

def extract_section_types(subjects_data: Dict[str, any]) -> Tuple[Dict[str, int], Dict[str, Dict]]:
    """Extract core section types and their frequencies with examples"""
    section_types = Counter()  # Core types like LEC, TUT, LAB
    section_examples = {}  # Examples for each core type
    
    for subject_code, subject_data in subjects_data.items():
        courses = subject_data.get('courses', [])
        
        for course in courses:
            terms = course.get('terms', [])
            
            for term in terms:
                schedule = term.get('schedule', [])
                
                for section in schedule:
                    section_name = section.get('section', '')
                    
                    if section_name:
                        # Extract just the core type part (LEC, LAB, TUT, etc.)
                        # Examples: "--LEC (8192)" -> LEC, "-L01-LAB (5726)" -> LAB, "AE01-EXR (8194)" -> EXR
                        type_match = re.search(r'([A-Z]{3,4})(?:\s|\(|$)', section_name)
                        if type_match:
                            core_type = type_match.group(1)
                            section_types[core_type] += 1
                            
                            # Store example if we don't have one yet
                            if core_type not in section_examples:
                                section_examples[core_type] = {
                                    'section_name': section_name,
                                    'course_code': course.get('course_code', ''),
                                    'subject': subject_code,
                                    'course_title': course.get('title', ''),
                                    'meetings': section.get('meetings', [])[:1]  # First meeting only
                                }
    
    return dict(section_types), section_examples

def parse_time_string(time_str: str) -> Tuple[int, int, int, int]:
    """
    Parse time string and return (start_hour, start_min, end_hour, end_min)
    Examples: "Th 9:30AM - 12:15PM", "Mo Tu Th Fr 09:30 - 10:15"
    Returns (-1, -1, -1, -1) if parsing fails
    """
    if not time_str or time_str.upper() == 'TBA':
        return (-1, -1, -1, -1)
    
    # Try AM/PM format first: "9:30AM - 12:15PM"
    am_pm_pattern = r'(\d{1,2}):(\d{2})(AM|PM)\s*-\s*(\d{1,2}):(\d{2})(AM|PM)'
    match = re.search(am_pm_pattern, time_str, re.IGNORECASE)
    
    if match:
        start_hour = int(match.group(1))
        start_min = int(match.group(2))
        start_period = match.group(3).upper()
        end_hour = int(match.group(4))
        end_min = int(match.group(5))
        end_period = match.group(6).upper()
        
        # Convert to 24-hour format
        if start_period == 'PM' and start_hour != 12:
            start_hour += 12
        elif start_period == 'AM' and start_hour == 12:
            start_hour = 0
            
        if end_period == 'PM' and end_hour != 12:
            end_hour += 12
        elif end_period == 'AM' and end_hour == 12:
            end_hour = 0
        
        return (start_hour, start_min, end_hour, end_min)
    
    # Fallback to 24-hour format: "09:30 - 10:15"
    time_pattern = r'(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})'
    match = re.search(time_pattern, time_str)
    
    if match:
        start_hour = int(match.group(1))
        start_min = int(match.group(2))
        end_hour = int(match.group(3))
        end_min = int(match.group(4))
        return (start_hour, start_min, end_hour, end_min)
    
    return (-1, -1, -1, -1)

def analyze_time_ranges(subjects_data: Dict[str, any]) -> Dict[str, any]:
    """Analyze earliest and latest class times with course examples"""
    all_times = []
    earliest_start = (24, 0)  # (hour, minute)
    latest_end = (0, 0)
    earliest_example = None
    latest_example = None
    time_patterns = Counter()
    
    for subject_code, subject_data in subjects_data.items():
        courses = subject_data.get('courses', [])
        
        for course in courses:
            terms = course.get('terms', [])
            
            for term in terms:
                schedule = term.get('schedule', [])
                
                for section in schedule:
                    meetings = section.get('meetings', [])
                    
                    for meeting in meetings:
                        time_str = meeting.get('time', '')
                        
                        if time_str and time_str.upper() != 'TBA':
                            time_patterns[time_str] += 1
                            start_h, start_m, end_h, end_m = parse_time_string(time_str)
                            
                            if start_h != -1:  # Valid time
                                all_times.append((start_h, start_m, end_h, end_m))
                                
                                # Track earliest start with example
                                if (start_h, start_m) < earliest_start:
                                    earliest_start = (start_h, start_m)
                                    earliest_example = {
                                        'course_code': f"{subject_code}{course.get('course_code', '')}",
                                        'course_title': course.get('title', ''),
                                        'section': section.get('section', ''),
                                        'time_str': time_str,
                                        'location': meeting.get('location', ''),
                                        'instructor': meeting.get('instructor', ''),
                                        'term': term.get('term_name', '')
                                    }
                                
                                # Track latest end with example
                                if (end_h, end_m) > latest_end:
                                    latest_end = (end_h, end_m)
                                    latest_example = {
                                        'course_code': f"{subject_code}{course.get('course_code', '')}",
                                        'course_title': course.get('title', ''),
                                        'section': section.get('section', ''),
                                        'time_str': time_str,
                                        'location': meeting.get('location', ''),
                                        'instructor': meeting.get('instructor', ''),
                                        'term': term.get('term_name', '')
                                    }
    
    return {
        'earliest_start': earliest_start,
        'latest_end': latest_end,
        'earliest_example': earliest_example,
        'latest_example': latest_example,
        'total_time_slots': len(all_times),
        'unique_time_patterns': len(time_patterns),
        'common_time_patterns': time_patterns.most_common(10)
    }

def analyze_hourly_distribution(subjects_data: Dict[str, any]) -> Dict[str, any]:
    """Analyze how many sections are active in each hour of the day"""
    # Track sections active in each hour (0-23)
    hourly_counts = [0] * 24
    hourly_examples = {}  # Store examples for busy hours
    
    total_sections_analyzed = 0
    
    for subject_code, subject_data in subjects_data.items():
        courses = subject_data.get('courses', [])
        
        for course in courses:
            terms = course.get('terms', [])
            
            for term in terms:
                schedule = term.get('schedule', [])
                
                for section in schedule:
                    meetings = section.get('meetings', [])
                    
                    for meeting in meetings:
                        time_str = meeting.get('time', '')
                        
                        if time_str and time_str.upper() != 'TBA':
                            start_h, start_m, end_h, end_m = parse_time_string(time_str)
                            
                            if start_h != -1:  # Valid time
                                total_sections_analyzed += 1
                                
                                # Count this section for each hour it spans
                                current_hour = start_h
                                
                                # Special case: if start and end are the same time, it's likely a data error
                                # but we should still count it for the start hour
                                if start_h == end_h and start_m == end_m:
                                    hourly_counts[current_hour] += 1
                                    # Store example for this unusual case
                                    if (current_hour not in hourly_examples or 
                                        hourly_counts[current_hour] > hourly_examples[current_hour]['count']):
                                        hourly_examples[current_hour] = {
                                            'count': hourly_counts[current_hour],
                                            'course_code': f"{subject_code}{course.get('course_code', '')}",
                                            'course_title': course.get('title', ''),
                                            'section': section.get('section', ''),
                                            'time_str': time_str,
                                            'location': meeting.get('location', ''),
                                            'term': term.get('term_name', '')
                                        }
                                else:
                                    # Normal case: count for each hour spanned
                                    while current_hour <= end_h:
                                        # For the last hour, only count if the class doesn't end exactly at the hour start
                                        if current_hour == end_h and end_m == 0:
                                            break
                                        
                                        hourly_counts[current_hour] += 1
                                        
                                        # Store example for this hour if we don't have one or this hour is busier
                                        if (current_hour not in hourly_examples or 
                                            hourly_counts[current_hour] > hourly_examples[current_hour]['count']):
                                            hourly_examples[current_hour] = {
                                                'count': hourly_counts[current_hour],
                                                'course_code': f"{subject_code}{course.get('course_code', '')}",
                                                'course_title': course.get('title', ''),
                                                'section': section.get('section', ''),
                                                'time_str': time_str,
                                                'location': meeting.get('location', ''),
                                                'term': term.get('term_name', '')
                                            }
                                        
                                        current_hour += 1
    
    # Find peak hours
    max_count = max(hourly_counts)
    peak_hours = [hour for hour, count in enumerate(hourly_counts) if count == max_count]
    
    # Find quiet hours (excluding midnight-6am which are expected to be empty)
    daytime_counts = hourly_counts[7:22]  # 7am to 9pm
    min_daytime_count = min(daytime_counts) if daytime_counts else 0
    quiet_hours = [hour for hour in range(7, 22) if hourly_counts[hour] == min_daytime_count]
    
    return {
        'hourly_counts': hourly_counts,
        'hourly_examples': hourly_examples,
        'total_sections_analyzed': total_sections_analyzed,
        'peak_hours': peak_hours,
        'peak_count': max_count,
        'quiet_hours': quiet_hours,
        'quiet_count': min_daytime_count,
        'busiest_period': {
            'start_hour': peak_hours[0] if peak_hours else 0,
            'end_hour': peak_hours[-1] if peak_hours else 0,
            'section_count': max_count
        }
    }

def analyze_course_attributes(subjects_data: Dict[str, any]) -> Dict[str, any]:
    """Analyze course and class attributes for insights with examples"""
    course_attributes = Counter()
    class_attributes = Counter()
    class_attributes_examples = {}  # Store examples for each unique class attribute
    languages = Counter()
    components = Counter()
    academic_careers = Counter()
    
    total_courses = 0
    total_sections = 0
    
    for subject_code, subject_data in subjects_data.items():
        courses = subject_data.get('courses', [])
        total_courses += len(courses)
        
        for course in courses:
            # Course-level attributes
            if course.get('course_attributes'):
                course_attributes[course['course_attributes']] += 1
            
            if course.get('component'):
                components[course['component']] += 1
                
            if course.get('academic_career'):
                academic_careers[course['academic_career']] += 1
            
            # Section-level attributes
            terms = course.get('terms', [])
            for term in terms:
                schedule = term.get('schedule', [])
                total_sections += len(schedule)
                
                for section in schedule:
                    class_attr = section.get('class_attributes', '').strip()
                    if class_attr:
                        class_attributes[class_attr] += 1
                        
                        # Store example for this class attribute if we don't have one yet
                        if class_attr not in class_attributes_examples:
                            class_attributes_examples[class_attr] = {
                                'course_code': f"{subject_code}{course.get('course_code', '')}",
                                'course_title': course.get('title', ''),
                                'section': section.get('section', ''),
                                'term': term.get('term_name', ''),
                                'subject': subject_code
                            }
                        
                        # Extract language information
                        if 'English' in class_attr:
                            languages['English'] += 1
                        elif 'Chinese' in class_attr:
                            languages['Chinese'] += 1
                        elif 'Putonghua' in class_attr:
                            languages['Putonghua'] += 1
    
    return {
        'total_courses': total_courses,
        'total_sections': total_sections,
        'course_attributes': dict(course_attributes.most_common()),
        'class_attributes': dict(class_attributes.most_common()),
        'class_attributes_examples': class_attributes_examples,
        'languages': dict(languages),
        'components': dict(components.most_common()),
        'academic_careers': dict(academic_careers)
    }

def generate_subject_summary(subjects_data: Dict[str, any]) -> Dict[str, any]:
    """Generate summary statistics by subject"""
    subject_stats = {}
    
    for subject_code, subject_data in subjects_data.items():
        courses = subject_data.get('courses', [])
        metadata = subject_data.get('metadata', {})
        
        total_sections = 0
        total_meetings = 0
        
        for course in courses:
            terms = course.get('terms', [])
            for term in terms:
                schedule = term.get('schedule', [])
                total_sections += len(schedule)
                
                for section in schedule:
                    meetings = section.get('meetings', [])
                    total_meetings += len(meetings)
        
        subject_stats[subject_code] = {
            'total_courses': len(courses),
            'total_sections': total_sections,
            'total_meetings': total_meetings,
            'scraped_at': metadata.get('scraped_at', 'unknown'),
            'subject_title': metadata.get('subject_title', subject_code)
        }
    
    return subject_stats

def analyze_enrollment_requirements(subjects_data: Dict[str, any]) -> Dict[str, any]:
    """Analyze enrollment requirements to identify course dependency patterns"""
    requirements = Counter()
    requirement_examples = {}
    dependency_keywords = Counter()
    
    # Keywords that indicate course dependencies
    dep_keywords = ['prerequisite', 'pre-requisite', 'corequisite', 'co-requisite', 
                   'concurrent', 'prior', 'completion', 'grade', 'consent', 'permission',
                   'standing', 'year', 'credit', 'gpa', 'cgpa']
    
    total_courses = 0
    courses_with_requirements = 0
    
    for subject_code, subject_data in subjects_data.items():
        courses = subject_data.get('courses', [])
        total_courses += len(courses)
        
        for course in courses:
            enrollment_req = course.get('enrollment_requirement', '').strip()
            if enrollment_req:
                courses_with_requirements += 1
                requirements[enrollment_req] += 1
                
                # Store example if we don't have one yet
                if enrollment_req not in requirement_examples:
                    requirement_examples[enrollment_req] = {
                        'course_code': f"{subject_code}{course.get('course_code', '')}",
                        'course_title': course.get('title', ''),
                        'subject': subject_code
                    }
                
                # Count dependency keywords
                req_lower = enrollment_req.lower()
                for keyword in dep_keywords:
                    if keyword in req_lower:
                        dependency_keywords[keyword] += 1
    
    # Group similar requirements (simple grouping by length and common words)
    requirement_groups = {}
    for req, count in requirements.items():
        # Simple categorization based on content
        req_lower = req.lower()
        if 'prerequisite' in req_lower or 'pre-requisite' in req_lower:
            category = 'Prerequisites'
        elif 'corequisite' in req_lower or 'co-requisite' in req_lower:
            category = 'Co-requisites'
        elif 'consent' in req_lower or 'permission' in req_lower:
            category = 'Permission Required'
        elif 'standing' in req_lower or 'year' in req_lower:
            category = 'Academic Standing'
        elif 'grade' in req_lower or 'gpa' in req_lower or 'cgpa' in req_lower:
            category = 'Grade Requirements'
        elif 'credit' in req_lower:
            category = 'Credit Requirements'
        else:
            category = 'Other Requirements'
        
        if category not in requirement_groups:
            requirement_groups[category] = []
        requirement_groups[category].append((req, count))
    
    # Sort each category by frequency
    for category in requirement_groups:
        requirement_groups[category].sort(key=lambda x: x[1], reverse=True)
    
    return {
        'total_courses': total_courses,
        'courses_with_requirements': courses_with_requirements,
        'unique_requirements': len(requirements),
        'all_requirements': dict(requirements.most_common()),
        'requirement_examples': requirement_examples,
        'dependency_keywords': dict(dependency_keywords.most_common()),
        'requirement_groups': requirement_groups
    }

def save_analysis_results(console_output: str, timestamp: str):
    """Save console output to timestamped text file"""
    # Create analysis directory
    analysis_dir = "analysis"
    os.makedirs(analysis_dir, exist_ok=True)
    
    # Save console output to text file
    txt_filename = f"{analysis_dir}/course_analysis_{timestamp}.txt"
    with open(txt_filename, 'w', encoding='utf-8') as f:
        f.write(console_output)
    
    print(f"📁 Results saved to: {txt_filename}")

def analyze_weekend_courses(subjects_data: Dict[str, any]) -> Dict[str, any]:
    """Analyze courses that have classes on weekends (Saturday/Sunday)"""
    weekend_courses = []
    weekend_sections_count = 0
    total_courses_analyzed = 0
    
    # Weekend day patterns
    weekend_patterns = [
        r'\bSa\b', r'\bSat\b', r'\bSaturday\b',  # Saturday patterns
        r'\bSu\b', r'\bSun\b', r'\bSunday\b'     # Sunday patterns
    ]
    
    for subject_code, subject_data in subjects_data.items():
        courses = subject_data.get('courses', [])
        
        for course in courses:
            total_courses_analyzed += 1
            course_has_weekend = False
            weekend_sections = []
            
            terms = course.get('terms', [])
            
            for term in terms:
                schedule = term.get('schedule', [])
                
                for section in schedule:
                    meetings = section.get('meetings', [])
                    
                    for meeting in meetings:
                        time_str = meeting.get('time', '')
                        
                        if time_str and time_str.upper() != 'TBA':
                            # Check if time string contains weekend day patterns
                            for pattern in weekend_patterns:
                                if re.search(pattern, time_str, re.IGNORECASE):
                                    course_has_weekend = True
                                    weekend_sections_count += 1
                                    weekend_sections.append({
                                        'section': section.get('section', ''),
                                        'time': time_str,
                                        'location': meeting.get('location', ''),
                                        'instructor': meeting.get('instructor', ''),
                                        'term': term.get('term_name', '')
                                    })
                                    break
            
            if course_has_weekend:
                weekend_courses.append({
                    'subject': subject_code,
                    'course_code': course.get('course_code', ''),
                    'title': course.get('title', ''),
                    'credits': course.get('credits', ''),
                    'sections': weekend_sections
                })
    
    return {
        'weekend_courses': weekend_courses,
        'weekend_sections_count': weekend_sections_count,
        'total_courses_analyzed': total_courses_analyzed,
        'weekend_course_count': len(weekend_courses)
    }

def analyze_class_vs_course_attributes(subjects_data: Dict[str, any]) -> Dict[str, any]:
    """Analyze relationship between class_attributes and course_attributes"""
    print("🧪 CLASS vs COURSE ATTRIBUTES ANALYSIS")
    print("-" * 50)
    
    total_sections = 0
    sections_with_both_attrs = 0
    pattern_matches = 0  # class_attrs ends with course_attrs (our rule)
    exact_matches = 0    # class_attrs == course_attrs
    rule_violations = 0  # cases that don't fit our rule
    
    cleaned_attributes = Counter()  # Count unique cleaned class attributes
    rule_violation_examples = []
    cleaning_examples = []
    attribute_examples = {}  # Store example courses for each cleaned attribute
    
    for subject, data in subjects_data.items():
        for course in data.get('courses', []):
            course_id = f"{course.get('subject', 'UNK')}{course.get('course_code', 'UNK')}"
            course_attrs = course.get('course_attributes', '').strip()
            
            # Check sections for class attributes
            for term in course.get('terms', []):
                for section in term.get('schedule', []):
                    class_attrs = section.get('class_attributes', '').strip()
                    total_sections += 1
                    
                    if course_attrs and class_attrs:
                        sections_with_both_attrs += 1
                        
                        # LINE-BY-LINE APPROACH: Split by newlines and compare line by line
                        class_lines = [line.strip() for line in class_attrs.split('\n') if line.strip()]
                        course_lines = [line.strip() for line in course_attrs.split('\n') if line.strip()]
                        
                        # Find lines in class_attrs that are NOT in course_attrs
                        class_specific_lines = [line for line in class_lines if line not in course_lines]
                        cleaned = '\n'.join(class_specific_lines)
                        
                        if class_attrs == course_attrs:
                            # Exact match - no class-specific attributes
                            exact_matches += 1
                            cleaned_attributes[''] += 1  # Empty after cleaning
                        elif len(class_specific_lines) < len(class_lines):
                            # Successfully extracted some course attributes
                            pattern_matches += 1
                            cleaned_attributes[cleaned] += 1
                            
                            # Store example courses for this cleaned attribute
                            if cleaned not in attribute_examples:
                                attribute_examples[cleaned] = []
                            if len(attribute_examples[cleaned]) < 3:  # Keep 3 examples per attribute
                                attribute_examples[cleaned].append(course_id)
                            
                            if len(cleaning_examples) < 10:
                                cleaning_examples.append({
                                    'course': course_id,
                                    'original': class_attrs,
                                    'course_attrs': course_attrs,
                                    'cleaned': cleaned,
                                    'lines_removed': len(class_lines) - len(class_specific_lines),
                                    'lines_total': len(class_lines)
                                })
                        else:
                            # No overlap found - course attributes not found in class attributes
                            rule_violations += 1
                            if len(rule_violation_examples) < 10:
                                rule_violation_examples.append({
                                    'course': course_id,
                                    'course_attrs': course_attrs,
                                    'class_attrs': class_attrs
                                })
                    elif class_attrs and not course_attrs:
                        # Class attrs only - no rule to apply, keep everything
                        cleaned_attributes[class_attrs] += 1
                        
                        # Store example courses for this attribute
                        if class_attrs not in attribute_examples:
                            attribute_examples[class_attrs] = []
                        if len(attribute_examples[class_attrs]) < 3:
                            attribute_examples[class_attrs].append(course_id)
    
    # Print results
    print(f"📊 Total sections analyzed: {total_sections:,}")
    print(f"📊 Sections with both attributes: {sections_with_both_attrs:,}")
    print()
    
    if sections_with_both_attrs > 0:
        print("🔍 LINE-BY-LINE CLEANING ANALYSIS:")
        rule_followers = pattern_matches + exact_matches
        print(f"  ✅ Successfully cleaned: {rule_followers:,} ({rule_followers/sections_with_both_attrs*100:.1f}%)")
        print(f"     └─ Exact matches (no class-specific attrs): {exact_matches:,}")
        print(f"     └─ Partial matches (extracted course attrs): {pattern_matches:,}")
        print(f"  ❌ No overlap found: {rule_violations:,} ({rule_violations/sections_with_both_attrs*100:.1f}%)")
        print()
        
        # Cleaned attributes summary moved to enhanced section below
        
        # Show cleaning examples
        if cleaning_examples:
            print("📝 LINE-BY-LINE CLEANING EXAMPLES:")
            for ex in cleaning_examples[:5]:
                print(f"  Course: {ex['course']}")
                print(f"    Original class attrs: '{ex['original']}'")
                print(f"    Course attrs: '{ex['course_attrs']}'")
                print(f"    Cleaned result: '{ex['cleaned']}'")
                print(f"    Lines removed: {ex['lines_removed']}/{ex['lines_total']}")
                print()
        
        # Show rule violations
        if rule_violation_examples:
            print("⚠️  NO OVERLAP CASES (course attrs not found in class attrs):")
            for ex in rule_violation_examples[:5]:
                print(f"  Course: {ex['course']}")
                print(f"    Course attrs: '{ex['course_attrs']}'")
                print(f"    Class attrs:  '{ex['class_attrs']}'")
                print()
            
            if len(rule_violation_examples) > 5:
                print(f"    ... and {len(rule_violation_examples) - 5} more cases")
                print()
        
        # NEW: Show all unique class-specific attributes with examples
        print("📋 ALL UNIQUE CLASS-SPECIFIC ATTRIBUTES:")
        print("   (These should be meaningful class attributes like languages, teaching methods)")
        print()
        
        # Sort by frequency for easier analysis
        all_unique_attrs = sorted(cleaned_attributes.items(), key=lambda x: x[1], reverse=True)
        
        # Count multi-line attributes (complex cases)
        multi_line_attrs = 0
        multi_line_sections = 0
        
        for attr, count in all_unique_attrs:
            if attr:  # Skip empty
                # Check if this is a multi-line attribute (complex case)
                line_count = len([line for line in attr.split('\n') if line.strip()])
                if line_count > 1:
                    multi_line_attrs += 1
                    multi_line_sections += count
                
                # Show first 50 characters for readability
                display_attr = attr if len(attr) <= 50 else attr[:47] + "..."
                examples = attribute_examples.get(attr, [])
                example_str = f" (e.g., {', '.join(examples[:2])})" if examples else ""
                
                print(f"  \"{display_attr}\": {count:,} sections{example_str}")
        
        print()
        print(f"📊 SUMMARY: {len(all_unique_attrs)} unique attribute combinations found")
        non_empty = len([attr for attr, count in all_unique_attrs if attr])
        print(f"📊 Non-empty class-specific attributes: {non_empty}")
        print()
        
        # Special analysis for complex (multi-line) cases
        print("🚨 COMPLEX MULTI-LINE CLEANED ATTRIBUTES:")
        print("   (Cases where cleaned result still contains multiple attributes)")
        print(f"   📊 {multi_line_attrs} attribute types affect {multi_line_sections:,} sections")
        print()
        
        complex_examples = []
        for attr, count in all_unique_attrs:
            if attr:  # Skip empty
                line_count = len([line for line in attr.split('\n') if line.strip()])
                if line_count > 1 and len(complex_examples) < 10:
                    examples = attribute_examples.get(attr, [])
                    complex_examples.append({
                        'attr': attr,
                        'count': count,
                        'line_count': line_count,
                        'examples': examples[:3]
                    })
        
        for ex in complex_examples[:5]:
            print(f"  📄 {ex['line_count']} lines, {ex['count']:,} sections:")
            for line in ex['attr'].split('\n')[:3]:  # Show first 3 lines
                if line.strip():
                    print(f"     └─ \"{line.strip()}\"")
            if ex['examples']:
                print(f"     📚 Examples: {', '.join(ex['examples'])}")
            print()
        
        if len(complex_examples) > 5:
            print(f"    ... and {len(complex_examples) - 5} more complex cases")
            print()
    
    return {
        'total_sections': total_sections,
        'sections_with_both_attrs': sections_with_both_attrs,
        'pattern_matches': pattern_matches,
        'exact_matches': exact_matches,
        'rule_violations': rule_violations,
        'cleaned_attributes_count': len([attr for attr in cleaned_attributes.keys() if attr]),
        'rule_violation_examples': rule_violation_examples
    }

def main():
    """Main analysis function"""
    import sys
    from io import StringIO
    
    # Create timestamp for this analysis run
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Capture stdout
    original_stdout = sys.stdout
    captured_output = StringIO()
    sys.stdout = captured_output
    
    try:
        print("🔍 CUHK Course Data Analysis")
        print("=" * 50)
        print(f"🕒 Analysis timestamp: {timestamp}")
        
        # Load all subject data
        subjects_data = load_subject_data()
        
        if not subjects_data:
            print("❌ No data found. Make sure JSON files exist in data/ directory")
            return
        
        print()
        
        # 1. Section Types Analysis
        print("📋 CORE SECTION TYPES ANALYSIS")
        print("-" * 35)
        section_types, section_examples = extract_section_types(subjects_data)
        
        print(f"🔢 Found {len(section_types)} core section types")
        print(f"🎯 Core types: {', '.join(sorted(section_types.keys()))}")
        print()
        print("Section types with examples:")
        for stype in sorted(section_types.keys()):
            count = section_types[stype]
            print(f"\n{stype}: {count} sections")
            if stype in section_examples:
                example = section_examples[stype]
                print(f"  📚 Example: {example['subject']}{example['course_code']} - {example['course_title']}")
                print(f"  📋 Section: {example['section_name']}")
                if example['meetings']:
                    meeting = example['meetings'][0]
                    print(f"  ⏰ Time: {meeting.get('time', 'TBA')}")
                    print(f"  📍 Location: {meeting.get('location', 'TBA')}")
        
        print()
        
        # 2. Time Range Analysis
        print("⏰ TIME RANGE ANALYSIS")
        print("-" * 25)
        time_analysis = analyze_time_ranges(subjects_data)
        
        earliest = time_analysis['earliest_start']
        latest = time_analysis['latest_end']
        earliest_example = time_analysis['earliest_example']
        latest_example = time_analysis['latest_example']
        
        print(f"🌅 Earliest class start: {earliest[0]:02d}:{earliest[1]:02d}")
        if earliest_example:
            print(f"   📚 Example: {earliest_example['course_code']} - {earliest_example['course_title']}")
            print(f"   📋 Section: {earliest_example['section']}")
            print(f"   ⏰ Time: {earliest_example['time_str']}")
            print(f"   📍 Location: {earliest_example['location']}")
            print(f"   📅 Term: {earliest_example['term']}")
        
        print()
        print(f"🌆 Latest class end: {latest[0]:02d}:{latest[1]:02d}")
        if latest_example:
            print(f"   📚 Example: {latest_example['course_code']} - {latest_example['course_title']}")
            print(f"   📋 Section: {latest_example['section']}")
            print(f"   ⏰ Time: {latest_example['time_str']}")
            print(f"   📍 Location: {latest_example['location']}")
            print(f"   📅 Term: {latest_example['term']}")
        
        print()
        print(f"📊 Total time slots analyzed: {time_analysis['total_time_slots']}")
        print(f"🔄 Unique time patterns: {time_analysis['unique_time_patterns']}")
        print()
        print("Most common time patterns:")
        for pattern, count in time_analysis['common_time_patterns']:
            print(f"  {pattern:<30} : {count:>3} times")
        
        print()
        
        # 3. Hourly Distribution Analysis
        print("📊 HOURLY DISTRIBUTION ANALYSIS")
        print("-" * 35)
        hourly_analysis = analyze_hourly_distribution(subjects_data)
        
        hourly_counts = hourly_analysis['hourly_counts']
        peak_hours = hourly_analysis['peak_hours']
        quiet_hours = hourly_analysis['quiet_hours']
        
        print(f"📈 Total sections analyzed: {hourly_analysis['total_sections_analyzed']}")
        print(f"🔥 Peak hours: {[f'{h:02d}:00' for h in peak_hours]} ({hourly_analysis['peak_count']} sections)")
        print(f"😴 Quietest hours: {[f'{h:02d}:00' for h in quiet_hours]} ({hourly_analysis['quiet_count']} sections)")
        print()
        
        print("📅 Hourly breakdown (sections active per hour - all 24 hours):")
        # Show all 24 hours to catch unusual scheduling
        max_count = max(hourly_counts) if hourly_counts else 1
        for hour in range(24):
            count = hourly_counts[hour]
            # Create a simple bar chart using characters (scale based on max)
            if max_count > 0:
                bar_length = min(50, (count * 50) // max_count)  # Scale relative to max
            else:
                bar_length = 0
            bar = '█' * bar_length
            
            # Add special indicators for unusual hours
            if count > 0 and (hour < 7 or hour > 21):
                indicator = " ⚠️ UNUSUAL"
            elif count == 0:
                indicator = ""
            else:
                indicator = ""
            
            print(f"  {hour:02d}:00 │{count:>4} sections │{bar}{indicator}")
        
        print()
        
        # Check for unusual hours (before 7am or after 9pm)
        unusual_hours = []
        for hour in range(24):
            if hourly_counts[hour] > 0 and (hour < 7 or hour > 21):
                unusual_hours.append((hour, hourly_counts[hour]))
        
        if unusual_hours:
            print("⚠️ UNUSUAL HOURS DETECTED:")
            for hour, count in unusual_hours:
                print(f"   {hour:02d}:00 - {count} sections")
                if hour in hourly_analysis['hourly_examples']:
                    example = hourly_analysis['hourly_examples'][hour]
                    print(f"      📚 Example: {example['course_code']} - {example['course_title']}")
                    print(f"      📋 Section: {example['section']}")
                    print(f"      ⏰ Time: {example['time_str']}")
                    print(f"      📍 Location: {example['location']}")
            print()
        else:
            print("✅ No unusual hours detected (all classes between 7:00-21:59)")
            print()
        
        print("🎯 Top 3 busiest hours with examples:")
        # Sort hours by count and show top 3
        sorted_hours = sorted(enumerate(hourly_counts), key=lambda x: x[1], reverse=True)
        for i, (hour, count) in enumerate(sorted_hours[:3]):
            if count > 0:
                print(f"\n{i+1}. {hour:02d}:00 - {count} sections")
                if hour in hourly_analysis['hourly_examples']:
                    example = hourly_analysis['hourly_examples'][hour]
                    print(f"   📚 Example: {example['course_code']} - {example['course_title']}")
                    print(f"   📋 Section: {example['section']}")
                    print(f"   ⏰ Time: {example['time_str']}")
                    print(f"   📍 Location: {example['location']}")
        
        print()
        
        # 4. Enrollment Requirements Analysis  
        print("📋 ENROLLMENT REQUIREMENTS ANALYSIS")
        print("-" * 38)
        req_analysis = analyze_enrollment_requirements(subjects_data)
        
        print(f"📊 Overview:")
        print(f"   Total courses: {req_analysis['total_courses']}")
        print(f"   Courses with requirements: {req_analysis['courses_with_requirements']}")
        print(f"   Unique requirement patterns: {req_analysis['unique_requirements']}")
        print(f"   Coverage: {req_analysis['courses_with_requirements']/req_analysis['total_courses']*100:.1f}%")
        print()
        
        # Show most common dependency keywords
        print("🔑 Most common dependency keywords:")
        dep_keywords = req_analysis['dependency_keywords']
        for keyword, count in list(dep_keywords.items())[:10]:
            print(f"   {keyword:<15} : {count:>3} courses")
        print()
        
        # Show grouped requirements
        requirement_groups = req_analysis['requirement_groups']
        requirement_examples = req_analysis['requirement_examples']
        
        print("📚 Requirements by category:")
        for category, requirements in requirement_groups.items():
            print(f"\n🏷️ {category} ({len(requirements)} patterns):")
            
            # Show top 3 most common patterns in this category
            for i, (req_text, count) in enumerate(requirements[:3]):
                print(f"   {i+1}. [{count:>2}x] \"{req_text}\"")
                if req_text in requirement_examples:
                    example = requirement_examples[req_text]
                    print(f"      📚 Example: {example['course_code']} - {example['course_title']}")
                print()
            
            # If there are more than 3, show summary
            if len(requirements) > 3:
                remaining = len(requirements) - 3
                remaining_count = sum(count for _, count in requirements[3:])
                print(f"   ... and {remaining} more patterns ({remaining_count} courses)")
                print()
        
        print()
        
        # 6. Weekend Course Analysis  
        print("🏖️ WEEKEND COURSE ANALYSIS")
        print("-" * 30)
        weekend_analysis = analyze_weekend_courses(subjects_data)
        
        weekend_count = weekend_analysis['weekend_course_count']
        sections_count = weekend_analysis['weekend_sections_count']
        total_analyzed = weekend_analysis['total_courses_analyzed']
        
        print(f"📊 Weekend Course Statistics:")
        print(f"   Total courses analyzed: {total_analyzed:,}")
        print(f"   Courses with weekend classes: {weekend_count}")
        print(f"   Weekend sections found: {sections_count}")
        print(f"   Percentage: {(weekend_count/total_analyzed*100):.2f}% of courses have weekend classes")
        print()
        
        if weekend_count > 0:
            print("📋 Weekend Courses Found:")
            for course in weekend_analysis['weekend_courses'][:3]:  # Show first 3 examples
                print(f"   📚 {course['subject']}{course['course_code']} - {course['title']}")
                print(f"      Credits: {course['credits']}")
                for section in course['sections'][:2]:  # Show first 2 sections per course
                    print(f"      └─ {section['section']}: {section['time']}")
                    if section['location']:
                        print(f"         📍 {section['location']}")
                    if section['instructor']:
                        print(f"         👨‍🏫 {section['instructor']}")
                print()
            
            if weekend_count > 3:
                print(f"   ... and {weekend_count - 3} more weekend courses")
                print()
        else:
            print("   ✅ No weekend courses found - all classes are on weekdays")
            print()
        
        print()
        
        # 7. Class vs Course Attributes Analysis
        analyze_class_vs_course_attributes(subjects_data)
        print()
        
        # 7. Subject Summary
        print("📊 SUBJECT SUMMARY")
        print("-" * 20)
        subject_stats = generate_subject_summary(subjects_data)
        
        # Sort by number of courses (descending)
        sorted_subjects = sorted(subject_stats.items(), 
                               key=lambda x: x[1]['total_courses'], 
                               reverse=True)
        
        print("Top subjects by course count:")
        for subject, stats in sorted_subjects[:15]:
            title = stats.get('subject_title', subject)
            if title != subject:
                display_name = f"{subject} ({title})"
            else:
                display_name = subject
            
            print(f"  {display_name:<35} : {stats['total_courses']:>3} courses, {stats['total_sections']:>4} sections")
        
        print()
        print("💡 RECOMMENDATIONS")
        print("-" * 20)
        print("Based on this analysis:")
        print()
        print("🕒 Calendar Time Range:")
        print(f"   - Suggested start: {max(7, earliest[0] - 1):02d}:00 (earliest class at {earliest[0]:02d}:{earliest[1]:02d})")
        print(f"   - Suggested end: {min(23, latest[0] + 1):02d}:00 (latest class ends at {latest[0]:02d}:{latest[1]:02d})")
        print()
        print("📋 Section Type Handling:")
        print(f"   - Core types to handle: {', '.join(sorted(section_types.keys()))}")
        print("   - All section patterns are now consolidated into core types")
        print()
        print("🌐 Language Support:")
        print("   - Language analysis moved to class_attributes cleaning analysis")
    
    finally:
        # Restore stdout and save captured output
        sys.stdout = original_stdout
        console_text = captured_output.getvalue()
        
        # Print to console
        print(console_text, end='')
        
        # Save to file
        save_analysis_results(console_text, timestamp)

if __name__ == "__main__":
    main()