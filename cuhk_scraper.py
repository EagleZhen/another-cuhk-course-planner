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
class ScrapingConfig:
    """Configuration for testing vs production scraping"""
    # Testing defaults - safe for development
    max_courses_per_subject: Optional[int] = 3  # None = unlimited
    save_debug_files: bool = True
    request_delay: float = 2.0
    max_retries: int = 3
    
    @classmethod
    def for_production(cls):
        """Production-ready configuration - unlimited courses, optimized performance"""
        return cls(
            max_courses_per_subject=None,  # No limit
            save_debug_files=False,
            request_delay=1.0,
            max_retries=5
        )
    
    @classmethod
    def for_validation(cls, max_courses: int = 10):
        """Validation configuration - limited courses for testing"""
        return cls(
            max_courses_per_subject=max_courses,
            save_debug_files=False,
            request_delay=1.5,
            max_retries=3
        )

@dataclass
class TermInfo:
    """Term-specific course information"""
    term_code: str  # e.g., "2390"
    term_name: str  # e.g., "2025-26 Term 2"
    schedule: List[Dict[str, str]]  # List of sections with time/location/instructor
    instructor: List[str]  # List of instructors
    capacity: str = ""
    enrolled: str = ""
    waitlist: str = ""
    
    def to_dict(self) -> Dict:
        return asdict(self)

