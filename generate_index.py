#!/usr/bin/env python3
"""
Term-Specific Index Generator for CUHK Course Planner
Post-processes all subject JSON files to generate lightweight search indexes per term.

Usage:
    python generate_index.py
    python generate_index.py --data-dir web/public/data
"""

import json
import os
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Set, Any
import argparse

def extract_unique_instructors(course_data: Dict[str, Any], term_filter: str = None) -> List[str]:
    """Extract and deduplicate instructor names from course terms (keeping titles)"""
    instructors = set()
    
    for term in course_data.get('terms', []):
        # Filter by specific term if provided
        if term_filter and term.get('term_name') != term_filter:
            continue
            
        # Use 'schedule' field as that's what the scraper generates
        for section in term.get('schedule', []):
            for meeting in section.get('meetings', []):
                instructor = meeting.get('instructor', '').strip()
                if instructor and instructor not in ['TBD', 'TBA', '']:
                    instructors.add(instructor)
    
    # Sort instructors for consistent output
    return sorted(list(instructors))

def get_available_terms(course_data: Dict[str, Any]) -> List[str]:
    """Extract available terms for this course"""
    terms = []
    for term in course_data.get('terms', []):
        term_name = term.get('term_name', '').strip()
        if term_name and term_name not in terms:
            terms.append(term_name)
    return sorted(terms)

def count_sections_for_term(course_data: Dict[str, Any], term_filter: str = None) -> int:
    """Count sections for a specific term"""
    total = 0
    for term in course_data.get('terms', []):
        if term_filter and term.get('term_name') != term_filter:
            continue
        # Use 'schedule' field as that's what the scraper generates    
        total += len(term.get('schedule', []))
    return total

def extract_all_terms_from_subjects(data_dir: str) -> Set[str]:
    """Scan all subject files to find all available terms"""
    data_path = Path(data_dir)
    all_terms = set()
    
    # Only process 4-character uppercase subject files
    subject_files = [
        f for f in data_path.glob("*.json")
        if len(f.stem) == 4 and f.stem.isupper()
    ]
    
    for subject_file in subject_files:
            
        try:
            with open(subject_file, 'r', encoding='utf-8') as f:
                subject_data = json.load(f)
                
            for course in subject_data.get('courses', []):
                for term in course.get('terms', []):
                    term_name = term.get('term_name', '').strip()
                    if term_name:
                        all_terms.add(term_name)
                        
        except Exception as e:
            print(f"⚠️ Warning: Could not scan {subject_file.name} for terms: {e}")
            continue
    
    return all_terms

def process_subject_file_for_term(subject_file: Path, term_filter: str) -> tuple[List[Dict], int, List[str]]:
    """
    Process a single subject JSON file and extract index entries for a specific term
    
    Args:
        subject_file: Path to subject JSON file
        term_filter: Specific term to extract data for
    
    Returns:
        tuple: (index_entries, course_count, errors)
    """
    subject_name = subject_file.stem
    index_entries = []
    errors = []
    
    try:
        with open(subject_file, 'r', encoding='utf-8') as f:
            subject_data = json.load(f)
        
        courses = subject_data.get('courses', [])
        if not courses:
            return [], 0, []  # Empty subject, not an error
            
        for course in courses:
            try:
                # Check if course is offered in this term
                course_offered_in_term = False
                for term in course.get('terms', []):
                    if term.get('term_name') == term_filter:
                        course_offered_in_term = True
                        break
                
                if not course_offered_in_term:
                    continue  # Skip courses not offered in this term
                
                # Extract core course information
                subject = course.get('subject', subject_name)
                course_code = course.get('course_code', '').strip()
                title = course.get('title', '').strip()
                credits_str = course.get('credits', '3.0')
                grading_basis = course.get('grading_basis', 'Graded')
                
                # Handle credits conversion (scraped data has string values)
                try:
                    credits = float(credits_str) if credits_str else 3.0
                except (ValueError, TypeError):
                    credits = 3.0
                
                # Validate required fields
                if not course_code or not title:
                    continue  # Skip invalid courses quietly
                
                # Generate course ID
                course_id = f"{subject}{course_code}"
                
                # Extract term-specific metadata
                instructors = extract_unique_instructors(course, term_filter)
                section_count = count_sections_for_term(course, term_filter)
                
                # Create index entry with clear, readable field names
                index_entry = {
                    "id": course_id,
                    "subject": subject,
                    "code": course_code,
                    "title": title,
                    "credits": credits,
                    "grading_basis": grading_basis,
                    "instructors": instructors,
                    "section_count": section_count,
                    # Optional fields that might be useful
                    "has_description": bool(course.get('description', '').strip()),
                    "has_prerequisites": bool(course.get('enrollment_requirement', '').strip())
                }
                
                index_entries.append(index_entry)
                
            except Exception as e:
                errors.append(f"{subject_name}: Error processing course {course.get('course_code', 'unknown')}: {str(e)}")
                continue
                
    except Exception as e:
        errors.append(f"{subject_name}: Failed to read file: {str(e)}")
        return [], 0, errors
    
    return index_entries, len(index_entries), errors

