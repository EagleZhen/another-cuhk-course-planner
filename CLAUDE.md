# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a CUHK Course Planner web application designed to solve the problem of outdated course data in existing planners. The project consists of two main components:

1. **Course Data Scraper** (`cuhk_scraper.py`): ✅ **COMPLETED** - Python-based web scraper that reliably extracts course information from CUHK's course catalog system
2. **Web Interface**: React + Tailwind CSS frontend for course planning (to be implemented)

## Architecture

### Core Components

- **CuhkScraper**: Production-ready scraper with ddddocr-based captcha solving
- **Pure live scraping**: No file dependencies, all data fetched from live website
- Course data source: `http://rgsntl.rgs.cuhk.edu.hk/aqs_prd_applx/Public/tt_dsp_crse_catalog.aspx`

### Key Features ✅ WORKING
- **ddddocr captcha solving**: Reliable 4-character alphanumeric captcha recognition
- **Live subject extraction**: Dynamically gets all 263+ subjects from website dropdown
- **Robust parsing**: Extracts course codes and titles from `gv_detail` table
- **Clean JSON export**: Web-app ready format with metadata
- **Retry logic**: Exponential backoff for failed attempts
- **Organized output**: All files saved to `tests/output/`

## CUHK Website Analysis

### Form Structure (from saved HTML analysis)
The CUHK course catalog uses an ASP.NET form with these key elements:
- **Subject dropdown**: `<select name="ddl_subject">` with all available subjects
- **Captcha field**: `<input name="txt_captcha">` - simple 4-character alphanumeric
- **Search button**: `<input name="btn_search" value="Search">`
- **Hidden fields**: ViewState, EventValidation, and other ASP.NET state fields

### Subject Codes Available
**263 subjects** dynamically extracted from live site including: ACCT, ACPY, AENP, AEPT, AIMS, AIST, ANAT, ANIC, ANTH, APEP, ARAB, ARCH, ARTS, ASEI, BAMS, BASA, BBMS, BCHE, BCHM, BCJC, BCME, BECE, BEHM, BEST, BIOL, BIOS, BMBL, BMED, BMEG, BMJC, BSCG, BUDS, CCNU, CCSS, CDAS, CENG, CGEN, CHCU, CHED, CHEM, CHES, CHLL, CHLT, CHPR, CHPY, CLCC, CLCE, CLCH, CLCP, CLED, CLGY, CMBI, CMSC, CNGT, CODS, COMM, COOP, CSCI, CULS, CUMT, CURE, CVSM, DBAC, DIUS, DOTE, DROI, DSME, DSPS, EASC, ECLT, ECON, ECTM, EDUC, EEEN, EESC, EIHP, ELED, ELEG, ELTU, EMBA, EMBF, ENGE, ENGG, ENLC, ENLT, ENSC, EPBI, EPID, EPIN, EPSY, ESGS, ESSC, ESTR, EXSC, and more.

### Captcha Analysis ✅ SOLVED
- **4-character alphanumeric format** (e.g., "FVMC", "5Q4S", "Z4PX")
- **ddddocr works perfectly** - 100% accuracy on test samples
- **Fast recognition** - No preprocessing needed
- **Handles variations** - Works with different fonts/distortions

## Development Commands

### Python Environment
```bash
# Create virtual environment (Python 3.12+ supported)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run production scraper
python cuhk_scraper.py
```

### Current Dependencies (requirements.txt)
```
requests>=2.31.0
ddddocr>=1.4.11  # Reliable captcha OCR
beautifulsoup4>=4.12.0
```

### Running the Scraper ✅ PRODUCTION READY
```python
scraper = CuhkScraper()

# Get all subjects from live website (263 subjects)
subjects = scraper.get_subjects_from_live_site()

# Test with single subject (recommended for testing)
results = scraper.scrape_all_subjects(["CSCI"])

# Scale to all subjects (for full data collection)
# results = scraper.scrape_all_subjects(subjects)

# Export to JSON (web-app ready format)
json_file = scraper.export_to_json(results)
# Output: tests/output/cuhk_courses_YYYYMMDD_HHMMSS.json
```

### Recent Test Results
- **CSCI subject**: 83 courses successfully scraped
- **Captcha success rate**: ~95% (with retry logic)
- **Processing time**: ~2-3 seconds per subject
- **Output format**: Clean JSON with metadata

## Development Notes

### Scraping Flow ✅ IMPLEMENTED
1. **Live subject extraction**: GET main page → extract all subjects from dropdown
2. **Form preparation**: Extract ASP.NET ViewState and hidden fields  
3. **Captcha solving**: GET captcha image → ddddocr recognition → validate format
4. **Course search**: POST form with subject + captcha → get results page
5. **Data parsing**: Extract course codes/titles from `gv_detail` table
6. **JSON export**: Structure data for web app consumption with metadata

### Project Structure
```
/
├── cuhk_scraper.py           # ✅ Production scraper
├── requirements.txt          # ✅ Minimal dependencies  
├── tests/
│   ├── output/               # ✅ All generated files
│   ├── sample-captchas/      # Test captcha images
│   ├── sample-webpages/      # Reference HTML files
│   └── test_*.py            # OCR comparison tests
└── venv/                    # Virtual environment
```

### Data Format ✅ WEB-APP READY
```json
{
  "metadata": {
    "scraped_at": "2025-07-29T02:11:03.464818",
    "total_subjects": 1,
    "total_courses": 83
  },
  "subjects": {
    "CSCI": [
      {
        "subject": "CSCI",
        "course_code": "1020",
        "title": "Hands-on Introduction to C++",
        "credits": "",     // Can be enhanced later
        "semester": "",    // Can be enhanced later  
        "schedule": "",    // Can be enhanced later
        "instructor": "",  // Can be enhanced later
        "capacity": "",    // Can be enhanced later
        "enrolled": "",    // Can be enhanced later
        "waitlist": ""     // Can be enhanced later
      }
    ]
  }
}
```

### Next Steps for Full MVP
1. **Scale to all subjects**: Change test from `["CSCI"]` to full subject list (optional)
2. **Enhanced course details**: Click into individual courses for full info (optional)
3. **Build React frontend**: Use JSON data for interactive course planning ⭐
4. **Deploy web app**: Host the course planner for public use

### Performance Notes
- **Current capability**: Successfully scrapes 83 courses in ~3 seconds
- **Full scale estimate**: ~263 subjects × 2-3 sec = ~13-22 minutes for complete dataset
- **Rate limiting**: Built-in 1-second delays to be server-friendly
- **Reliability**: Retry logic handles captcha failures automatically