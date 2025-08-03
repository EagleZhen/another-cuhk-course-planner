import requests
import json
from bs4 import BeautifulSoup
from typing import List, Dict, Optional
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
import time
import logging
import ddddocr
import onnxruntime
import os

@dataclass
class ScrapingConfig:
    """Configuration for testing vs production scraping"""
    # Testing defaults - safe for development
    max_courses_per_subject: Optional[int] = 3  # None = unlimited
    save_debug_files: bool = True
    request_delay: float = 2.0
    max_retries: int = 3
    output_mode: str = "single_file"  # "single_file" or "per_subject"
    output_directory: str = "tests/output"  # testing default
    track_progress: bool = False  # Progress tracking for production
    progress_file: str = "scraping_progress.json"  # Progress log filename
    skip_recent_hours: float = 24  # Skip subjects scraped within N hours
    progress_update_interval: int = 60  # Save progress every N seconds
    
    @classmethod
    def for_production(cls):
        """Production-ready configuration - unlimited courses, optimized performance"""
        return cls(
            max_courses_per_subject=None,  # No limit
            save_debug_files=False,
            request_delay=1.0,
            max_retries=5,
            output_mode="per_subject",  # Per-subject files for production
            output_directory="data",     # Production data directory
            track_progress=True,         # Enable progress tracking
            progress_file="data/scraping_progress.json",
            skip_recent_hours=24,
            progress_update_interval=60  # 1-minute periodic saves
        )
    
    @classmethod
    def for_validation(cls, max_courses: int = 10):
        """Validation configuration - limited courses for testing"""
        return cls(
            max_courses_per_subject=max_courses,
            save_debug_files=False,
            request_delay=1.5,
            max_retries=3,
            output_mode="single_file",  # Keep single file for validation
            output_directory="tests/output",
            track_progress=False  # No progress tracking for validation
        )

@dataclass
class TermInfo:
    """Term-specific course information"""
    term_code: str  # e.g., "2390"
    term_name: str  # e.g., "2025-26 Term 2"
    schedule: List[Dict]  # List of sections with detailed availability/meetings
    
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