@dataclass
class Course:
    """Course data structure with multiple terms support"""
    subject: str
    course_code: str
    title: str
    credits: str
    terms: List[TermInfo]  # List of terms this course is offered
    postback_target: str = ""  # For getting detailed info
    
    # Additional course details
    description: str = ""
    enrollment_requirement: str = ""
    academic_career: str = ""  # e.g., "Undergraduate"
    grading_basis: str = ""    # e.g., "Graded"
    component: str = ""        # e.g., "Lecture\nInteractive Tutorial"
    campus: str = ""           # e.g., "Main Campus"
    academic_group: str = ""   # e.g., "Dept of Computer Sci & Engg"
    academic_org: str = ""     # e.g., "Dept of Computer Sci & Engg"
    
    def to_dict(self) -> Dict:
        data = asdict(self)
        # Remove postback_target from exported data
        data.pop('postback_target', None)
        # Convert terms to dict format
        data['terms'] = [term.to_dict() for term in self.terms]
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
    
    def scrape_subject(self, subject_code: str, get_details: bool = False, get_enrollment_details: bool = False, config: Optional[ScrapingConfig] = None) -> List[Course]:
        """Scrape courses for a specific subject"""
        if config is None:
            config = ScrapingConfig()  # Use testing defaults
            
        for attempt in range(config.max_retries):
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
                
                # Debug: save response to understand structure (if enabled)
                if config.save_debug_files:
                    debug_file = f"tests/output/response_{subject_code}_attempt_{attempt + 1}.html"
                    with open(debug_file, 'w', encoding='utf-8') as f:
                        f.write(response.text)
                    self.logger.info(f"Saved response to {debug_file}")
                
                # Parse results
                courses = self._parse_course_results(response.text)
                
                # Set the subject for all courses
                for course in courses:
                    course.subject = subject_code
                
                # Get detailed information if requested
                if get_details and courses:
                    # Apply course limit based on configuration
                    if config.max_courses_per_subject is not None:
                        courses_to_detail = courses[:config.max_courses_per_subject]
                        self.logger.info(f"Getting details for {len(courses_to_detail)} courses (limited by config)...")
                    else:
                        courses_to_detail = courses
                        self.logger.info(f"Getting details for all {len(courses_to_detail)} courses...")
                    
                    detailed_courses = []
                    
                    for i, course in enumerate(courses_to_detail):
                        self.logger.info(f"Getting details for course {i+1}/{len(courses_to_detail)}: {course.course_code}")
                        detailed_course = self.get_course_details(course, response.text, get_enrollment_details=get_enrollment_details, config=config)
                        detailed_courses.append(detailed_course)
                        
                        # Be polite to the server
                        if i < len(courses_to_detail) - 1:
                            time.sleep(config.request_delay)
                    
                    # Add remaining courses without details for complete list (if limited)
                    if config.max_courses_per_subject is not None:
                        detailed_courses.extend(courses[config.max_courses_per_subject:])
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
                            terms=[]  # Will be populated with term details
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
    
    def get_course_details(self, course: Course, current_html: str, get_enrollment_details: bool = False, config: Optional[ScrapingConfig] = None) -> Optional[Course]:
        """Get detailed course information by simulating postback"""
        if config is None:
            config = ScrapingConfig()  # Use testing defaults
            
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
            
            # Get course details with all available terms
            detailed_course = self._get_course_details_with_term_selection(response.text, course, get_enrollment_details=get_enrollment_details)
            
            # Debug: save detailed response (if enabled)
            if config.save_debug_files:
                debug_file = f"tests/output/course_details_{course.subject}_{course.course_code}.html"
                with open(debug_file, 'w', encoding='utf-8') as f:
                    f.write(response.text)
                self.logger.info(f"Saved course details to {debug_file}")
            
            return detailed_course
            
        except Exception as e:
            self.logger.error(f"Error getting course details for {course.course_code}: {e}")
            return course
    
    def _get_course_details_with_term_selection(self, html: str, base_course: Course, get_enrollment_details: bool = False) -> Course:
        """Get course details for all available terms"""
        soup = BeautifulSoup(html, 'html.parser')
        
        # Extract basic course info first
        base_course.credits = self._extract_credits(soup)
        
        # Extract additional course details
        self._extract_additional_course_details(soup, base_course)
        
        # Check for term dropdown
        term_select = soup.find('select', {'id': 'uc_course_ddl_class_term'})
        if not term_select:
            self.logger.info(f"No term dropdown found for {base_course.course_code}, using current data")
            # Create a single term with available data
            current_term = self._parse_current_term_info(html)
            if current_term:
                base_course.terms = [current_term]
            return base_course
        
        # Get all available terms from dropdown
        available_terms = []
        for option in term_select.find_all('option'):
            term_code = option.get('value', '').strip()
            term_name = option.get_text().strip()
            if term_code and term_name:
                available_terms.append((term_code, term_name))
        
        self.logger.info(f"Found {len(available_terms)} terms for {base_course.course_code}: {[name for _, name in available_terms]}")
        
        # Scrape details for each term
        all_term_info = []
        for i, (term_code, term_name) in enumerate(available_terms):
            try:
                self.logger.info(f"Scraping term {i+1}/{len(available_terms)}: {term_name} for {base_course.course_code}")
                term_info = self._scrape_term_details(html, base_course, term_code, term_name, get_enrollment_details=get_enrollment_details)
                if term_info:
                    all_term_info.append(term_info)
                
                # Be polite to server between terms
                if i < len(available_terms) - 1:
                    time.sleep(1)
                    
            except Exception as e:
                self.logger.warning(f"Failed to scrape {term_name} for {base_course.course_code}: {e}")
                continue
        
        base_course.terms = all_term_info
        self.logger.info(f"Extracted details for {base_course.course_code}: "
                       f"Credits={base_course.credits}, "
                       f"Terms={len(all_term_info)}")
        return base_course
    
    def _scrape_term_details(self, html: str, base_course: Course, term_code: str, term_name: str, get_enrollment_details: bool = False) -> Optional[TermInfo]:
        """Scrape details for a specific term"""
        try:
            soup = BeautifulSoup(html, 'html.parser')
            
            # Check if this term is already selected
            term_select = soup.find('select', {'id': 'uc_course_ddl_class_term'})
            current_selected = term_select.find('option', {'selected': 'selected'})
            is_current_term = current_selected and current_selected.get('value') == term_code
            
            # If not current term, switch to it
            if not is_current_term:
                self.logger.info(f"Switching to {term_name} for {base_course.course_code}")
                
                # Extract form data for term change
                form_data = {}
                for input_elem in soup.find_all('input', {'type': 'hidden'}):
                    name = input_elem.get('name')
                    value = input_elem.get('value', '')
                    if name:
                        form_data[name] = value
                
                # Update term selection
                form_data['uc_course$ddl_class_term'] = term_code
                form_data['__EVENTTARGET'] = 'uc_course$ddl_class_term'
                form_data['__EVENTARGUMENT'] = ''
                
                # Submit term change
                response = self.session.post(self.base_url, data=form_data)
                response.raise_for_status()
                html = response.text
                soup = BeautifulSoup(html, 'html.parser')
            
            # Click "Show sections" to get detailed schedule
            show_sections_btn = soup.find('input', {'id': 'uc_course_btn_class_section'})
            if show_sections_btn:
                self.logger.info(f"Getting sections for {term_name}")
                
                # Extract form data for show sections
                form_data = {}
                for input_elem in soup.find_all('input', {'type': 'hidden'}):
                    name = input_elem.get('name')
                    value = input_elem.get('value', '')
                    if name:
                        form_data[name] = value
                
                # Set the show sections postback
                form_data['uc_course$btn_class_section'] = 'Show sections'
                form_data['uc_course$ddl_class_term'] = term_code
                
                # Submit show sections
                response = self.session.post(self.base_url, data=form_data)
                response.raise_for_status()
                html = response.text
                
                # Save debug file (if enabled) - need config passed down
                # Note: config not available here, will need to pass it down from parent method
            
            # Parse the term-specific information
            return self._parse_term_info(html, term_code, term_name, get_enrollment_details)
            
        except Exception as e:
            self.logger.error(f"Error scraping term {term_name}: {e}")
            return None
    
    def _extract_credits(self, soup: BeautifulSoup) -> str:
        """Extract credits/units from course details"""
        units_elem = soup.find('span', {'id': 'uc_course_lbl_units'})
        return self._clean_text(units_elem.get_text()) if units_elem else ""
    
    def _parse_status_from_image(self, img_src: str) -> str:
        """Parse enrollment status from status icon image source"""
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
    
    def _extract_additional_course_details(self, soup: BeautifulSoup, course: Course) -> None:
        """Extract additional course details from the course page"""
        # Course description
        desc_elem = soup.find('span', {'id': 'uc_course_lbl_crse_descrlong'})
        if desc_elem:
            course.description = self._clean_text(desc_elem.get_text())
        
        # Enrollment requirement
        enroll_elem = soup.find('td', {'id': 'uc_course_tc_enrl_requirement'})
        if enroll_elem:
            course.enrollment_requirement = self._clean_text(enroll_elem.get_text())
        
        # Academic career (Undergraduate/Graduate)
        career_elem = soup.find('span', {'id': 'uc_course_lbl_acad_career'})
        if career_elem:
            course.academic_career = self._clean_text(career_elem.get_text())
        
        # Grading basis
        grading_elem = soup.find('span', {'id': 'uc_course_lbl_grading_basis'})
        if grading_elem:
            course.grading_basis = self._clean_text(grading_elem.get_text())
        
        # Component (Lecture, Tutorial, etc.)
        component_elem = soup.find('span', {'id': 'uc_course_lbl_component'})
        if component_elem:
            course.component = self._clean_text(component_elem.get_text())
        
        # Campus
        campus_elem = soup.find('span', {'id': 'uc_course_lbl_campus'})
        if campus_elem:
            course.campus = self._clean_text(campus_elem.get_text())
        
        # Academic group
        group_elem = soup.find('span', {'id': 'uc_course_lbl_acad_group'})
        if group_elem:
            course.academic_group = self._clean_text(group_elem.get_text())
        
        # Academic organization
        org_elem = soup.find('span', {'id': 'uc_course_lbl_acad_org'})
        if org_elem:
            course.academic_org = self._clean_text(org_elem.get_text())
    
    def _parse_schedule_from_html(self, html: str) -> tuple[list[dict], set[str]]:
        """Extract schedule data and instructors from HTML - shared parsing logic"""
        soup = BeautifulSoup(html, 'html.parser')
        
        # Group meetings by section to reflect merged cell structure
        sections_data = {}
        instructors = set()
        
        # Find schedule tables (handle both specific ID and general search)
        schedule_tables = []
        
        # First try to find by specific ID pattern
        schedule_table = soup.find('table', {'id': lambda x: x and 'gv_sched' in x})
        if schedule_table:
            schedule_tables.append(schedule_table)
        else:
            # Fallback: search all tables for schedule tables
            for table in soup.find_all('table'):
                if 'gv_sched' in str(table.get('id', '')):
                    schedule_tables.append(table)
        
        # Parse each schedule table
        for table in schedule_tables:
            # Get both normal and alternating row styles
            rows = table.find_all('tr', class_=['normalGridViewRowStyle', 'normalGridViewAlternatingRowStyle'])
            for row in rows:
                cells = row.find_all('td')
                if len(cells) >= 3:
                    # Extract section info
                    section = self._clean_text(cells[0].get_text())
                    
                    # Skip if section doesn't look like a valid section identifier
                    # Valid sections should contain parentheses (e.g., "--LEC (8192)", "-L01-LAB (5726)")
                    if not section or '(' not in section or ')' not in section:
                        continue
                    
                    # Extract status info from status icon (second cell)
                    status = "Unknown"
                    if len(cells) >= 2:
                        status_img = cells[1].find('img')
                        if status_img:
                            img_src = status_img.get('src', '')
                            status = self._parse_status_from_image(img_src)
                    
                    # Initialize section if not seen before
                    if section not in sections_data:
                        sections_data[section] = {
                            'section': section,
                            'status': status,
                            'meetings': []
                        }
                    
                    # Extract meeting info from nested table
                    meet_table = cells[2].find('table')
                    if meet_table:
                        # Note: These nested tables don't have headers, all rows are data
                        meet_rows = meet_table.find_all('tr', class_=['normalGridViewRowStyle', 'normalGridViewAlternatingRowStyle'])
                        # Debug logging (uncomment if needed for troubleshooting)
                        # self.logger.info(f"Found {len(meet_rows)} meet rows for section {section}")
                        for i, meet_row in enumerate(meet_rows):
                            # self.logger.info(f"Meet row {i}: class={meet_row.get('class')}")
                            meet_cells = meet_row.find_all('td')
                            if len(meet_cells) >= 4:
                                days_times = self._clean_text(meet_cells[0].get_text())
                                room = self._clean_text(meet_cells[1].get_text())
                                instructor = self._clean_text(meet_cells[2].get_text())
                                dates = self._clean_text(meet_cells[3].get_text())
                                
                                if instructor and instructor != 'TBA':
                                    instructors.add(instructor)
                                
                                if days_times and dates:
                                    # Each row becomes one meeting under this section
                                    sections_data[section]['meetings'].append({
                                        'time': days_times,
                                        'location': room,
                                        'instructor': instructor,
                                        'dates': dates
                                    })
        
        # Convert to list format for JSON serialization
        schedule_data = list(sections_data.values())
        return schedule_data, instructors

    def _create_term_info(self, html: str, term_code: str = "", term_name: str = "Unknown Term", get_enrollment_details: bool = False) -> Optional[TermInfo]:
        """Create TermInfo from HTML with optional term metadata"""
        if get_enrollment_details:
            # Use detailed section parsing with enrollment data
            schedule_data, instructors = self._parse_schedule_with_enrollment_details(html)
        else:
            # Use current fast parsing method
            schedule_data, instructors = self._parse_schedule_from_html(html)
        
        if schedule_data or instructors:
            return TermInfo(
                term_code=term_code,
                term_name=term_name,
                schedule=schedule_data,
                instructor=list(sorted(instructors))
            )
        
        return None

    def _parse_schedule_with_enrollment_details(self, html: str) -> tuple[list[dict], set[str]]:
        """Parse schedule with detailed enrollment data by clicking into each section"""
        soup = BeautifulSoup(html, 'html.parser')
        sections_data = {}
        instructors = set()
        
        # Find schedule tables to extract section links
        schedule_tables = []
        schedule_table = soup.find('table', {'id': lambda x: x and 'gv_sched' in x})
        if schedule_table:
            schedule_tables.append(schedule_table)
        else:
            # Fallback: search all tables for schedule tables
            for table in soup.find_all('table'):
                if 'gv_sched' in str(table.get('id', '')):
                    schedule_tables.append(table)
        
        for table in schedule_tables:
            # Get section rows
            rows = table.find_all('tr', class_=['normalGridViewRowStyle', 'normalGridViewAlternatingRowStyle'])
            for row in rows:
                cells = row.find_all('td')
                if len(cells) >= 2:
                    # Look for section link in first cell
                    section_link = cells[0].find('a')
                    if section_link:
                        section_name = self._clean_text(section_link.get_text())
                        postback_target = section_link.get('href', '')
                        
                        # Skip if section doesn't look valid
                        if not section_name or '(' not in section_name or ')' not in section_name:
                            continue
                        
                        self.logger.info(f"Getting enrollment details for section: {section_name}")
                        
                        # Click into section to get detailed enrollment data
                        section_details = self._get_section_enrollment_details(postback_target, html, section_name)
                        if section_details:
                            sections_data[section_name] = section_details
                            # Add instructors from this section
                            if 'meetings' in section_details:
                                for meeting in section_details['meetings']:
                                    instructor = meeting.get('instructor', '')
                                    if instructor and instructor != 'TBA':
                                        instructors.add(instructor)
        
        # Convert to list format for JSON serialization
        schedule_data = list(sections_data.values())
        return schedule_data, instructors

    def _get_section_enrollment_details(self, postback_target: str, current_html: str, section_name: str) -> Optional[dict]:
        """Click into a section to get detailed enrollment information"""
        try:
            # Extract postback parameters from the JavaScript call
            if 'javascript:__doPostBack(' in postback_target:
                # Parse the postback parameters
                # Format: javascript:__doPostBack('uc_course$gv_sched$ctl02$lkbtn_class_section','')
                start = postback_target.find("'") + 1
                end = postback_target.find("'", start)
                event_target = postback_target[start:end] if start > 0 and end > start else ''
                
                if not event_target:
                    self.logger.warning(f"Could not parse postback target: {postback_target}")
                    return None
                
                # Prepare form data for postback
                soup = BeautifulSoup(current_html, 'html.parser')
                form_data = {}
                
                # Extract all hidden form fields
                for input_elem in soup.find_all('input', {'type': 'hidden'}):
                    name = input_elem.get('name')
                    value = input_elem.get('value', '')
                    if name:
                        form_data[name] = value
                
                # Set postback parameters
                form_data['__EVENTTARGET'] = event_target
                form_data['__EVENTARGUMENT'] = ''
                
                # Submit the postback to get class details
                response = self.session.post(self.base_url, data=form_data)
                response.raise_for_status()
                class_details_html = response.text
                
                # Parse the class details page
                return self._parse_class_details(class_details_html, section_name)
                
        except Exception as e:
            self.logger.error(f"Error getting section enrollment details: {e}")
            return None
        
        return None

    def _parse_class_details(self, html: str, section_name: str) -> Optional[dict]:
        """Parse class details page to extract section info with enrollment data"""
        soup = BeautifulSoup(html, 'html.parser')
        
        # Extract class availability information
        availability = self._parse_class_availability(soup)
        
        # Extract meeting information
        meetings = []
        meeting_table = soup.find('table', {'id': 'uc_class_gv_meet'})
        if meeting_table:
            rows = meeting_table.find_all('tr', class_=['normalGridViewRowStyle', 'normalGridViewAlternatingRowStyle'])
            for row in rows:
                cells = row.find_all('td')
                if len(cells) >= 4:
                    meeting = {
                        'time': self._clean_text(cells[0].get_text()),
                        'location': self._clean_text(cells[1].get_text()),
                        'instructor': self._clean_text(cells[2].get_text()),
                        'dates': self._clean_text(cells[3].get_text())
                    }
                    meetings.append(meeting)
        
        # Use the original section name from the schedule page
        return {
            'section': section_name,
            'meetings': meetings,
            'availability': availability
        }

    def _parse_class_availability(self, soup: BeautifulSoup) -> dict:
        """Parse class availability information from class details page"""
        availability = {
            'capacity': '',
            'enrolled': '',
            'waitlist_capacity': '',
            'waitlist_total': '',
            'available_seats': '',
            'status': 'Unknown'
        }
        
        try:
            # Class Capacity
            capacity_elem = soup.find('span', {'id': 'uc_class_lbl_enrl_cap'})
            if capacity_elem:
                availability['capacity'] = self._clean_text(capacity_elem.get_text())
            
            # Enrollment Total
            enrolled_elem = soup.find('span', {'id': 'uc_class_lbl_enrl_tot'})
            if enrolled_elem:
                availability['enrolled'] = self._clean_text(enrolled_elem.get_text())
            
            # Wait List Capacity
            wait_cap_elem = soup.find('span', {'id': 'uc_class_lbl_wait_cap'})
            if wait_cap_elem:
                availability['waitlist_capacity'] = self._clean_text(wait_cap_elem.get_text())
            
            # Wait List Total
            wait_tot_elem = soup.find('span', {'id': 'uc_class_lbl_wait_tot'})
            if wait_tot_elem:
                availability['waitlist_total'] = self._clean_text(wait_tot_elem.get_text())
            
            # Available Seats
            available_elem = soup.find('span', {'id': 'uc_class_lbl_available_seat'})
            if available_elem:
                availability['available_seats'] = self._clean_text(available_elem.get_text())
            
            # Determine status based on availability
            try:
                available_seats = int(availability['available_seats']) if availability['available_seats'] else 0
                waitlist_total = int(availability['waitlist_total']) if availability['waitlist_total'] else 0
                
                if available_seats > 0:
                    availability['status'] = 'Open'
                elif waitlist_total > 0:
                    availability['status'] = 'Waitlisted'
                else:
                    availability['status'] = 'Closed'
            except (ValueError, TypeError):
                availability['status'] = 'Unknown'
                
        except Exception as e:
            self.logger.error(f"Error parsing class availability: {e}")
        
        return availability

    def _parse_current_term_info(self, html: str) -> Optional[TermInfo]:
        """Parse term info when no dropdown is available"""
        return self._create_term_info(html)
    
    def _parse_term_info(self, html: str, term_code: str, term_name: str, get_enrollment_details: bool = False) -> Optional[TermInfo]:
        """Parse term-specific information from HTML"""
        return self._create_term_info(html, term_code, term_name, get_enrollment_details)
    
    
    def _clean_text(self, text: str) -> str:
        """Clean and normalize text content"""
        if not text:
            return ""
        return text.strip().replace('\n', ' ').replace('\r', '').replace('\t', ' ')
    
    def scrape_all_subjects(self, subjects: List[str], get_details: bool = False, get_enrollment_details: bool = False, config: Optional[ScrapingConfig] = None) -> Dict[str, List[Course]]:
        """Scrape all subjects"""
        if config is None:
            config = ScrapingConfig()  # Use testing defaults
            
        results = {}
        
        for i, subject in enumerate(subjects):
            self.logger.info(f"Processing {subject} ({i+1}/{len(subjects)})")
            
            courses = self.scrape_subject(subject, get_details=get_details, get_enrollment_details=get_enrollment_details, config=config)
            results[subject] = courses
            
            # Be polite to the server
            time.sleep(config.request_delay)
        
        return results
    
    def scrape_for_production(self, subjects: List[str], get_details: bool = True, get_enrollment_details: bool = True) -> Dict[str, List[Course]]:
        """Production scraping - unlimited courses, no debug files, optimized performance"""
        self.logger.info(f"Starting PRODUCTION scraping for {len(subjects)} subjects")
        config = ScrapingConfig.for_production()
        return self.scrape_all_subjects(subjects, get_details=get_details, get_enrollment_details=get_enrollment_details, config=config)
    
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