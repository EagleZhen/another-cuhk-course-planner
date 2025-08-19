import requests
from requests.exceptions import RequestException, Timeout, ConnectionError, HTTPError
import json
from bs4 import BeautifulSoup
from typing import List, Dict, Optional, Any, Union
from bs4 import Tag
from dataclasses import dataclass, asdict, field
import time
import logging
from datetime import datetime
import ddddocr
import onnxruntime
import os
import gc
from data_utils import html_to_clean_markdown, utc_now_iso, clean_html_text, parse_enrollment_status_from_image, clean_class_attributes, format_duration_human, calculate_duration_seconds


@dataclass
class ScrapingConfig:
    """Configuration for testing vs production scraping"""
    # Testing defaults - safe for development
    max_courses_per_subject: Optional[int] = 3  # None = unlimited
    save_debug_files: bool = True  # Save HTML files for debugging
    save_debug_on_error: bool = True  # Always save HTML when parsing fails
    debug_html_directory: str = "tests/output/debug_html"  # Separate from JSON results
    request_delay: float = 2.0
    max_retries: int = 5
    output_mode: str = "single_file"  # "single_file" or "per_subject"
    output_directory: str = "tests/output"  # testing default
    track_progress: bool = False  # Progress tracking for production
    progress_file: str = "tests/output/scraping_progress.json"  # Progress log filename
    progress_update_interval: int = 60  # Save progress every N seconds
    
    # Scraping scope configuration
    get_details: bool = False  # Get detailed course information beyond basic listings
    get_enrollment_details: bool = False  # Get section-level enrollment numbers and availability
    get_course_outcome: bool = False  # Get Course Outcome page data (learning outcomes, assessments, etc.)
    
    @classmethod
    def for_production(cls):
        """Production-ready configuration - unlimited courses, optimized performance"""
        return cls(
            max_courses_per_subject=None,  # No limit
            save_debug_files=False,       # No debug files in production
            save_debug_on_error=True,     # Only save HTML on parsing errors
            debug_html_directory="tests/output/debug_html",  # Separate debug folder
            request_delay=1.0,
            max_retries=10,
            output_mode="per_subject",  # Per-subject files for production
            output_directory="data",     # Production data directory
            track_progress=True,         # Enable progress tracking
            progress_file="data/scraping_progress.json",
            progress_update_interval=60,  # 1-minute periodic saves
            # Full scraping scope for production
            get_details=True,
            get_enrollment_details=True,
            get_course_outcome=True  # Include Course Outcome data for comprehensive course information
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
    course_attributes: str = ""  # e.g., "Virtual Teaching & Learning Course", "Service-Learning Course"
    academic_career: str = ""  # e.g., "Undergraduate"
    # Note: class_attributes are section-specific and stored in each section's data within schedule
    grading_basis: str = ""    # e.g., "Graded"
    component: str = ""        # e.g., "Lecture\nInteractive Tutorial"
    campus: str = ""           # e.g., "Main Campus"
    academic_group: str = ""   # e.g., "Dept of Computer Sci & Engg"
    academic_org: str = ""     # e.g., "Dept of Computer Sci & Engg"
    
    # Course Outcome details (optional, scraped from Course Outcome page)
    learning_outcomes: str = ""      # Learning objectives and outcomes
    course_syllabus: str = ""        # Course syllabus (might be same as description)  
    assessment_types: Dict[str, str] = field(default_factory=dict)  # {"Presentation": "20", "Project": "30", ...}
    feedback_evaluation: str = ""    # Feedback for evaluation
    required_readings: str = ""      # Required reading materials
    recommended_readings: str = ""   # Recommended reading materials
    
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
        """Load existing subject data but start fresh session tracking"""
        existing_subjects = {}
        
        # Load existing subject data if progress file exists
        if os.path.exists(self.progress_file):
            try:
                with open(self.progress_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                # Preserve existing subject data (so we don't lose completed subjects)
                if "scraping_log" in data and "subjects" in data["scraping_log"]:
                    existing_subjects = data["scraping_log"]["subjects"]
                    self.logger.info(f"Preserved data for {len(existing_subjects)} existing subjects")
                
            except Exception as e:
                self.logger.warning(f"Could not load progress file: {e}, starting with fresh session")
        
        # Always start with fresh session tracking, but preserve existing subject data
        return {
            "scraping_log": {
                "started_at": utc_now_iso(),    # Fresh session start time
                "last_updated": utc_now_iso(),  # Fresh session activity
                "duration_human": "0 seconds",  # Fresh session duration
                "total_subjects": 0,            # Will be set by scrape_all_subjects
                "completed": 0,                 # Fresh counts for current session
                "failed": 0,                    # Fresh counts for current session
                "subjects": existing_subjects   # Preserve existing subject data
            }
        }
    
    def _save_progress(self):
        """Save current progress to file"""
        try:
            # Ensure directory exists (only if there's a directory path)
            dir_path = os.path.dirname(self.progress_file)
            if dir_path:  # Only create directory if path contains a directory
                os.makedirs(dir_path, exist_ok=True)
            
            self.progress_data["scraping_log"]["last_updated"] = utc_now_iso()
            
            # Calculate and include current session duration for real-time monitoring
            if 'started_at' in self.progress_data["scraping_log"]:
                started_at = self.progress_data["scraping_log"]["started_at"]
                duration_seconds = calculate_duration_seconds(started_at)
                if duration_seconds is not None:
                    self.progress_data["scraping_log"]["duration_human"] = format_duration_human(duration_seconds)
            
            with open(self.progress_file, 'w', encoding='utf-8') as f:
                json.dump(self.progress_data, f, ensure_ascii=False, indent=2)
            
            self.logger.debug(f"💾 Progress saved to {self.progress_file}")
        except Exception as e:
            self.logger.error(f"Could not save progress: {e}")
    
    def start_subject(self, subject: str, estimated_courses: int = 0):
        """Mark subject as started"""
        subjects = self.progress_data["scraping_log"]["subjects"]
        subjects[subject] = {
            "status": "in_progress",
            "started_at": utc_now_iso(),
            "estimated_courses": estimated_courses,
            "courses_scraped": 0,
            "completed_courses": [],  # Track completed course codes
            "last_course_completed": "",
            "last_progress_update": utc_now_iso(),
            "retry_count": subjects.get(subject, {}).get("retry_count", 0)
        }
        self._save_progress()
        self.logger.info(f"🚀 Started scraping {subject}")
    
    def update_course_progress(self, subject: str, course_code: str, total_courses_scraped: int):
        """Update progress for a specific course completion"""
        subjects = self.progress_data["scraping_log"]["subjects"]
        if subject in subjects and subjects[subject].get("status") == "in_progress":
            subject_data = subjects[subject]
            subject_data["courses_scraped"] = total_courses_scraped
            subject_data["last_course_completed"] = course_code
            subject_data["last_progress_update"] = utc_now_iso()
            
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
            "last_scraped": utc_now_iso(),
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
        self.logger.info(f"✅ Completed {subject}: {courses_count} courses in {duration_minutes:.1f} minutes")
    
    def fail_subject(self, subject: str, error_message: str):
        """Mark subject as failed"""
        subjects = self.progress_data["scraping_log"]["subjects"]
        current_data = subjects.get(subject, {})
        retry_count = current_data.get("retry_count", 0) + 1
        
        subjects[subject] = {
            "status": "failed",
            "last_attempt": utc_now_iso(),
            "error": str(error_message)[:200],  # Limit error message length
            "retry_count": retry_count,
            "courses_scraped": current_data.get("courses_scraped", 0)
        }
        
        # Update totals
        log = self.progress_data["scraping_log"]
        log["failed"] = len([s for s in log["subjects"].values() if s.get("status") == "failed"])
        
        self._save_progress()
        self.logger.error(f"Failed {subject} (attempt {retry_count}): {error_message}")
    
    def get_failed_subjects(self) -> List[str]:
        """Get list of failed subjects for summary/retry purposes"""
        subjects = self.progress_data["scraping_log"]["subjects"]
        return [subject for subject, data in subjects.items() if data.get("status") == "failed"]
    
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
        
        print(f"\n=== SCRAPING PROGRESS SUMMARY ===")
        print(f"Total subjects: {total}")
        print(f"Completed: {completed}")
        print(f"Failed: {failed}")
        print(f"Progress: {completed / max(total, 1) * 100:.1f}%")
        
        if failed > 0:
            print(f"\nFailed subjects: {', '.join(self.get_failed_subjects())}")

class CuhkScraper:
    """Simplified CUHK course scraper"""
    
    def __init__(self, config: Optional[ScrapingConfig] = None):
        self.session = requests.Session()
        self.logger = logging.getLogger(__name__)
        self.base_url = "http://rgsntl.rgs.cuhk.edu.hk/aqs_prd_applx/Public/tt_dsp_crse_catalog.aspx"
        self.progress_tracker: Optional[ScrapingProgressTracker] = None
        
        # Primary configuration for this scraper instance
        self.config = config or ScrapingConfig()
        
        # Set up file logging automatically
        self._setup_file_logging()
        
        # Context management - eliminates parameter propagation (kept for debugging context)
        self.current_config: Optional[ScrapingConfig] = None
        self.current_course_context: Optional[Dict] = None
        self.subject_titles_cache: Dict[str, str] = {}  # Cache for subject code -> title mapping
        
        # Suppress ONNX warnings
        onnxruntime.set_default_logger_severity(3)
        self.ocr = ddddocr.DdddOcr()
        
        # Browser headers and network resilience settings
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive',
        })
        
        # Network resilience settings
        self._request_timeout = (10, 30)  # (connect, read) timeouts in seconds
    
    def _robust_request(self, method: str, url: str, **kwargs) -> requests.Response:
        """
        Robust HTTP request with infinite retry for network issues
        
        Args:
            method: 'GET' or 'POST'
            url: URL to request
            **kwargs: Additional arguments for requests (data, params, etc.)
            
        Returns:
            Response object
            
        Note:
            Retries infinitely for network issues (ConnectionError, Timeout, server errors)
            Does not retry for client errors (4xx)
        """
        # Set default timeout if not provided
        if 'timeout' not in kwargs:
            kwargs['timeout'] = self._request_timeout
        
        attempt = 0
        while True:
            try:
                # Make the request
                if method.upper() == 'GET':
                    response = self.session.get(url, **kwargs)
                elif method.upper() == 'POST':
                    response = self.session.post(url, **kwargs)
                else:
                    raise ValueError(f"Unsupported HTTP method: {method}")
                
                # Check for HTTP errors
                response.raise_for_status()
                return response
                
            except (ConnectionError, Timeout) as e:
                attempt += 1
                # Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, max 60s
                wait_time = min(60, 1.0 * (2 ** (attempt - 1)))
                self.logger.warning(f"🌐 Network issue (attempt {attempt}), retrying in {wait_time}s: {type(e).__name__}")
                time.sleep(wait_time)
                
            except HTTPError as e:
                if e.response.status_code in [502, 503, 504]:  # Server errors - retry
                    attempt += 1
                    wait_time = min(60, 1.0 * (2 ** (attempt - 1)))  # Exponential backoff, max 60s
                    self.logger.warning(f"🔧 Server error {e.response.status_code} (attempt {attempt}), retrying in {wait_time}s")
                    time.sleep(wait_time)
                else:
                    # Don't retry client errors (4xx) or other server errors
                    self.logger.error(f"❌ HTTP error {e.response.status_code}: {e}")
                    raise
    
    def _setup_file_logging(self, logs_directory: str = "logs", log_level: int = logging.INFO) -> str:
        """
        Set up file logging for the scraper with timestamped log files.
        Called automatically during scraper initialization.
        
        Args:
            logs_directory: Directory to store log files (default: "logs")
            log_level: Logging level (default: logging.INFO)
            
        Returns:
            str: Path to the created log file
        """
        # Create logs directory if it doesn't exist
        os.makedirs(logs_directory, exist_ok=True)
        
        # Create timestamped log filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        log_filename = os.path.join(logs_directory, f'scraper_{timestamp}.log')
        
        # Add file handler to the existing logger
        file_handler = logging.FileHandler(log_filename, encoding='utf-8')
        file_handler.setLevel(log_level)
        
        # Use the same format as console output
        formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        file_handler.setFormatter(formatter)
        
        # Add handler to logger (keeps existing console output)
        self.logger.addHandler(file_handler)
        self.logger.setLevel(log_level)
        
        self.logger.info(f"📝 File logging initialized: {log_filename}")
        return log_filename
    
    def _set_context(self, config: ScrapingConfig, course: Optional[Course] = None):
        """Set current scraping context to eliminate parameter propagation"""
        self.current_config = config
        if course:
            self.current_course_context = {
                'subject': course.subject,
                'course_code': course.course_code
            }
    
    def _save_debug_html(self, content: str, filename: str, force_save: bool = False) -> None:
        """Smart HTML debug file saving with separate directory"""
        if not self.current_config:
            return
            
        # Save if explicitly enabled or on error
        should_save = (self.current_config.save_debug_files or 
                      (force_save and self.current_config.save_debug_on_error))
        
        if should_save:
            # Ensure debug directory exists
            os.makedirs(self.current_config.debug_html_directory, exist_ok=True)
            
            # Save to separate debug directory
            debug_path = os.path.join(self.current_config.debug_html_directory, filename)
            with open(debug_path, 'w', encoding='utf-8') as f:
                f.write(content)
            self.logger.info(f"Saved debug HTML: {debug_path}")
    
    def _solve_captcha(self, image_bytes: bytes) -> Optional[str]:
        """Solve captcha using ddddocr"""
        try:
            # ddddocr.classification() returns a string, but type checker doesn't know this
            raw_result = self.ocr.classification(image_bytes)
            text = str(raw_result).strip().upper()
            
            # Validate captcha format (4 alphanumeric characters)
            if len(text) == 4 and text.isalnum():
                self.logger.info(f"🔤 OCR produced: {text} (awaiting server validation)")
                return text
            else:
                self.logger.warning(f"❌ Invalid OCR format: '{text}' (expected 4 alphanumeric)")
            
        except Exception as e:
            self.logger.error(f"❌ OCR processing failed: {e}")
        
        return None
    
    def _validate_captcha_response(self, response_html: str) -> dict:
        """
        Analyze server response to determine captcha status and result type
        
        Args:
            response_html: HTML response from server after captcha submission
            
        Returns:
            dict: {
                'captcha_accepted': bool,
                'has_results': bool,
                'result_type': str,  # 'captcha_failed' | 'no_records' | 'has_courses' | 'server_error' | etc.
                'error_message': str | None
            }
        """
        soup = BeautifulSoup(response_html, 'html.parser')
        
        # 1. Check for explicit captcha error message
        error_span = soup.find('span', {'id': 'lbl_error', 'class': 'errorLabel'})
        if error_span:
            error_text = error_span.get_text(strip=True)
            if error_text:  # Non-empty error message
                if 'Invalid Verification Code' in error_text:
                    return {
                        'captcha_accepted': False,
                        'has_results': False,
                        'result_type': 'captcha_failed',
                        'error_message': error_text
                    }
                else:
                    # Other server errors
                    return {
                        'captcha_accepted': False,
                        'has_results': False,
                        'result_type': 'server_error',
                        'error_message': error_text
                    }
        
        # 2. If no error message, check for results table
        results_table = soup.find('table', {'id': 'gv_detail'})
        if not results_table:
            # No results table = captcha might have failed (form redisplay)
            # Double-check: if search form is still present = captcha failed
            search_form = soup.find('input', {'name': 'txt_captcha'})
            if search_form:
                return {
                    'captcha_accepted': False,
                    'has_results': False,
                    'result_type': 'captcha_failed_no_table',
                    'error_message': 'No results table found, search form redisplayed'
                }
            else:
                return {
                    'captcha_accepted': True,  # Uncertain but likely accepted
                    'has_results': False,
                    'result_type': 'unknown_error',
                    'error_message': 'No results table, no search form'
                }
        
        # 3. Results table exists - check if it has actual data
        empty_row = results_table.find('tr', class_='normalGridViewEmptyDataRowStyle')
        if empty_row:
            empty_text = empty_row.get_text(strip=True)
            if 'No record found' in empty_text:
                return {
                    'captcha_accepted': True,
                    'has_results': False,
                    'result_type': 'no_records',
                    'error_message': None
                }
        
        # 4. Check for actual course data rows
        course_links = results_table.find_all('a', {'id': lambda x: x and 'lbtn_course_nbr' in x})
        if course_links:
            return {
                'captcha_accepted': True,
                'has_results': True,
                'result_type': 'has_courses',
                'error_message': None
            }
        
        # 5. Fallback: table exists but unclear content
        return {
            'captcha_accepted': True,  # Assume accepted if we got to results
            'has_results': False,
            'result_type': 'empty_unclear',
            'error_message': 'Results table exists but content unclear'
        }
    
    def get_subjects_from_live_site(self) -> List[str]:
        """Extract subject codes from live website"""
        try:
            response = self._robust_request('GET', self.base_url)
            
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
    
    def get_subjects_with_titles_from_live_site(self) -> List[Dict[str, str]]:
        """Extract subject codes and titles from live website"""
        try:
            response = self._robust_request('GET', self.base_url)
            soup = BeautifulSoup(response.text, 'html.parser')
            select = soup.find('select', {'name': 'ddl_subject'})
            
            if not select:
                self.logger.error("Could not find subject dropdown on live site")
                return []
            
            subjects = []
            for option in select.find_all('option'):
                value = option.get('value', '').strip()
                text = option.get_text().strip()
                if value and text:  # Skip empty options
                    subjects.append({
                        "code": value,
                        "title": text
                    })
            
            self.logger.info(f"📋 Found {len(subjects)} subjects with titles from live site")
            return subjects
            
        except Exception as e:
            self.logger.error(f"❌ Error getting subjects with titles: {e}")
            return []
    
    def scrape_subject(self, subject_code: str) -> List[Course]:
        """Scrape courses for a specific subject"""
        # Set context for this subject
        self._set_context(self.config)
            
        for attempt in range(self.config.max_retries):
            try:
                self.logger.info(f"📋 Scraping {subject_code}, attempt {attempt + 1}")
                
                # Get the initial page to extract form data
                response = self._robust_request('GET', self.base_url)
                
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # Extract form data
                form_data = self._extract_form_data(soup)
                form_data['ddl_subject'] = subject_code
                
                # Submit the form
                response = self._robust_request('POST', self.base_url, data=form_data)
                
                # Validate captcha was accepted by server
                validation = self._validate_captcha_response(response.text)
                if not validation['captcha_accepted']:
                    self.logger.warning(
                        f"🚫 Captcha rejected for {subject_code} (attempt {attempt + 1}): "
                        f"{validation['result_type']} - {validation.get('error_message', 'Unknown')}"
                    )
                    # Continue to next attempt
                    if attempt < self.config.max_retries - 1:
                        time.sleep(1)  # Brief delay before retry
                    continue
                
                # Captcha accepted! Log result type
                self.logger.info(f"✅ Captcha accepted for {subject_code}: {validation['result_type']}")
                
                # Debug: save response to understand structure (using smart saving)
                self._save_debug_html(response.text, f"response_{subject_code}_attempt_{attempt + 1}.html")
                
                # Parse results
                courses = self._parse_course_results(response.text)
                
                # Set the subject for all courses
                for course in courses:
                    course.subject = subject_code
                
                # Mark subject as started in progress tracker with course count estimate
                if self.progress_tracker and self.config.track_progress:
                    self.progress_tracker.start_subject(subject_code, len(courses))
                
                # Get detailed information if requested
                if self.config.get_details and courses:
                    # Apply course limit based on configuration
                    if self.config.max_courses_per_subject is not None:
                        courses_to_detail = courses[:self.config.max_courses_per_subject]
                        self.logger.info(f"Getting details for {len(courses_to_detail)} courses (limited by config)...")
                    else:
                        courses_to_detail = courses
                        self.logger.info(f"Getting details for all {len(courses_to_detail)} courses...")
                    
                    detailed_courses = []
                    last_progress_save = time.time()  # Track last periodic save
                    
                    for i, course in enumerate(courses_to_detail):
                        self.logger.info(f"📖 Getting details for course {i+1}/{len(courses_to_detail)}: {course.course_code}")
                        detailed_course = self.get_course_details(course, response.text)
                        detailed_courses.append(detailed_course)
                        
                        # Update course-level progress tracking
                        if self.progress_tracker and self.config.track_progress:
                            courses_completed = i + 1
                            self.progress_tracker.update_course_progress(subject_code, course.course_code, courses_completed)
                            
                            # Periodic progress save based on interval
                            if self.progress_tracker.should_save_periodic_progress(last_progress_save, self.config.progress_update_interval):
                                self.progress_tracker.save_periodic_progress()
                                last_progress_save = time.time()
                                self.logger.info(f"💾 Progress saved: {subject_code} - {courses_completed}/{len(courses_to_detail)} courses completed")
                        
                        # Be polite to the server
                        if i < len(courses_to_detail) - 1:
                            time.sleep(self.config.request_delay)
                    
                    # Add remaining courses without details for complete list (if limited)
                    if self.config.max_courses_per_subject is not None:
                        detailed_courses.extend(courses[self.config.max_courses_per_subject:])
                    courses = detailed_courses
                
                # Log results based on validation type and course count
                if validation['result_type'] == 'no_records':
                    self.logger.info(f"🔍 {subject_code}: Valid search, no courses found (empty subject)")
                    return []  # Success - empty subject, no retry needed
                elif validation['result_type'] == 'has_courses':
                    self.logger.info(f"🔍 {subject_code}: Found {len(courses)} courses")
                    return courses  # Success - return found courses
                
                # If we reach here, something unexpected happened - retry
                self.logger.warning(f"⚠️ Unexpected validation result: {validation['result_type']}")
                if attempt < self.config.max_retries - 1:
                    time.sleep(min(60, 2 ** attempt))  # Exponential backoff, max 60s
                    
            except Exception as e:
                self.logger.error(f"Attempt {attempt + 1} failed for {subject_code}: {e}")
                if attempt < self.config.max_retries - 1:
                    time.sleep(min(60, 2 ** attempt))  # Exponential backoff, max 60s
        
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
                captcha_response = self._robust_request('GET', captcha_url)
                captcha_text = self._solve_captcha(captcha_response.content)
                
                if not captcha_text:
                    return {}
                
                form_data['txt_captcha'] = captcha_text
            else:
                self.logger.error("Could not find captcha URL")
                return {}
        else:
            self.logger.error("Could not find captcha image")
            return {}
        
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
                        course_code = clean_html_text(course_nbr_link.get_text())
                        title = clean_html_text(course_title_link.get_text())
                        
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
            response = self._robust_request('POST', self.base_url, data=form_data)
            
            # Get course details with all available terms
            detailed_course = self._get_course_details_with_term_selection(response.text, course)
            
            # Debug: save detailed response (using smart saving)
            self._set_context(self.config, course)  # Set course context
            self._save_debug_html(response.text, f"course_details_{course.subject}_{course.course_code}.html")
            
            return detailed_course
            
        except Exception as e:
            self.logger.error(f"Error getting course details for {course.course_code}: {e}")
            return course
    
    def _get_course_details_with_term_selection(self, html: str, base_course: Course) -> Course:
        """Get course details for all available terms"""
        soup = BeautifulSoup(html, 'html.parser')
        
        # Extract basic course info first
        base_course.credits = self._extract_credits(soup)
        
        # Extract additional course details
        self._extract_additional_course_details(soup, base_course)
        
        # Extract Course Outcome details if requested
        if self.config.get_course_outcome:
            self._scrape_course_outcome(html, base_course)
        
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
                term_info = self._scrape_term_details(html, base_course, term_code, term_name)
                if term_info:
                    all_term_info.append(term_info)
                
                # Be polite to server between terms
                if i < len(available_terms) - 1:
                    time.sleep(1)
                    
            except Exception as e:
                self.logger.warning(f"Failed to scrape {term_name} for {base_course.course_code}: {e}")
                continue
        
        base_course.terms = all_term_info
        
        # Clean class attributes to remove course attribute duplicates
        for term in base_course.terms:
            for section in term.schedule:
                if 'class_attributes' in section and section['class_attributes']:
                    section['class_attributes'] = clean_class_attributes(
                        section['class_attributes'], 
                        base_course.course_attributes
                    )
        
        self.logger.info(f"Extracted details for {base_course.course_code}: "
                       f"Credits={base_course.credits}, "
                       f"Terms={len(all_term_info)}")
        return base_course
    
    def _scrape_term_details(self, html: str, base_course: Course, term_code: str, term_name: str) -> Optional[TermInfo]:
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
                response = self._robust_request('POST', self.base_url, data=form_data)
                html = response.text
                soup = BeautifulSoup(html, 'html.parser')
            
            # Check "Show sections" button - click only if enabled
            show_sections_btn = soup.find('input', {'id': 'uc_course_btn_class_section'})
            if show_sections_btn:
                # Check if button is disabled
                is_disabled = show_sections_btn.get('disabled') is not None
                
                if not is_disabled:
                    self.logger.info(f"Clicking 'Show sections' for {term_name}")
                    
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
                    response = self._robust_request('POST', self.base_url, data=form_data)
                    html = response.text
                    
                    # Save debug file for sections HTML (using smart saving)
                    filename = f"sections_{base_course.subject}_{base_course.course_code}_{term_name.replace(' ', '_').replace('-', '_')}.html"
                    self._save_debug_html(html, filename)
                else:
                    self.logger.info(f"'Show sections' button disabled for {term_name} - sections should already be visible")
                    
                    # Save debug file for current page (sections should be already visible)
                    filename = f"sections_{base_course.subject}_{base_course.course_code}_{term_name.replace(' ', '_').replace('-', '_')}.html"
                    self._save_debug_html(html, filename)
            
            # Parse the term-specific information
            return self._parse_term_info(html, term_code, term_name)
            
        except Exception as e:
            self.logger.error(f"Error scraping term {term_name}: {e}")
            return None
    
    def _extract_credits(self, soup: BeautifulSoup) -> str:
        """Extract credits/units from course details"""
        units_elem = soup.find('span', {'id': 'uc_course_lbl_units'})
        return clean_html_text(units_elem.get_text()) if units_elem else ""
    
    
    def _extract_additional_course_details(self, soup: BeautifulSoup, course: Course) -> None:
        """Extract additional course details from the course page"""
        # Course description
        desc_elem = soup.find('span', {'id': 'uc_course_lbl_crse_descrlong'})
        if desc_elem:
            course.description = clean_html_text(desc_elem.get_text())
        
        # Enrollment requirement
        enroll_elem = soup.find('td', {'id': 'uc_course_tc_enrl_requirement'})
        if enroll_elem:
            course.enrollment_requirement = clean_html_text(enroll_elem.get_text())
        
        # Course attributes (course-level attributes like "Virtual Teaching & Learning Course")
        course_attr_elem = soup.find('td', {'id': 'uc_course_tc_crse_attributes'})
        if course_attr_elem:
            course.course_attributes = clean_html_text(course_attr_elem.get_text())
        
        # Academic career (Undergraduate/Graduate)
        career_elem = soup.find('span', {'id': 'uc_course_lbl_acad_career'})
        if career_elem:
            course.academic_career = clean_html_text(career_elem.get_text())
        
        # Grading basis
        grading_elem = soup.find('span', {'id': 'uc_course_lbl_grading_basis'})
        if grading_elem:
            course.grading_basis = clean_html_text(grading_elem.get_text())
        
        # Component (Lecture, Tutorial, etc.)
        component_elem = soup.find('span', {'id': 'uc_course_lbl_component'})
        if component_elem:
            course.component = clean_html_text(component_elem.get_text())
        
        # Campus
        campus_elem = soup.find('span', {'id': 'uc_course_lbl_campus'})
        if campus_elem:
            course.campus = clean_html_text(campus_elem.get_text())
        
        # Academic group
        group_elem = soup.find('span', {'id': 'uc_course_lbl_acad_group'})
        if group_elem:
            course.academic_group = clean_html_text(group_elem.get_text())
        
        # Academic organization
        org_elem = soup.find('span', {'id': 'uc_course_lbl_acad_org'})
        if org_elem:
            course.academic_org = clean_html_text(org_elem.get_text())
    
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
                    section = clean_html_text(cells[0].get_text())
                    
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
                            status = parse_enrollment_status_from_image(img_src)
                    
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
                                days_times = clean_html_text(meet_cells[0].get_text())
                                room = clean_html_text(meet_cells[1].get_text())
                                instructor = clean_html_text(meet_cells[2].get_text())
                                dates = clean_html_text(meet_cells[3].get_text())
                                
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
                        section_name = clean_html_text(section_link.get_text())
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
                response = self._robust_request('POST', self.base_url, data=form_data)
                class_details_html = response.text
                
                # Save debug file for class details HTML (using smart saving)
                clean_section = section_name.replace('(', '').replace(')', '').replace(' ', '_').replace('-', '')
                if self.current_course_context:
                    subject = self.current_course_context['subject']
                    course_code = self.current_course_context['course_code']
                    filename = f"class_details_{subject}_{course_code}_{clean_section}.html"
                    self._save_debug_html(class_details_html, filename)
                
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
                        'time': clean_html_text(cells[0].get_text()),
                        'location': clean_html_text(cells[1].get_text()),
                        'instructor': clean_html_text(cells[2].get_text()),
                        'dates': clean_html_text(cells[3].get_text())
                    }
                    meetings.append(meeting)
        
        # Extract class attributes (language of instruction specific to this section)
        class_attributes = ""
        class_attr_elem = soup.find('td', {'id': 'uc_class_tc_class_attributes'})
        if class_attr_elem:
            class_attributes = clean_html_text(class_attr_elem.get_text())
        
        # Use the original section name from the schedule page
        return {
            'section': section_name,
            'meetings': meetings,
            'availability': availability,
            'class_attributes': class_attributes  # Section-specific language info
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
                availability['capacity'] = clean_html_text(capacity_elem.get_text())
            
            # Enrollment Total
            enrolled_elem = soup.find('span', {'id': 'uc_class_lbl_enrl_tot'})
            if enrolled_elem:
                availability['enrolled'] = clean_html_text(enrolled_elem.get_text())
            
            # Wait List Capacity
            wait_cap_elem = soup.find('span', {'id': 'uc_class_lbl_wait_cap'})
            if wait_cap_elem:
                availability['waitlist_capacity'] = clean_html_text(wait_cap_elem.get_text())
            
            # Wait List Total
            wait_tot_elem = soup.find('span', {'id': 'uc_class_lbl_wait_tot'})
            if wait_tot_elem:
                availability['waitlist_total'] = clean_html_text(wait_tot_elem.get_text())
            
            # Available Seats
            available_elem = soup.find('span', {'id': 'uc_class_lbl_available_seat'})
            if available_elem:
                availability['available_seats'] = clean_html_text(available_elem.get_text())
            
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
    
    def _parse_term_info(self, html: str, term_code: str, term_name: str) -> Optional[TermInfo]:
        """Parse term-specific information from HTML"""
        return self._create_term_info(html, term_code, term_name, self.config.get_enrollment_details)
    
    def _html_to_markdown(self, html_content: str) -> str:
        """Convert HTML content to clean Markdown format with Word HTML preprocessing"""
        if not html_content:
            return ""
        
        try:
            # Use the modular HTML utilities for conversion
            result, is_markdown = html_to_clean_markdown(html_content)
            
            if not is_markdown:
                self.logger.warning("markdownify not available, using plain text extraction")
            
            return result
            
        except Exception as e:
            self.logger.warning(f"Error in HTML processing: {e}, falling back to basic text extraction")
            return clean_html_text(html_content)
    
    def _scrape_course_outcome(self, current_html: str, course: Course) -> None:
        """Navigate to Course Outcome page and extract detailed course information"""
        try:
            soup = BeautifulSoup(current_html, 'html.parser')
            
            # Check if Course Outcome button exists
            outcome_btn = soup.find('input', {'id': 'btn_course_outcome'})
            if not outcome_btn:
                self.logger.info(f"No Course Outcome button found for {course.course_code}")
                return
            
            # Extract form data for Course Outcome navigation
            form_data = {}
            for input_elem in soup.find_all('input', {'type': 'hidden'}):
                name = input_elem.get('name')
                value = input_elem.get('value', '')
                if name:
                    form_data[name] = value
            
            # Set Course Outcome postback data
            form_data['btn_course_outcome'] = 'Course Outcome'
            
            # Submit Course Outcome request
            self.logger.info(f"Navigating to Course Outcome page for {course.course_code}")
            response = self._robust_request('POST', self.base_url, data=form_data)
            
            # Debug: save Course Outcome response (using smart saving)
            self._save_debug_html(response.text, f"course_outcome_{course.subject}_{course.course_code}.html")
            
            # Parse Course Outcome page
            self._parse_course_outcome_content(response.text, course)
            
        except Exception as e:
            self.logger.error(f"Error scraping Course Outcome for {course.course_code}: {e}")
    
    def _parse_course_outcome_content(self, html: str, course: Course) -> None:
        """Parse Course Outcome page content and extract all relevant information"""
        soup = BeautifulSoup(html, 'html.parser')
        
        # Extract Assessment Types (table structure)
        assessment_table = soup.find('table', {'id': 'uc_course_outcome_gv_ast'})
        if assessment_table and hasattr(assessment_table, 'find_all'):
            # Type guard: ensure it's a Tag before passing to _parse_assessment_table
            course.assessment_types = self._parse_assessment_table(assessment_table)
        
        # Extract Learning Outcomes (convert to Markdown for rich formatting)
        learning_outcome_span = soup.find('span', {'id': 'uc_course_outcome_lbl_learning_outcome'})
        if learning_outcome_span:
            course.learning_outcomes = self._html_to_markdown(str(learning_outcome_span))
        
        # Extract Course Syllabus (convert to Markdown for tables and lists)
        syllabus_span = soup.find('span', {'id': 'uc_course_outcome_lbl_course_syllabus'})
        if syllabus_span:
            course.course_syllabus = self._html_to_markdown(str(syllabus_span))
        
        # Extract Feedback for Evaluation (convert to Markdown)
        feedback_span = soup.find('span', {'id': 'uc_course_outcome_lbl_feedback'})
        if feedback_span:
            course.feedback_evaluation = self._html_to_markdown(str(feedback_span))
        
        # Extract Required Readings (convert to Markdown for lists)
        required_reading_span = soup.find('span', {'id': 'uc_course_outcome_lbl_req_reading'})
        if required_reading_span:
            course.required_readings = self._html_to_markdown(str(required_reading_span))
        
        # Extract Recommended Readings (convert to Markdown for lists)
        recommended_reading_span = soup.find('span', {'id': 'uc_course_outcome_lbl_rec_reading'})
        if recommended_reading_span:
            course.recommended_readings = self._html_to_markdown(str(recommended_reading_span))
        
        self.logger.info(f"Course Outcome parsed for {course.course_code}")
    
    def _parse_assessment_table(self, table: Optional[Tag]) -> Dict[str, str]:
        """Parse assessment types table and return as key-value pairs"""
        if not table:
            return {}
            
        assessment_types: Dict[str, str] = {}
        
        try:
            # Find all data rows (skip header row)
            rows = table.find_all('tr')
            for row in rows[1:]:  # Skip header row
                cells = row.find_all('td')
                if len(cells) >= 3:
                    # Extract assessment type and percentage
                    assessment_type = clean_html_text(cells[1].get_text())
                    percentage = clean_html_text(cells[2].get_text())
                    
                    if assessment_type and percentage:
                        assessment_types[assessment_type] = percentage
            
        except Exception as e:
            self.logger.warning(f"Error parsing assessment table: {e}")
        
        return assessment_types
    
    def scrape_all_subjects(self, subjects: List[str]) -> Dict[str, Any]:
        """Memory-safe scraping with immediate saves, progress tracking, and memory cleanup"""
        
        self.logger.info(f"🛡️  Starting scraping for {len(subjects)} subjects")
        self.logger.info(f"📁 Saving to: {self.config.output_directory}/")
        self.logger.info(f"💾 Mode: Memory-safe with immediate saves")
        
        # Ensure output directory exists
        os.makedirs(self.config.output_directory, exist_ok=True)
        
        # Always cache subject titles for metadata (essential for usability)
        self.logger.info("📋 Fetching subject titles from live website...")
        subjects_with_titles = self.get_subjects_with_titles_from_live_site()
        
        # Build cache for fast lookup during scraping
        self.subject_titles_cache = {}
        for subject_info in subjects_with_titles:
            self.subject_titles_cache[subject_info["code"]] = subject_info["title"]
        self.logger.info(f"✅ Cached {len(self.subject_titles_cache)} subject titles for metadata")
        
        # Initialize progress tracker if enabled
        if self.config.track_progress:
            self.progress_tracker = ScrapingProgressTracker(self.config.progress_file, self.logger)
            self.progress_tracker.progress_data["scraping_log"]["total_subjects"] = len(subjects)
            self.logger.info(f"📊 Progress tracking enabled: {self.config.progress_file}")
        
        completed_subjects = []
        failed_subjects = []
        saved_files = {}
        
        for i, subject in enumerate(subjects):
            self.logger.info(f"🔄 Processing {subject} ({i+1}/{len(subjects)})")
            
            # Track start time for duration calculation
            start_time = time.time()
            
            try:
                courses = self.scrape_subject(subject)
                
                # Always try to save, even if no courses (some subjects legitimately have no courses)
                saved_file = self._save_subject_immediately(subject, courses or [], self.config)
                
                if saved_file:
                    completed_subjects.append(subject)
                    saved_files[subject] = saved_file
                    
                    # Calculate duration and mark as completed in progress tracker
                    duration_minutes = (time.time() - start_time) / 60
                    if self.progress_tracker:
                        config_info = {
                            "get_details": self.config.get_details,
                            "get_enrollment_details": self.config.get_enrollment_details,
                            "max_courses": self.config.max_courses_per_subject
                        }
                        self.progress_tracker.complete_subject(subject, len(courses or []), saved_file, duration_minutes, config_info)
                    
                    # Use different message for empty vs populated subjects
                    if courses:
                        self.logger.info(f"✅ {subject} completed: {len(courses)} courses in {duration_minutes:.1f}min → {saved_file}")
                    else:
                        self.logger.info(f"✅ {subject} completed: no courses (empty subject) in {duration_minutes:.1f}min → {saved_file}")
                else:
                    failed_subjects.append(subject)
                    self.logger.error(f"❌ {subject} save failed")
                    if self.progress_tracker:
                        self.progress_tracker.fail_subject(subject, "Save failed")
                
                # CRITICAL: Clean memory before next subject (prevent crashes)
                self.logger.debug(f"🧹 Cleaning memory after {subject}")
                del courses  # Explicit cleanup
                gc.collect()  # Force garbage collection
                
            except Exception as e:
                failed_subjects.append(subject)
                self.logger.error(f"❌ {subject} failed with exception: {e}")
                
                # Mark subject as failed in progress tracker
                if self.progress_tracker:
                    self.progress_tracker.fail_subject(subject, str(e))
                
                # Clean up even on failure
                gc.collect()
            
            # Be polite to the server
            if i < len(subjects) - 1:
                time.sleep(self.config.request_delay)
        
        # Print progress summary if tracking enabled
        if self.progress_tracker:
            self.progress_tracker.print_summary()
        
        # Index file generation removed - frontend loads individual JSON files directly
        # Final summary
        self.logger.info(f"🎉 SCRAPING COMPLETED!")
        self.logger.info(f"✅ Completed: {len(completed_subjects)} subjects")
        self.logger.info(f"❌ Failed: {len(failed_subjects)} subjects")
        if failed_subjects:
            self.logger.info(f"🔄 Failed subjects: {', '.join(failed_subjects)}")
        
        return {
            'completed': completed_subjects,
            'failed': failed_subjects,
            'saved_files': saved_files
        }
    
    def _save_subject_immediately(self, subject: str, courses: List[Course], config: ScrapingConfig) -> Optional[str]:
        """Save single subject immediately to prevent data loss"""
        try:
            # Get subject title from cache (fetched at start of production scraping)
            subject_title = self.subject_titles_cache.get(subject, subject)  # Fallback to code if title not found
            
            # Remove subject code prefix from title for cleaner display (e.g., "UGEC - Society and Culture" → "Society and Culture")
            if " - " in subject_title:
                subject_title = subject_title.split(" - ", 1)[1]
            
            # Create subject data structure with timestamp in metadata (not filename)
            scraped_at = utc_now_iso()
            metadata = {
                "scraped_at": scraped_at,
                "subject": subject,
                "subject_title": subject_title,  # Add subject title to metadata
                "total_courses": len(courses),
                "scraper_version": "memory-safe-v2.0"
            }
            
            subject_data = {
                "metadata": metadata,
                "courses": [course.to_dict() for course in courses]
            }
            
            # Save to simple filename (no timestamp suffix for better git diffs)
            filename = f"{config.output_directory}/{subject}.json"
            
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(subject_data, f, ensure_ascii=False, indent=2)
            
            self.logger.info(f"💾 SAVED {subject} → {filename}")
            return filename
            
        except Exception as e:
            self.logger.error(f"💥 SAVE FAILED for {subject}: {e}")
            return None
    
    def _export_per_subject(self, data: Dict[str, List[Course]], config: ScrapingConfig) -> str:
        """Export each subject to its own JSON file"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        exported_files = []
        
        for subject, courses in data.items():
            # Create per-subject JSON structure
            subject_data = {
                "metadata": {
                    "scraped_at": utc_now_iso(),
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
        # Configure scraper for detailed testing
        scraper.config.get_details = True
        scraper.config.get_enrollment_details = True
        scraper.config.get_course_outcome = True
        results = scraper.scrape_all_subjects(test_subjects)
        
        # Show summary
        completed_count = len(results['completed'])
        failed_count = len(results['failed']) 
        total_files = len(results['saved_files'])
        print(f"Scraping completed: {completed_count} subjects successful, {failed_count} failed")
        print(f"Files saved: {total_files}")
        if results['saved_files']:
            print(f"Saved files: {list(results['saved_files'].values())}")
        
        print("\n=== PRODUCTION MODE EXAMPLES ===")
        print("For complete production workflow (recommended):")
        print("  summary = scraper.scrape_and_export_production(subjects)")
        print("  # Creates per-subject files in /data/ directory")
        print()
        print("For production scraping only:")
        print("  results = scraper.scrape_for_production(subjects)")
        print("  # Returns summary dict with completed/failed subjects")
        print()
        print("To resume previous scraping:")
        print("  resume_summary = scraper.resume_production_scraping()")
        print("  # Continues from where previous scraping left off")
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