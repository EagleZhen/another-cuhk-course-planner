#!/usr/bin/env python3
"""
Debug script to check time data in course files
"""

import json
import glob
import re
from typing import Tuple

def parse_time_string(time_str: str) -> Tuple[int, int, int, int]:
    """Parse time string and return (start_hour, start_min, end_hour, end_min)"""
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

def main():
    print("🔍 Debug: Analyzing time data in course files")
    
    # Load just one subject file to debug
    json_files = glob.glob("data/*.json")
    if not json_files:
        print("❌ No JSON files found in data/ directory")
        return
    
    print(f"📂 Found {len(json_files)} JSON files")
    print(f"🎯 Analyzing first file: {json_files[0]}")
    
    # Load first file
    with open(json_files[0], 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    courses = data.get('courses', [])
    print(f"📚 Found {len(courses)} courses in file")
    
    time_examples = []
    valid_times = []
    
    for i, course in enumerate(courses[:3]):  # Check first 3 courses
        print(f"\n📖 Course {i+1}: {course.get('course_code', 'Unknown')}")
        terms = course.get('terms', [])
        
        for term in terms:
            print(f"  📅 Term: {term.get('term_name', 'Unknown')}")
            schedule = term.get('schedule', [])
            
            for section in schedule:
                section_name = section.get('section', 'Unknown')
                meetings = section.get('meetings', [])
                
                for meeting in meetings:
                    time_str = meeting.get('time', '')
                    location = meeting.get('location', '')
                    instructor = meeting.get('instructor', '')
                    
                    if time_str:
                        time_examples.append({
                            'raw_time': time_str,
                            'section': section_name,
                            'location': location,
                            'instructor': instructor
                        })
                        
                        # Try to parse it
                        parsed = parse_time_string(time_str)
                        if parsed[0] != -1:
                            valid_times.append(parsed)
                            print(f"    ✅ {time_str} → {parsed}")
                        else:
                            print(f"    ❌ {time_str} → failed to parse")
    
    print(f"\n📊 SUMMARY:")
    print(f"   Total time examples found: {len(time_examples)}")
    print(f"   Valid parsed times: {len(valid_times)}")
    
    if time_examples:
        print(f"\n🕐 First 10 time examples:")
        for i, example in enumerate(time_examples[:10]):
            print(f"   {i+1}. '{example['raw_time']}' ({example['section']})")
    
    if valid_times:
        # Calculate correct ranges
        start_hours = [t[0] for t in valid_times]
        start_mins = [t[1] for t in valid_times]
        end_hours = [t[2] for t in valid_times]
        end_mins = [t[3] for t in valid_times]
        
        earliest_start_h = min(start_hours)
        earliest_start_m = min([t[1] for t in valid_times if t[0] == earliest_start_h])
        latest_end_h = max(end_hours)
        latest_end_m = max([t[3] for t in valid_times if t[2] == latest_end_h])
        
        print(f"\n⏰ CORRECT TIME RANGES:")
        print(f"   Earliest start: {earliest_start_h:02d}:{earliest_start_m:02d}")
        print(f"   Latest end: {latest_end_h:02d}:{latest_end_m:02d}")
        
        print(f"\n📈 All start hours: {sorted(set(start_hours))}")
        print(f"📈 All end hours: {sorted(set(end_hours))}")

if __name__ == "__main__":
    main()