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
    
    def to_dict(self) -> Dict:
        return asdict(self)

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
    
    def scrape_subject(self, subject_code: str, max_retries: int = 3) -> List[Course]:
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
    
    def _parse_course_results(self, html: str) -> List[Course]:
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
                        
                        # Create course with basic info (we'll get details later if needed)
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
                        
                        courses.append(course)
                        
            except Exception as e:
                self.logger.warning(f"Error parsing course row: {e}")
                continue
        
        self.logger.info(f"Parsed {len(courses)} courses from results table")
        return courses
    
    def _clean_text(self, text: str) -> str:
        """Clean and normalize text content"""
        if not text:
            return ""
        return text.strip().replace('\n', ' ').replace('\r', '').replace('\t', ' ')
    
    def scrape_all_subjects(self, subjects: List[str]) -> Dict[str, List[Course]]:
        """Scrape all subjects"""
        results = {}
        
        for i, subject in enumerate(subjects):
            self.logger.info(f"Processing {subject} ({i+1}/{len(subjects)})")
            
            courses = self.scrape_subject(subject)
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
    
    # Test with just CSCI first
    test_subjects = ["CSCI"] if "CSCI" in subjects else [subjects[0]]
    print(f"Testing with subjects: {test_subjects}")
    
    try:
        results = scraper.scrape_all_subjects(test_subjects)
        
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