def generate_term_indexes(data_dir: str):
    """
    Generate separate index files for each term from all subject JSON files
    
    Args:
        data_dir: Directory containing subject JSON files
    """
    
    print(f"🔍 Scanning {data_dir} for subject JSON files...")
    
    data_path = Path(data_dir)
    if not data_path.exists():
        raise FileNotFoundError(f"Data directory not found: {data_dir}")
    
    # Find all subject JSON files (4-character uppercase names only)
    subject_files = [
        f for f in data_path.glob("*.json") 
        if len(f.stem) == 4 and f.stem.isupper()
    ]
    
    if not subject_files:
        raise FileNotFoundError(f"No subject JSON files found in {data_dir}")
    
    print(f"📚 Found {len(subject_files)} subject files")
    
    # First, discover all available terms
    print(f"🔍 Discovering available terms...")
    all_terms = extract_all_terms_from_subjects(data_dir)
    
    if not all_terms:
        raise ValueError("No terms found in any subject files")
    
    print(f"📅 Found {len(all_terms)} terms: {sorted(all_terms)}")
    
    # Generate index for each term
    all_generated_files = []
    
    for term in sorted(all_terms):
        print(f"\n🏗️ Generating index for {term}...")
        
        # Process all subjects for this specific term
        term_courses = []
        total_courses = 0
        subjects_with_courses = set()  # Only subjects that actually have courses in this term
        all_errors = []
        
        for subject_file in sorted(subject_files):
            subject_name = subject_file.stem
            
            courses, count, errors = process_subject_file_for_term(subject_file, term)
            
            term_courses.extend(courses)
            total_courses += count
            all_errors.extend(errors)
            
            if count > 0:
                subjects_with_courses.add(subject_name)  # Only add if courses found
                print(f"   ✅ {subject_name}: {count} courses")
        
        # Skip terms with no courses
        if total_courses == 0:
            print(f"   ⚠️ Skipping {term} - no courses found")
            continue
        
        # Sort courses by subject then course code for consistent ordering
        term_courses.sort(key=lambda x: (x['subject'], x['code']))
        
        # Create term-specific index structure
        index_data = {
            "metadata": {
                "generated_at": datetime.now().isoformat(),
                "format_version": 1,
                "term": term,
                "total_courses": total_courses,
                "total_subjects": len(subjects_with_courses),
                "subjects": sorted(list(subjects_with_courses)),
                "processing_summary": {
                    "files_processed": len(subject_files),
                    "courses_extracted": total_courses,
                    "errors_count": len(all_errors)
                }
            },
            "courses": term_courses
        }
        
        # Add errors to metadata if there are any (for debugging)
        if all_errors:
            index_data["metadata"]["processing_errors"] = all_errors[:20]  # Limit to first 20 errors per term
            if len(all_errors) > 20:
                index_data["metadata"]["processing_errors"].append(f"... and {len(all_errors) - 20} more errors")
        
        # Generate filename with spaces (as agreed)
        output_filename = f"Index {term}.json"
        output_path = data_path / output_filename
        
        # Write index file
        print(f"📝 Writing to {output_filename}...")
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(index_data, f, ensure_ascii=False, indent=2)
        
        # Calculate file size
        file_size = output_path.stat().st_size
        size_mb = file_size / (1024 * 1024)
        
        print(f"   ✅ Generated: {size_mb:.2f} MB, {total_courses:,} courses")
        all_generated_files.append((output_filename, size_mb, total_courses))
    
    # Summary report
    print(f"\n🎉 Term index generation complete!")
    print(f"\n📊 Generated Files:")
    
    total_size = 0
    total_all_courses = 0
    
    for filename, size_mb, course_count in all_generated_files:
        print(f"   📄 {filename}")
        print(f"      Size: {size_mb:.2f} MB")
        print(f"      Courses: {course_count:,}")
        total_size += size_mb
        total_all_courses += course_count
    
    print(f"\n📈 Overall Statistics:")
    print(f"   - Total index files: {len(all_generated_files)}")
    print(f"   - Total index size: {total_size:.2f} MB")
    print(f"   - Total course entries: {total_all_courses:,}")
    
    # Calculate original data size for comparison
    original_size = sum(f.stat().st_size for f in subject_files)
    original_mb = original_size / (1024 * 1024)
    reduction_percent = (1 - total_size / original_mb) * 100 if original_mb > 0 else 0
    
    print(f"   - Original data size: {original_mb:.2f} MB")
    print(f"   - Size reduction: {reduction_percent:.1f}%")
    
    print(f"\n🚀 Ready for frontend integration!")
    print(f"   Load term-specific indexes for instant search per term.")
    
    # Prompt to move files to web app data folder
    move_to_webapp(data_dir, all_generated_files, subject_files)

