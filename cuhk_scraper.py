import requests
import json
from bs4 import BeautifulSoup
from typing import List, Dict, Optional
from dataclasses import dataclass, asdict
from datetime import datetime
import time
import logging
import ddddocr
import onnxruntime

@dataclass
class Course:
    """Course data structure"""
    subject: str
    course_code: str
    title: str
    credits: str
    semester: str
    schedule: str
    instructor: str
    capacity: str
    enrolled: str
    waitlist: str
    postback_target: str = ""  # For getting detailed info
    
    def to_dict(self) -> Dict:
        data = asdict(self)
        # Remove postback_target from exported data
        data.pop('postback_target', None)
        return data

class CuhkScraper:
    """Simplified CUHK course scraper"""
    
    def __init__(self):
        self.session = requests.Session()
        self.logger = logging.getLogger(__name__)
        self.base_url = "http://rgsntl.rgs.cuhk.edu.hk/aqs_prd_applx/Public/tt_dsp_crse_catalog.aspx"
        
        # Suppress ONNX warnings
        onnxruntime.set_default_logger_severity(3)
        self.ocr = ddddocr.DdddOcr()
        
        # Browser headers
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive',
        })
    
    def _solve_captcha(self, image_bytes: bytes) -> Optional[str]:
        """Solve captcha using ddddocr"""
        try:
            text = self.ocr.classification(image_bytes).strip().upper()
            
            # Validate captcha format (4 alphanumeric characters)
            if len(text) == 4 and text.isalnum():
                self.logger.info(f"Captcha solved: {text}")
                return text
            else:
                self.logger.warning(f"Invalid captcha format: {text}")
            
        except Exception as e:
            self.logger.error(f"Captcha solving failed: {e}")
        
        return None
    
    def get_subjects_from_live_site(self) -> List[str]:
        """Extract subject codes from live website"""
        try:
            response = self.session.get(self.base_url)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            select = soup.find('select', {'name': 'ddl_subject'})
            
            if not select:
                self.logger.error("Could not find subject dropdown on live site")
                return []
            
            subjects = []
            for option in select.find_all('option'):
                value = option.get('value', '').strip()
                if value:  # Skip empty option
                    subjects.append(value)
            
            self.logger.info(f"Found {len(subjects)} subjects from live site")
            return subjects
            
        except Exception as e:
            self.logger.error(f"Error getting subjects from live site: {e}")
            return []
    
    def scrape_subject(self, subject_code: str, get_details: bool = False, max_retries: int = 3) -> List[Course]:
        """Scrape courses for a specific subject"""
        for attempt in range(max_retries):
            try:
                self.logger.info(f"Scraping {subject_code}, attempt {attempt + 1}")
                
                # Get the initial page to extract form data
                response = self.session.get(self.base_url)
                response.raise_for_status()
                
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # Extract form data
                form_data = self._extract_form_data(soup)
                form_data['ddl_subject'] = subject_code
                
                # Submit the form
                response = self.session.post(self.base_url, data=form_data)
                response.raise_for_status()
                
                # Debug: save response to understand structure
                debug_file = f"tests/output/response_{subject_code}_attempt_{attempt + 1}.html"
                with open(debug_file, 'w', encoding='utf-8') as f:
                    f.write(response.text)
                self.logger.info(f"Saved response to {debug_file}")
                
                # Parse results
                courses = self._parse_course_results(response.text)
                
                # Set the subject for all courses
                for course in courses:
                    course.subject = subject_code
                
                # Get detailed information if requested (limit to first 3 courses for testing)
                if get_details and courses:
                    test_courses = courses[:3]  # Limit to first 3 for testing
                    self.logger.info(f"Getting details for {len(test_courses)} courses (testing with first 3)...")
                    detailed_courses = []
                    
                    for i, course in enumerate(test_courses):
                        self.logger.info(f"Getting details for course {i+1}/{len(test_courses)}: {course.course_code}")
                        detailed_course = self.get_course_details(course, response.text)
                        detailed_courses.append(detailed_course)
                        
                        # Be polite to the server
                        if i < len(test_courses) - 1:
                            time.sleep(2)  # Increased delay for debugging
                    
                    # Add remaining courses without details for complete list
                    detailed_courses.extend(courses[3:])
                    courses = detailed_courses
                
                if courses:
                    self.logger.info(f"Found {len(courses)} courses for {subject_code}")
                    return courses
                
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)  # Exponential backoff
                    
            except Exception as e:
                self.logger.error(f"Attempt {attempt + 1} failed for {subject_code}: {e}")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
        
        return []
    
    def _extract_form_data(self, soup: BeautifulSoup) -> Dict[str, str]:
        """Extract necessary form data from the page"""
        form_data = {}
        
        # Get ViewState and other ASP.NET form fields
        for input_elem in soup.find_all('input', {'type': 'hidden'}):
            name = input_elem.get('name')
            value = input_elem.get('value', '')
            if name:
                form_data[name] = value
        
        # Get captcha image and solve it
        captcha_img = soup.find('img', {'id': 'imgCaptcha'})
        if captcha_img:
            captcha_url = captcha_img.get('src')
            if captcha_url:
                # Make absolute URL
                if not captcha_url.startswith('http'):
                    base_parts = self.base_url.rsplit('/', 1)[0]
                    captcha_url = base_parts + '/' + captcha_url
                
                # Get captcha image
                captcha_response = self.session.get(captcha_url)
                captcha_text = self._solve_captcha(captcha_response.content)
                
                if not captcha_text:
                    return []
                
                form_data['txt_captcha'] = captcha_text
            else:
                self.logger.error("Could not find captcha URL")
                return []
        else:
            self.logger.error("Could not find captcha image")
            return []
        
        # Add other form fields
        form_data['ddl_subject'] = ''  # Will be set per subject
        form_data['btn_search'] = 'Search'
        
        return form_data
    
    def _parse_course_results(self, html: str, get_details: bool = False) -> List[Course]:
        """Parse course results from HTML response"""
        soup = BeautifulSoup(html, 'html.parser')
        courses = []
        
        # Look for the specific course results table
        course_table = soup.find('table', {'id': 'gv_detail'})
        
        if not course_table:
            self.logger.warning("Could not find course results table (gv_detail)")
            return []
        
        # Get all course rows, skip header
        rows = course_table.find_all('tr')
        if len(rows) < 2:
            self.logger.warning("No course data rows found")
            return []
        
        # Skip header row, parse data rows
        for row in rows[1:]:
            try:
                cells = row.find_all('td')
                
                if len(cells) >= 2:  # Should have at least course number and title
                    # Extract course number and title from the links
                    course_nbr_link = row.find('a', {'id': lambda x: x and 'lbtn_course_nbr' in x})
                    course_title_link = row.find('a', {'id': lambda x: x and 'lbtn_course_title' in x})
                    
                    if course_nbr_link and course_title_link:
                        course_code = self._clean_text(course_nbr_link.get_text())
                        title = self._clean_text(course_title_link.get_text())
                        
                        # Get the postback target for this course (for details later)
                        postback_target = None
                        href = course_nbr_link.get('href', '')
                        if "__doPostBack(" in href:
                            # Extract target from href like: javascript:__doPostBack('gv_detail$ctl02$lbtn_course_nbr','')
                            start = href.find("'") + 1
                            end = href.find("'", start)
                            if start > 0 and end > start:
                                postback_target = href[start:end]
                        
                        # Create course with basic info
                        course = Course(
                            subject="",  # Will be set by caller
                            course_code=course_code,
                            title=title,
                            credits="",
                            semester="",
                            schedule="",
                            instructor="",
                            capacity="",
                            enrolled="",
                            waitlist=""
                        )
                        
                        # Store postback target for potential detail retrieval
                        if postback_target:
                            course.postback_target = postback_target
                        
                        courses.append(course)
                        
            except Exception as e:
                self.logger.warning(f"Error parsing course row: {e}")
                continue
        
        self.logger.info(f"Parsed {len(courses)} courses from results table")
        return courses
    
    def get_course_details(self, course: Course, current_html: str) -> Optional[Course]:
        """Get detailed course information by simulating postback"""
        if not course.postback_target:
            self.logger.warning(f"No postback target for course {course.course_code}")
            return course
        
        try:
            # Parse the current page to get form data
            soup = BeautifulSoup(current_html, 'html.parser')
            form_data = {}
            
            # Get all hidden form fields
            for input_elem in soup.find_all('input', {'type': 'hidden'}):
                name = input_elem.get('name')
                value = input_elem.get('value', '')
                if name:
                    form_data[name] = value
            
            # Set postback data
            form_data['__EVENTTARGET'] = course.postback_target
            form_data['__EVENTARGUMENT'] = ''
            
            # Submit the postback to get course details page
            response = self.session.post(self.base_url, data=form_data)
            response.raise_for_status()
            
            # Now try to get 2025-26 term data if available
            detailed_course = self._get_course_details_with_term_selection(response.text, course)
            
            # Debug: save detailed response
            debug_file = f"tests/output/course_details_{course.subject}_{course.course_code}.html"
            with open(debug_file, 'w', encoding='utf-8') as f:
                f.write(response.text)
            self.logger.info(f"Saved course details to {debug_file}")
            
            return detailed_course
            
        except Exception as e:
            self.logger.error(f"Error getting course details for {course.course_code}: {e}")
            return course
    
    def _get_course_details_with_term_selection(self, html: str, base_course: Course) -> Course:
        """Get course details with term selection (prefer 2025-26)"""
        soup = BeautifulSoup(html, 'html.parser')
        
        # Check for term dropdown
        term_select = soup.find('select', {'id': 'uc_course_ddl_class_term'})
        if not term_select:
            self.logger.info(f"No term dropdown found for {base_course.course_code}, using current data")
            return self._parse_course_details(html, base_course)
        
        # Find 2025-26 terms (prefer Term 1, then Term 2)
        target_terms = ['2025-26 Term 1', '2025-26 Term 2']
        selected_term_value = None
        selected_term_text = None
        
        for target_term in target_terms:
            option = term_select.find('option', string=lambda text: text and target_term in text)
            if option:
                selected_term_value = option.get('value')
                selected_term_text = option.get_text().strip()
                self.logger.info(f"Found {target_term} for {base_course.course_code}: {selected_term_value}")
                break
        
        # If no 2025-26 terms found, use current selection
        if not selected_term_value:
            selected_option = term_select.find('option', {'selected': 'selected'})
            if selected_option:
                selected_term_value = selected_option.get('value')
                selected_term_text = selected_option.get_text().strip()
                self.logger.info(f"Using current term for {base_course.course_code}: {selected_term_text}")
            else:
                self.logger.warning(f"No term options found for {base_course.course_code}")
                return self._parse_course_details(html, base_course)
        
        # If we need to change the term, submit the form to update
        if not term_select.find('option', {'selected': 'selected', 'value': selected_term_value}):
            try:
                self.logger.info(f"Switching to {selected_term_text} for {base_course.course_code}")
                
                # Extract form data for term change
                form_data = {}
                for input_elem in soup.find_all('input', {'type': 'hidden'}):
                    name = input_elem.get('name')
                    value = input_elem.get('value', '')
                    if name:
                        form_data[name] = value
                
                # Update term selection
                form_data['uc_course$ddl_class_term'] = selected_term_value
                form_data['__EVENTTARGET'] = 'uc_course$ddl_class_term'
                form_data['__EVENTARGUMENT'] = ''
                
                # Submit term change
                response = self.session.post(self.base_url, data=form_data)
                response.raise_for_status()
                html = response.text
                soup = BeautifulSoup(html, 'html.parser')
                
                time.sleep(1)  # Be polite to server
                
            except Exception as e:
                self.logger.warning(f"Failed to change term for {base_course.course_code}: {e}")
        
        # Now click "Show sections" button to get detailed schedule
        try:
            show_sections_btn = soup.find('input', {'id': 'uc_course_btn_class_section'})
            if show_sections_btn:
                self.logger.info(f"Clicking 'Show sections' for {base_course.course_code}")
                
                # Extract form data for show sections
                form_data = {}
                for input_elem in soup.find_all('input', {'type': 'hidden'}):
                    name = input_elem.get('name')
                    value = input_elem.get('value', '')
                    if name:
                        form_data[name] = value
                
                # Set the show sections postback
                form_data['uc_course$btn_class_section'] = 'Show sections'
                if selected_term_value:
                    form_data['uc_course$ddl_class_term'] = selected_term_value
                
                # Submit show sections
                response = self.session.post(self.base_url, data=form_data)
                response.raise_for_status()
                html = response.text
                
                # Save the final response with sections
                debug_file = f"tests/output/course_sections_{base_course.subject}_{base_course.course_code}_{selected_term_text.replace(' ', '_').replace('-', '_')}.html"
                with open(debug_file, 'w', encoding='utf-8') as f:
                    f.write(html)
                self.logger.info(f"Saved course sections to {debug_file}")
                
                time.sleep(1)  # Be polite to server
                
        except Exception as e:
            self.logger.warning(f"Failed to show sections for {base_course.course_code}: {e}")
        
        # Parse the final course details
        return self._parse_course_details(html, base_course)
    
    def _parse_course_details(self, html: str, base_course: Course) -> Course:
        """Parse detailed course information from detail page"""
        soup = BeautifulSoup(html, 'html.parser')
        
        # Create a copy of the base course
        detailed_course = Course(
            subject=base_course.subject,
            course_code=base_course.course_code,
            title=base_course.title,
            credits="",
            semester="",
            schedule="",
            instructor="",
            capacity="",
            enrolled="",
            waitlist="",
            postback_target=base_course.postback_target
        )
        
        try:
            # Extract units/credits from uc_course_lbl_units
            units_elem = soup.find('span', {'id': 'uc_course_lbl_units'})
            if units_elem:
                detailed_course.credits = self._clean_text(units_elem.get_text())
            
            # Extract semester from course schedule table
            term_select = soup.find('select', {'id': 'uc_course_ddl_class_term'})
            if term_select:
                selected_option = term_select.find('option', {'selected': 'selected'})
                if selected_option:
                    detailed_course.semester = self._clean_text(selected_option.get_text())
            
            # Extract schedule information from the course schedule table
            schedule_table = soup.find('table', {'id': lambda x: x and 'gv_sched' in x})
            if schedule_table:
                schedule_info = []
                instructor_info = set()
                
                rows = schedule_table.find_all('tr', class_='normalGridViewRowStyle')
                for row in rows:
                    cells = row.find_all('td')
                    if len(cells) >= 3:
                        # Extract section info
                        section_cell = cells[0]
                        section = self._clean_text(section_cell.get_text())
                        
                        # Extract meeting info from nested table
                        meet_table = cells[2].find('table')
                        if meet_table:
                            meet_rows = meet_table.find_all('tr')[1:]  # Skip header
                            for meet_row in meet_rows:
                                meet_cells = meet_row.find_all('td')
                                if len(meet_cells) >= 4:
                                    days_times = self._clean_text(meet_cells[0].get_text())
                                    room = self._clean_text(meet_cells[1].get_text())
                                    instructor = self._clean_text(meet_cells[2].get_text())
                                    dates = self._clean_text(meet_cells[3].get_text())
                                    
                                    if instructor and instructor != 'TBA':
                                        instructor_info.add(instructor)
                                    
                                    if days_times:
                                        schedule_entry = f"{section}: {days_times}"
                                        if room:
                                            schedule_entry += f" @ {room}"
                                        schedule_info.append(schedule_entry)
                
                # Set instructor and schedule
                if instructor_info:
                    detailed_course.instructor = ", ".join(sorted(instructor_info))
                if schedule_info:
                    detailed_course.schedule = "; ".join(schedule_info)
            
            self.logger.info(f"Extracted details for {detailed_course.course_code}: "
                           f"Credits={detailed_course.credits}, "
                           f"Semester={detailed_course.semester}, "
                           f"Instructor={detailed_course.instructor}")
            
        except Exception as e:
            self.logger.warning(f"Error parsing course details: {e}")
        
        return detailed_course
    
    def _clean_text(self, text: str) -> str:
        """Clean and normalize text content"""
        if not text:
            return ""
        return text.strip().replace('\n', ' ').replace('\r', '').replace('\t', ' ')
    
    def scrape_all_subjects(self, subjects: List[str], get_details: bool = False) -> Dict[str, List[Course]]:
        """Scrape all subjects"""
        results = {}
        
        for i, subject in enumerate(subjects):
            self.logger.info(f"Processing {subject} ({i+1}/{len(subjects)})")
            
            courses = self.scrape_subject(subject, get_details=get_details)
            results[subject] = courses
            
            # Be polite to the server
            time.sleep(1)
        
        return results
    
    def export_to_json(self, data: Dict[str, List[Course]], filename: str = None) -> str:
        """Export data to JSON with metadata"""
        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"tests/output/cuhk_courses_{timestamp}.json"
        
        # Structure for web app consumption
        json_data = {
            "metadata": {
                "scraped_at": datetime.now().isoformat(),
                "total_subjects": len(data),
                "total_courses": sum(len(courses) for courses in data.values())
            },
            "subjects": {}
        }
        
        for subject, courses in data.items():
            json_data["subjects"][subject] = [course.to_dict() for course in courses]
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(json_data, f, ensure_ascii=False, indent=2)
        
        self.logger.info(f"Exported to {filename}")
        return filename
    

def main():
    """Main function"""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )
    
    scraper = CuhkScraper()
    
    # Get subjects from live website
    print("Getting subjects from live website...")
    subjects = scraper.get_subjects_from_live_site()
    
    if not subjects:
        print("Could not get subjects from live website")
        return
    
    print(f"Found {len(subjects)} subjects: {subjects[:10]}...")  # Show first 10
    
    # Test with just CSCI first, and get details for the first few courses
    test_subjects = ["CSCI"] if "CSCI" in subjects else [subjects[0]]
    print(f"Testing with subjects: {test_subjects}")
    
    try:
        # Test with course details enabled
        print("Testing with course details enabled...")
        results = scraper.scrape_all_subjects(test_subjects, get_details=True)
        
        # Export results
        json_file = scraper.export_to_json(results)
        print(f"Results exported to {json_file}")
        
        # Show summary
        total_courses = sum(len(courses) for courses in results.values())
        print(f"Total courses scraped: {total_courses}")
        
    except KeyboardInterrupt:
        print("\nScraping interrupted")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()