class ScrapingProgressTracker:
    """Tracks scraping progress for production runs with resume capability"""
    
    def __init__(self, progress_file: str, logger: logging.Logger):
        self.progress_file = progress_file
        self.logger = logger
        self.progress_data = self._load_progress()
    
    def _load_progress(self) -> Dict:
        """Load existing progress or create new structure"""
        if os.path.exists(self.progress_file):
            try:
                with open(self.progress_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                self.logger.info(f"Loaded existing progress from {self.progress_file}")
                return data
            except Exception as e:
                self.logger.warning(f"Could not load progress file: {e}, starting fresh")
        
        # Create new progress structure
        return {
            "scraping_log": {
                "created_at": datetime.now().isoformat(),
                "last_updated": datetime.now().isoformat(),
                "total_subjects": 0,
                "completed": 0,
                "failed": 0,
                "skipped": 0,
                "subjects": {}
            }
        }
    
    def _save_progress(self):
        """Save current progress to file"""
        try:
            # Ensure directory exists
            os.makedirs(os.path.dirname(self.progress_file), exist_ok=True)
            
            self.progress_data["scraping_log"]["last_updated"] = datetime.now().isoformat()
            
            with open(self.progress_file, 'w', encoding='utf-8') as f:
                json.dump(self.progress_data, f, ensure_ascii=False, indent=2)
            
            self.logger.debug(f"Progress saved to {self.progress_file}")
        except Exception as e:
            self.logger.error(f"Could not save progress: {e}")
    
    def should_skip_subject(self, subject: str, skip_recent_hours: float) -> bool:
        """Check if subject was recently scraped and should be skipped"""
        subjects = self.progress_data["scraping_log"]["subjects"]
        
        if subject not in subjects:
            return False
        
        subject_data = subjects[subject]
        
        # Skip if completed recently
        if subject_data.get("status") == "completed":
            last_scraped = subject_data.get("last_scraped")
            if last_scraped:
                try:
                    scraped_time = datetime.fromisoformat(last_scraped.replace('Z', '+00:00'))
                    if datetime.now() - scraped_time < timedelta(hours=skip_recent_hours):
                        self.logger.info(f"Skipping {subject}: completed {last_scraped} (within {skip_recent_hours}h)")
                        return True
                except Exception as e:
                    self.logger.warning(f"Could not parse last_scraped time for {subject}: {e}")
        
        return False
    
    def start_subject(self, subject: str, estimated_courses: int = 0):
        """Mark subject as started"""
        subjects = self.progress_data["scraping_log"]["subjects"]
        subjects[subject] = {
            "status": "in_progress",
            "started_at": datetime.now().isoformat(),
            "estimated_courses": estimated_courses,
            "courses_scraped": 0,
            "completed_courses": [],  # Track completed course codes
            "last_course_completed": "",
            "last_progress_update": datetime.now().isoformat(),
            "retry_count": subjects.get(subject, {}).get("retry_count", 0)
        }
        self._save_progress()
        self.logger.info(f"Started scraping {subject}")
    
    def update_course_progress(self, subject: str, course_code: str, total_courses_scraped: int):
        """Update progress for a specific course completion"""
        subjects = self.progress_data["scraping_log"]["subjects"]
        if subject in subjects and subjects[subject].get("status") == "in_progress":
            subject_data = subjects[subject]
            subject_data["courses_scraped"] = total_courses_scraped
            subject_data["last_course_completed"] = course_code
            subject_data["last_progress_update"] = datetime.now().isoformat()
            
            # Add to completed courses list if not already there
            completed_courses = subject_data.get("completed_courses", [])
            if course_code not in completed_courses:
                completed_courses.append(course_code)
                subject_data["completed_courses"] = completed_courses
            
            self.logger.debug(f"Updated {subject} progress: {total_courses_scraped} courses, last: {course_code}")
    
    def should_save_periodic_progress(self, last_save_time: float, interval_seconds: int) -> bool:
        """Check if it's time for a periodic progress save"""
        return time.time() - last_save_time >= interval_seconds
    
    def save_periodic_progress(self, force: bool = False):
        """Save progress periodically (called during long operations)"""
        if force:
            self._save_progress()
            self.logger.debug("Forced periodic progress save")
        else:
            self._save_progress()
            self.logger.debug("Periodic progress save")
    
    def complete_subject(self, subject: str, courses_count: int, output_file: str, duration_minutes: float, config_info: Dict):
        """Mark subject as completed"""
        subjects = self.progress_data["scraping_log"]["subjects"]
        subjects[subject] = {
            "status": "completed",
            "last_scraped": datetime.now().isoformat(),
            "courses_count": courses_count,
            "courses_scraped": courses_count,
            "output_file": output_file,
            "duration_minutes": round(duration_minutes, 2),
            "config": config_info,
            "retry_count": subjects.get(subject, {}).get("retry_count", 0)
        }
        
        # Update totals
        log = self.progress_data["scraping_log"]
        log["completed"] = len([s for s in log["subjects"].values() if s.get("status") == "completed"])
        
        self._save_progress()
        self.logger.info(f"Completed {subject}: {courses_count} courses in {duration_minutes:.1f} minutes")
    
    def fail_subject(self, subject: str, error_message: str):
        """Mark subject as failed"""
        subjects = self.progress_data["scraping_log"]["subjects"]
        current_data = subjects.get(subject, {})
        retry_count = current_data.get("retry_count", 0) + 1
        
        subjects[subject] = {
            "status": "failed",
            "last_attempt": datetime.now().isoformat(),
            "error": str(error_message)[:200],  # Limit error message length
            "retry_count": retry_count,
            "courses_scraped": current_data.get("courses_scraped", 0)
        }
        
        # Update totals
        log = self.progress_data["scraping_log"]
        log["failed"] = len([s for s in log["subjects"].values() if s.get("status") == "failed"])
        
        self._save_progress()
        self.logger.error(f"Failed {subject} (attempt {retry_count}): {error_message}")
    
    def skip_subject(self, subject: str, reason: str):
        """Mark subject as skipped"""
        subjects = self.progress_data["scraping_log"]["subjects"]
        subjects[subject] = {
            "status": "skipped",
            "skipped_at": datetime.now().isoformat(),
            "reason": reason
        }
        
        # Update totals
        log = self.progress_data["scraping_log"]
        log["skipped"] = len([s for s in log["subjects"].values() if s.get("status") == "skipped"])
        
        self._save_progress()
        self.logger.info(f"Skipped {subject}: {reason}")
    
    def get_remaining_subjects(self, all_subjects: List[str]) -> List[str]:
        """Get list of subjects that still need to be scraped"""
        subjects = self.progress_data["scraping_log"]["subjects"]
        remaining = []
        
        for subject in all_subjects:
            if subject not in subjects or subjects[subject].get("status") not in ["completed", "skipped"]:
                remaining.append(subject)
        
        return remaining
    
    def get_failed_subjects(self) -> List[str]:
        """Get list of failed subjects for retry"""
        subjects = self.progress_data["scraping_log"]["subjects"]
        return [subject for subject, data in subjects.items() if data.get("status") == "failed"]
    
    def get_remaining_courses_for_subject(self, subject: str, all_course_codes: List[str]) -> List[str]:
        """Get list of courses that still need to be scraped for a subject"""
        subjects = self.progress_data["scraping_log"]["subjects"]
        if subject not in subjects:
            return all_course_codes
        
        subject_data = subjects[subject]
        if subject_data.get("status") == "completed":
            return []  # Subject already completed
        
        completed_courses = subject_data.get("completed_courses", [])
        return [course for course in all_course_codes if course not in completed_courses]
    
    def get_progress_percentage(self, subject: str) -> float:
        """Get completion percentage for a subject"""
        subjects = self.progress_data["scraping_log"]["subjects"]
        if subject not in subjects:
            return 0.0
        
        subject_data = subjects[subject]
        courses_scraped = subject_data.get("courses_scraped", 0)
        estimated_courses = subject_data.get("estimated_courses", 0)
        
        if estimated_courses > 0:
            return min(100.0, (courses_scraped / estimated_courses) * 100)
        return 0.0
    
    def print_summary(self):
        """Print current progress summary"""
        log = self.progress_data["scraping_log"]
        total = len(log["subjects"])
        completed = log.get("completed", 0)
        failed = log.get("failed", 0)
        skipped = log.get("skipped", 0)
        
        print(f"\n=== SCRAPING PROGRESS SUMMARY ===")
        print(f"Total subjects: {total}")
        print(f"Completed: {completed}")
        print(f"Failed: {failed}")
        print(f"Skipped: {skipped}")
        print(f"Progress: {(completed + skipped) / max(total, 1) * 100:.1f}%")
        
        if failed > 0:
            print(f"\nFailed subjects: {', '.join(self.get_failed_subjects())}")

class CuhkScraper:
    """Simplified CUHK course scraper"""
    
    def __init__(self):
        self.session = requests.Session()
        self.logger = logging.getLogger(__name__)
        self.base_url = "http://rgsntl.rgs.cuhk.edu.hk/aqs_prd_applx/Public/tt_dsp_crse_catalog.aspx"
        self.progress_tracker: Optional[ScrapingProgressTracker] = None
        
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
                
                # Mark subject as started in progress tracker with course count estimate
                if self.progress_tracker and config.track_progress:
                    self.progress_tracker.start_subject(subject_code, len(courses))
                
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
                    last_progress_save = time.time()  # Track last periodic save
                    
                    for i, course in enumerate(courses_to_detail):
                        self.logger.info(f"Getting details for course {i+1}/{len(courses_to_detail)}: {course.course_code}")
                        detailed_course = self.get_course_details(course, response.text, get_enrollment_details=get_enrollment_details, config=config)
                        detailed_courses.append(detailed_course)
                        
                        # Update course-level progress tracking
                        if self.progress_tracker and config.track_progress:
                            courses_completed = i + 1
                            self.progress_tracker.update_course_progress(subject_code, course.course_code, courses_completed)
                            
                            # Periodic progress save based on interval
                            if self.progress_tracker.should_save_periodic_progress(last_progress_save, config.progress_update_interval):
                                self.progress_tracker.save_periodic_progress()
                                last_progress_save = time.time()
                                self.logger.info(f"Progress saved: {subject_code} - {courses_completed}/{len(courses_to_detail)} courses completed")
                        
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
                
                if attempt < config.max_retries - 1:
                    time.sleep(2 ** attempt)  # Exponential backoff
                    
            except Exception as e:
                self.logger.error(f"Attempt {attempt + 1} failed for {subject_code}: {e}")
                if attempt < config.max_retries - 1:
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
        
        # Always create TermInfo if we have term codes/names (even with empty schedule)
        if term_code or term_name != "Unknown Term" or schedule_data:
            return TermInfo(
                term_code=term_code,
                term_name=term_name,
                schedule=schedule_data or []
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
        """Scrape all subjects with optional progress tracking"""
        if config is None:
            config = ScrapingConfig()  # Use testing defaults
        
        # Initialize progress tracker if enabled
        if config.track_progress:
            self.progress_tracker = ScrapingProgressTracker(config.progress_file, self.logger)
            self.progress_tracker.progress_data["scraping_log"]["total_subjects"] = len(subjects)
            self.logger.info(f"Progress tracking enabled: {config.progress_file}")
        
        results = {}
        
        for i, subject in enumerate(subjects):
            self.logger.info(f"Processing {subject} ({i+1}/{len(subjects)})")
            
            # Check if subject should be skipped (freshness check)
            if self.progress_tracker and self.progress_tracker.should_skip_subject(subject, config.skip_recent_hours):
                self.progress_tracker.skip_subject(subject, f"completed within {config.skip_recent_hours}h")
                continue
            
            # Track start time for duration calculation
            start_time = time.time()
            
            try:
                courses = self.scrape_subject(subject, get_details=get_details, get_enrollment_details=get_enrollment_details, config=config)
                results[subject] = courses
                
                # Calculate duration and mark as completed
                duration_minutes = (time.time() - start_time) / 60
                if self.progress_tracker:
                    config_info = {
                        "get_details": get_details,
                        "get_enrollment_details": get_enrollment_details,
                        "max_courses": config.max_courses_per_subject
                    }
                    # We'll update this with the actual output file path in export methods
                    self.progress_tracker.complete_subject(subject, len(courses), "", duration_minutes, config_info)
                
            except Exception as e:
                # Mark subject as failed in progress tracker
                if self.progress_tracker:
                    self.progress_tracker.fail_subject(subject, str(e))
                
                self.logger.error(f"Failed to scrape {subject}: {e}")
                results[subject] = []  # Add empty result to maintain structure
            
            # Be polite to the server
            time.sleep(config.request_delay)
        
        # Print progress summary if tracking enabled
        if self.progress_tracker:
            self.progress_tracker.print_summary()
        
        return results
    
    def scrape_for_production(self, subjects: List[str], get_details: bool = True, get_enrollment_details: bool = True) -> Dict[str, List[Course]]:
        """Production scraping - unlimited courses, no debug files, optimized performance"""
        self.logger.info(f"Starting PRODUCTION scraping for {len(subjects)} subjects")
        config = ScrapingConfig.for_production()
        return self.scrape_all_subjects(subjects, get_details=get_details, get_enrollment_details=get_enrollment_details, config=config)
    
    def scrape_and_export_production(self, subjects: List[str], get_details: bool = True, get_enrollment_details: bool = True) -> str:
        """Complete production workflow: scrape + export to per-subject files in /data"""
        config = ScrapingConfig.for_production()
        self.logger.info(f"Starting PRODUCTION scraping and export for {len(subjects)} subjects")
        self.logger.info(f"Output: per-subject files in {config.output_directory}/")
        
        results = self.scrape_all_subjects(subjects, get_details=get_details, get_enrollment_details=get_enrollment_details, config=config)
        export_summary = self.export_to_json(results, config=config)
        
        return export_summary
    
    def resume_production_scraping(self, all_subjects: List[str] = None, get_details: bool = True, get_enrollment_details: bool = True) -> str:
        """Resume production scraping from previous progress"""
        config = ScrapingConfig.for_production()
        
        # Get all subjects if not provided
        if all_subjects is None:
            all_subjects = self.get_subjects_from_live_site()
            if not all_subjects:
                return "Could not get subjects from live website"
        
        # Initialize progress tracker to check existing progress
        progress_tracker = ScrapingProgressTracker(config.progress_file, self.logger)
        
        # Get remaining subjects to scrape
        remaining_subjects = progress_tracker.get_remaining_subjects(all_subjects)
        
        if not remaining_subjects:
            self.logger.info("All subjects already completed!")
            progress_tracker.print_summary()
            return "All subjects already completed"
        
        self.logger.info(f"Resuming scraping for {len(remaining_subjects)} remaining subjects")
        self.logger.info(f"Remaining: {remaining_subjects[:10]}{'...' if len(remaining_subjects) > 10 else ''}")
        
        # Continue scraping remaining subjects
        results = self.scrape_all_subjects(remaining_subjects, get_details=get_details, get_enrollment_details=get_enrollment_details, config=config)
        export_summary = self.export_to_json(results, config=config)
        
        return export_summary
    
    def retry_failed_subjects(self, get_details: bool = True, get_enrollment_details: bool = True) -> str:
        """Retry previously failed subjects"""
        config = ScrapingConfig.for_production()
        
        # Initialize progress tracker to check existing progress
        progress_tracker = ScrapingProgressTracker(config.progress_file, self.logger)
        
        # Get failed subjects
        failed_subjects = progress_tracker.get_failed_subjects()
        
        if not failed_subjects:
            self.logger.info("No failed subjects to retry!")
            return "No failed subjects to retry"
        
        self.logger.info(f"Retrying {len(failed_subjects)} failed subjects: {failed_subjects}")
        
        # Retry failed subjects
        results = self.scrape_all_subjects(failed_subjects, get_details=get_details, get_enrollment_details=get_enrollment_details, config=config)
        export_summary = self.export_to_json(results, config=config)
        
        return export_summary
    
    def export_to_json(self, data: Dict[str, List[Course]], config: Optional[ScrapingConfig] = None, filename: str = None) -> str:
        """Export data to JSON with metadata, supporting both single file and per-subject modes"""
        if config is None:
            config = ScrapingConfig()  # Use testing defaults
        
        # Ensure output directory exists
        import os
        os.makedirs(config.output_directory, exist_ok=True)
        
        if config.output_mode == "per_subject":
            return self._export_per_subject(data, config)
        else:
            return self._export_single_file(data, config, filename)
    
    def _export_single_file(self, data: Dict[str, List[Course]], config: ScrapingConfig, filename: str = None) -> str:
        """Export all data to a single JSON file"""
        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{config.output_directory}/cuhk_courses_{timestamp}.json"
        
        # Structure for web app consumption
        json_data = {
            "metadata": {
                "scraped_at": datetime.now().isoformat(),
                "total_subjects": len(data),
                "total_courses": sum(len(courses) for courses in data.values()),
                "output_mode": "single_file"
            },
            "subjects": {}
        }
        
        for subject, courses in data.items():
            json_data["subjects"][subject] = [course.to_dict() for course in courses]
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(json_data, f, ensure_ascii=False, indent=2)
        
        self.logger.info(f"Exported to {filename}")
        return filename
    
    def _export_per_subject(self, data: Dict[str, List[Course]], config: ScrapingConfig) -> str:
        """Export each subject to its own JSON file"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        exported_files = []
        
        for subject, courses in data.items():
            # Create per-subject JSON structure
            subject_data = {
                "metadata": {
                    "scraped_at": datetime.now().isoformat(),
                    "subject": subject,
                    "total_courses": len(courses),
                    "output_mode": "per_subject"
                },
                "courses": [course.to_dict() for course in courses]
            }
            
            # Create filename with subject prefix
            filename = f"{config.output_directory}/{subject}_{timestamp}.json"
            
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(subject_data, f, ensure_ascii=False, indent=2)
            
            exported_files.append(filename)
            self.logger.info(f"Exported {subject} ({len(courses)} courses) to {filename}")
            
            # Update progress tracker with output file path
            if self.progress_tracker and subject in self.progress_tracker.progress_data["scraping_log"]["subjects"]:
                subject_progress = self.progress_tracker.progress_data["scraping_log"]["subjects"][subject]
                if subject_progress.get("status") == "completed":
                    subject_progress["output_file"] = filename
                    self.progress_tracker._save_progress()
        
        # Return summary of exported files
        summary = f"Exported {len(data)} subjects to {len(exported_files)} files in {config.output_directory}/"
        self.logger.info(summary)
        return summary
    

def main():
    """Main function - demonstrates both testing and production usage"""
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
    
    # Test with just CSCI first
    test_subjects = ["CSCI"] if "CSCI" in subjects else [subjects[0]]
    print(f"Testing with subjects: {test_subjects}")
    
    try:
        print("\n=== TESTING MODE (default) ===")
        print("- Limited to 3 courses per subject")
        print("- Debug files enabled")
        print("- 2.0s delays between requests")
        
        # Testing mode (default behavior)
        results = scraper.scrape_all_subjects(test_subjects, get_details=True, get_enrollment_details=True)
        
        # Export results with default config (single file, tests/output)
        json_file = scraper.export_to_json(results)
        print(f"Results exported to {json_file}")
        
        # Show summary
        total_courses = sum(len(courses) for courses in results.values())
        print(f"Total courses scraped: {total_courses}")
        
        print("\n=== PRODUCTION MODE EXAMPLES ===")
        print("For complete production workflow (recommended):")
        print("  summary = scraper.scrape_and_export_production(subjects)")
        print("  # Creates per-subject files in /data/ directory")
        print()
        print("For production scraping only:")
        print("  results = scraper.scrape_for_production(subjects)")
        print("  summary = scraper.export_to_json(results, ScrapingConfig.for_production())")
        print()
        print("Per-subject files enable:")
        print("  - Fault tolerance (keep completed subjects if scraping fails)")
        print("  - Incremental updates (update individual subjects)")
        print("  - Better web app performance (load subjects on-demand)")
        
    except KeyboardInterrupt:
        print("\nScraping interrupted")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()