def move_to_webapp(source_dir: str, generated_files: List[tuple], subject_files: List[Path]):
    """
    Prompt user to move generated index files and subject files to web app data folder
    
    Args:
        source_dir: Source directory containing the files
        generated_files: List of (filename, size_mb, course_count) tuples for generated indexes
        subject_files: List of Path objects for subject JSON files
    """
    webapp_data_dir = "web/public/data"
    source_path = Path(source_dir)
    webapp_path = Path(webapp_data_dir)
    
    # Check if we're already in the web app data directory
    if source_path.resolve() == webapp_path.resolve():
        print(f"\n✅ Files are already in the web app data directory: {webapp_data_dir}")
        return
    
    print(f"\n📁 File Transfer Options:")
    print(f"   Source: {source_dir}")
    print(f"   Target: {webapp_data_dir}")
    
    # Check if target directory exists
    if not webapp_path.exists():
        print(f"   ⚠️ Target directory doesn't exist: {webapp_data_dir}")
        create_dir = input(f"   Create directory? (y/n): ").lower().strip()
        if create_dir == 'y':
            webapp_path.mkdir(parents=True, exist_ok=True)
            print(f"   ✅ Created directory: {webapp_data_dir}")
        else:
            print(f"   ❌ Skipping file transfer")
            return
    
    # Show what will be moved
    print(f"\n📋 Files to transfer:")
    
    # List index files
    print(f"   📊 Index files ({len(generated_files)}):")
    for filename, size_mb, course_count in generated_files:
        print(f"      - {filename} ({size_mb:.2f} MB, {course_count:,} courses)")
    
    # List subject files  
    print(f"   📚 Subject files ({len(subject_files)}):")
    subject_total_size = 0
    for subject_file in sorted(subject_files):
        file_size_mb = subject_file.stat().st_size / (1024 * 1024)
        subject_total_size += file_size_mb
        print(f"      - {subject_file.name} ({file_size_mb:.2f} MB)")
    
    total_transfer_size = sum(size for _, size, _ in generated_files) + subject_total_size
    print(f"\n   📈 Total transfer size: {total_transfer_size:.2f} MB")
    
    # Ask for confirmation
    print(f"\n❓ Move files to web app data directory?")
    print(f"   This will copy all files to {webapp_data_dir}")
    print(f"   Existing files will be overwritten.")
    
    choice = input(f"   Continue? (y/n): ").lower().strip()
    
    if choice != 'y':
        print(f"   ❌ Transfer cancelled")
        return
    
    # Perform the transfer
    import shutil
    
    try:
        files_moved = 0
        total_files = len(generated_files) + len(subject_files)
        
        print(f"\n🚚 Transferring files...")
        
        # Move index files
        for filename, _, _ in generated_files:
            source_file = source_path / filename
            target_file = webapp_path / filename
            
            if source_file.exists():
                shutil.copy2(source_file, target_file)
                files_moved += 1
                print(f"   ✅ {filename}")
            else:
                print(f"   ⚠️ {filename} not found")
        
        # Move subject files
        for subject_file in subject_files:
            target_file = webapp_path / subject_file.name
            shutil.copy2(subject_file, target_file)
            files_moved += 1
            print(f"   ✅ {subject_file.name}")
        
        print(f"\n🎉 Transfer complete!")
        print(f"   📁 Destination: {webapp_data_dir}")
        print(f"   📊 Files transferred: {files_moved}/{total_files}")
        print(f"   💾 Total size: {total_transfer_size:.2f} MB")
        
        if files_moved == total_files:
            print(f"\n✅ All files successfully transferred to web app!")
            print(f"   Your frontend can now load the term-specific indexes.")
        else:
            print(f"\n⚠️ Some files may not have transferred correctly")
            
    except Exception as e:
        print(f"\n❌ Error during transfer: {str(e)}")
        print(f"   You may need to copy files manually to {webapp_data_dir}")
        return

def main():
    """CLI interface for term-specific index generation"""
    parser = argparse.ArgumentParser(
        description='Generate term-specific course search indexes from scraped subject JSON files',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python generate_index.py
  python generate_index.py --data-dir web/public/data

This script will:
1. Scan all subject JSON files in the data directory  
2. Discover all available terms automatically
3. Generate separate index files for each term:
   - index2025-26 Term 1.json
   - index2025-26 Term 2.json
   - etc.
        """
    )
    
    parser.add_argument('--data-dir', '-d', 
                       default='data',
                       help='Directory containing subject JSON files (default: web/public/data)')
    
    args = parser.parse_args()
    
    try:
        generate_term_indexes(args.data_dir)
        return 0
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return 1

if __name__ == "__main__":
    exit(main())