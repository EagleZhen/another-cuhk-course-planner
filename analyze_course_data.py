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
    Examples: "Mo Tu Th Fr 09:30 - 10:15", "Th 14:30 - 17:15"
    Returns (-1, -1, -1, -1) if parsing fails
    """
    if not time_str or time_str.upper() == 'TBA':
        return (-1, -1, -1, -1)
    
    # Look for time pattern: HH:MM - HH:MM
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
    """Analyze earliest and latest class times"""
    all_times = []
    earliest_start = (24, 0)  # (hour, minute)
    latest_end = (0, 0)
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
                                
                                # Track earliest start
                                if (start_h, start_m) < earliest_start:
                                    earliest_start = (start_h, start_m)
                                
                                # Track latest end
                                if (end_h, end_m) > latest_end:
                                    latest_end = (end_h, end_m)
    
    return {
        'earliest_start': earliest_start,
        'latest_end': latest_end,
        'total_time_slots': len(all_times),
        'unique_time_patterns': len(time_patterns),
        'common_time_patterns': time_patterns.most_common(10)
    }

def analyze_course_attributes(subjects_data: Dict[str, any]) -> Dict[str, any]:
    """Analyze course and class attributes for insights"""
    course_attributes = Counter()
    class_attributes = Counter()
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
                    if section.get('class_attributes'):
                        class_attributes[section['class_attributes']] += 1
                        
                        # Extract language information
                        class_attr = section['class_attributes']
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

def save_analysis_results(results: Dict, timestamp: str):
    """Save analysis results to timestamped file"""
    # Create analysis directory
    analysis_dir = "analysis"
    os.makedirs(analysis_dir, exist_ok=True)
    
    # Save detailed results as JSON
    json_filename = f"{analysis_dir}/course_analysis_{timestamp}.json"
    with open(json_filename, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2, default=str)
    
    # Save human-readable summary
    txt_filename = f"{analysis_dir}/course_analysis_{timestamp}.txt"
    with open(txt_filename, 'w', encoding='utf-8') as f:
        f.write("🔍 CUHK Course Data Analysis Results\n")
        f.write("=" * 50 + "\n")
        f.write(f"Generated: {timestamp}\n\n")
        
        # Section types
        f.write("📋 CORE SECTION TYPES\n")
        f.write("-" * 25 + "\n")
        section_types = results['section_types']['counts']
        section_examples = results['section_types']['examples']
        
        for stype in sorted(section_types.keys()):
            count = section_types[stype]
            f.write(f"\n{stype}: {count} sections\n")
            if stype in section_examples:
                example = section_examples[stype]
                f.write(f"  Example: {example['subject']}{example['course_code']} - {example['course_title']}\n")
                f.write(f"  Section: {example['section_name']}\n")
                if example['meetings']:
                    meeting = example['meetings'][0]
                    f.write(f"  Time: {meeting.get('time', 'TBA')}\n")
                    f.write(f"  Location: {meeting.get('location', 'TBA')}\n")
        
        # Time ranges
        f.write(f"\n\n⏰ TIME RANGES\n")
        f.write("-" * 15 + "\n")
        time_data = results['time_analysis']
        earliest = time_data['earliest_start']
        latest = time_data['latest_end']
        f.write(f"Earliest start: {earliest[0]:02d}:{earliest[1]:02d}\n")
        f.write(f"Latest end: {latest[0]:02d}:{latest[1]:02d}\n")
        f.write(f"Total time slots: {time_data['total_time_slots']}\n")
        
        # Subject summary
        f.write(f"\n\n📊 SUBJECT SUMMARY\n")
        f.write("-" * 20 + "\n")
        f.write(f"Total subjects analyzed: {len(results['subject_summary'])}\n")
        f.write(f"Total courses: {results['course_attributes']['total_courses']}\n")
        f.write(f"Total sections: {results['course_attributes']['total_sections']}\n")
    
    print(f"📁 Results saved to:")
    print(f"   📄 {txt_filename}")
    print(f"   📊 {json_filename}")

def main():
    """Main analysis function"""
    # Create timestamp for this analysis run
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
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
    
    print(f"🌅 Earliest class start: {earliest[0]:02d}:{earliest[1]:02d}")
    print(f"🌆 Latest class end: {latest[0]:02d}:{latest[1]:02d}")
    print(f"📊 Total time slots analyzed: {time_analysis['total_time_slots']}")
    print(f"🔄 Unique time patterns: {time_analysis['unique_time_patterns']}")
    print()
    print("Most common time patterns:")
    for pattern, count in time_analysis['common_time_patterns']:
        print(f"  {pattern:<30} : {count:>3} times")
    
    print()
    
    # 3. Course Attributes Analysis
    print("📝 COURSE ATTRIBUTES ANALYSIS")
    print("-" * 32)
    attr_analysis = analyze_course_attributes(subjects_data)
    
    print(f"📚 Total courses: {attr_analysis['total_courses']}")
    print(f"📋 Total sections: {attr_analysis['total_sections']}")
    print()
    print("Languages of instruction:")
    for lang, count in attr_analysis['languages'].items():
        print(f"  {lang:<15} : {count:>4} sections")
    
    print()
    
    # 4. Subject Summary
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
    
    # 5. Collect all results for saving
    analysis_results = {
        'analysis_timestamp': timestamp,
        'data_summary': {
            'total_subjects': len(subjects_data),
            'subjects_analyzed': list(subjects_data.keys())
        },
        'section_types': {
            'counts': section_types,
            'examples': section_examples
        },
        'time_analysis': time_analysis,
        'course_attributes': attr_analysis,
        'subject_summary': subject_stats
    }
    
    # 6. Save results and recommendations
    save_analysis_results(analysis_results, timestamp)
    
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
    languages = attr_analysis['languages']
    if languages:
        print("   - Languages found:", ', '.join(languages.keys()))
        print("   - Consider adding language indicators in UI")

if __name__ == "__main__":
    main()