# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a CUHK Course Planner web application designed to solve the problem of outdated course data in existing planners. The project consists of two main components:

1. **Course Data Scraper** (`CourseScraper.py`): Python-based web scraper that extracts course information from CUHK's course catalog system, featuring enhanced captcha solving capabilities
2. **Web Interface**: React + Tailwind CSS frontend for course planning (to be implemented)

## Architecture

### Core Components

- **EnhancedCaptchaSolver**: Multi-engine OCR system using ddddocr, easyocr, and pytesseract with image preprocessing
- **RobustCourseScraper**: Async scraper with retry logic, exponential backoff, and batch processing
- Course data source: `http://rgsntl.rgs.cuhk.edu.hk/aqs_prd_applx/Public/tt_dsp_crse_catalog.aspx`

### Key Features
- Multiple OCR engines for captcha solving with confidence scoring
- Image preprocessing (contrast enhancement, denoising, thresholding)
- Async/await pattern for concurrent scraping
- Exponential backoff retry mechanism
- Batch processing to avoid server overload

## CUHK Website Analysis

### Form Structure (from saved HTML analysis)
The CUHK course catalog uses an ASP.NET form with these key elements:
- **Subject dropdown**: `<select name="ddl_subject">` with all available subjects
- **Captcha field**: `<input name="txt_captcha">` - simple 4-character alphanumeric
- **Search button**: `<input name="btn_search" value="Search">`
- **Hidden fields**: ViewState, EventValidation, and other ASP.NET state fields

### Subject Codes Available
100+ subjects including: ACCT, ACPY, AIMS, AIST, ANTH, ARCH, BIOL, BMEG, CENG, CHEM, CHIN, CSCI, ECON, ELEG, ENGG, ENGL, FINA, HIST, IERG, INFO, JAPN, JOUR, MATH, MGMT, MKTG, MUSC, PHED, PHIL, PHYS, POLI, PSYC, SOCI, STAT, etc.

### Captcha Insights
- Simple 4-character alphanumeric format (e.g., "Y3G3")
- Old-style image captcha, not complex modern challenges
- EasyOCR or even simple OCR should work well
- **Key insight**: Saved HTML pages contain pre-filled captcha values for testing

## Development Commands

### Python Environment
```bash
# Create virtual environment (Python 3.11 recommended for compatibility)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run simplified scraper
python cuhk_scraper.py
```

### Current Dependencies (requirements.txt)
```
requests>=2.31.0
easyocr>=1.7.0  # Simple, reliable OCR
beautifulsoup4>=4.12.0
```

### Running the Scraper
```python
scraper = CuhkScraper()
# Extract subjects from saved HTML for reference
subjects = scraper.get_subjects_from_html("sample-webpages/Browse Course Catalog.html")
# Scrape specific subjects
results = scraper.scrape_all_subjects(subjects[:5])  # Test with first 5
# Export data
scraper.export_to_json(results)
scraper.export_to_csv(results)
```

## Development Notes

### Scraping Strategy
1. **Form submission approach**: Extract hidden fields, set subject, submit form
2. **No complex captcha solving needed**: Use saved HTML captcha values for testing
3. **Rate limiting**: 1-second delay between requests to be server-friendly
4. **Data export**: Both JSON (structured) and CSV (flat) formats supported

### File Structure
- `cuhk_scraper.py`: Main simplified scraper (recommended)
- `simple_scraper.py`: Alternative implementation with EasyOCR
- `CourseScraper.py`: Original complex version (deprecated)
- `sample-webpages/`: Saved HTML files for testing and form analysis
- `requirements.txt`: Minimal dependencies

### Next Steps for MVP
1. Complete course result parsing (inspect actual results HTML)
2. Add proper error handling and logging
3. Create simple web API (Flask/FastAPI)
4. Build React frontend for course planning