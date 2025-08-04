# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a CUHK Course Planner web application designed to solve the problem of outdated course data in existing planners. The project consists of two main components:

1. **Advanced Course Data Scraper** (`cuhk_scraper.py`): ⚠️ **NEEDS UPDATING** - Comprehensive Python-based web scraper with multi-term support. Currently experiencing issues due to CUHK website changes.
2. **Web Interface**: React + Tailwind CSS frontend for course planning (to be implemented)

## Architecture

### Core Components

- **CuhkScraper**: Production-ready scraper with advanced ASP.NET postback simulation
- **Multi-term support**: Scrapes ALL available academic terms (2024-25, 2025-26, etc.)
- **Detailed course extraction**: Complete schedule, instructor, and section information
- **Pure live scraping**: No file dependencies, all data fetched from live website
- Course data source: `http://rgsntl.rgs.cuhk.edu.hk/aqs_prd_applx/Public/tt_dsp_crse_catalog.aspx`

### Advanced Features ⚠️ PARTIALLY WORKING
- **🔐 ddddocr captcha solving**: Reliable 4-character alphanumeric captcha recognition (~95% success rate)
- **🌐 Live subject extraction**: Dynamically gets all 263+ subjects from website dropdown
- **🎯 ASP.NET postback simulation**: Handles JavaScript `__doPostBack` for detailed course pages
- **📅 Multi-term scraping**: Automatically discovers and scrapes all available terms per course
- **❌ Hierarchical schedule parsing**: BROKEN - Website HTML structure changed, schedule extraction not working
- **✅ Comprehensive course details**: Description, enrollment requirements, academic career, grading basis, components
- **✅ Academic metadata**: Campus, academic group/organization information
- **❌ Raw date preservation**: BROKEN - No schedule data being extracted
- **❌ Section status tracking**: BROKEN - Cannot access section information
- **❌ Hybrid enrollment details**: BROKEN - Section parsing required for enrollment data
- **❌ Section-level postbacks**: BROKEN - Cannot find section links in current HTML structure
- **📊 Structured JSON export**: Web-app ready nested format with comprehensive metadata
- **🔄 Intelligent retry logic**: Exponential backoff for failed attempts
- **📁 Organized output**: All files saved to `tests/output/` with descriptive names
- **⚡ Rate limiting**: Server-friendly delays between requests
- **🧹 Refactored architecture**: Maintainable code with shared parsing logic

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

### Running the Advanced Scraper ⚠️ SCHEDULE PARSING BROKEN
```python
scraper = CuhkScraper()

# Get all subjects from live website (263 subjects)
subjects = scraper.get_subjects_from_live_site()

# Test with single subject and get detailed multi-term data (recommended for testing)
results = scraper.scrape_all_subjects(["CSCI"], get_details=True)

# HYBRID APPROACH: Get detailed enrollment data (capacity, enrolled, available seats)
results = scraper.scrape_all_subjects(["CSCI"], get_details=True, get_enrollment_details=True)

# Basic scraping without detailed course info (faster, status icons only)
results = scraper.scrape_all_subjects(["CSCI"], get_details=False, get_enrollment_details=False)

# Scale to all subjects with full details (for complete data collection)
# results = scraper.scrape_all_subjects(subjects, get_details=True, get_enrollment_details=True)

# Export to structured JSON (web-app ready format)
json_file = scraper.export_to_json(results)
# Output: tests/output/cuhk_courses_YYYYMMDD_HHMMSS.json
```

### Current Status ⚠️ PARTIALLY BROKEN
- **Basic course info**: ✅ Working - Course codes, titles, descriptions extracted correctly
- **CSCI subject**: 83 courses found but **schedules are empty**
- **Schedule extraction**: ❌ BROKEN - HTML structure changed, cannot find `gv_detail` table
- **Captcha success rate**: ✅ ~95% (with intelligent retry logic)
- **Course details**: ✅ Working - Academic info, requirements, credits extracted
- **JSON structure**: ✅ Clean structure implemented (no redundant fields)
- **Progress tracking**: ✅ Implemented with periodic saves and crash recovery

### Known Issues 🚨 CRITICAL
- **HTML Structure Changed**: CUHK website updated, `gv_detail` table not found
- **No Schedule Data**: All courses return empty schedules due to parsing failure
- **Section Parsing Broken**: Cannot access "Show sections" functionality
- **Debug Analysis Needed**: Current HTML structure requires investigation

### Recent Improvements ✅ COMPLETED
- **🧹 Clean JSON Structure**: Removed redundant term-level fields (instructor, capacity, enrolled, waitlist)
- **📈 Progress Tracking**: Added ScrapingProgressTracker with 1-minute periodic saves
- **🔄 Crash Recovery**: Resume functionality for long scraping sessions
- **📊 Per-subject exports**: Fault-tolerant file structure
- **🛠️ Enhanced debugging**: Better error handling and HTML structure analysis

## Development Notes

### Advanced Scraping Flow ⚠️ PARTIALLY WORKING
1. **Live subject extraction**: ✅ GET main page → extract all 263+ subjects from dropdown
2. **Form preparation**: ✅ Extract ASP.NET ViewState and hidden fields  
3. **Captcha solving**: ✅ GET captcha image → ddddocr recognition → validate format
4. **Course search**: ❌ POST form with subject + captcha → **`gv_detail` table not found**
5. **Basic parsing**: ❌ Extract course codes/titles from `gv_detail` table → **TABLE MISSING**
6. **Detail extraction**: ⚠️ For courses found:
   - ✅ Simulate `__doPostBack` to get detailed course page
   - ✅ Extract course metadata (title, description, requirements)
   - ❌ Discover terms from dropdown → **"Show sections" buttons disabled**
   - ❌ Parse schedule data → **No schedule tables found**
7. **JSON export**: ✅ Structure data with clean format (courses with empty schedules)

### Project Structure
```
/
├── cuhk_scraper.py           # ✅ Advanced production scraper
├── requirements.txt          # ✅ Minimal dependencies  
├── tests/
│   ├── output/               # ✅ All generated files
│   │   ├── cuhk_courses_*.json         # Final structured data (schedules empty)
│   │   ├── response_*.html            # Debug: main search results  
│   │   ├── course_details_*.html      # Debug: course detail pages
│   │   └── sections_*_*.html          # Debug: term-specific sections (none generated)
│   ├── sample-captchas/      # Test captcha images
│   ├── sample-webpages/      # Reference HTML files (working structure)
│   ├── data/                 # Historical working data (July 2025)
│   ├── test_*.py            # Testing scripts
│   ├── test_live_scraping.py # Live scraping verification script
│   └── analyze_html_structure.py # HTML structure analysis tool
└── venv/                    # Virtual environment
```

### Current JSON Output Format ⚠️ SCHEDULES EMPTY
```json
{
  "metadata": {
    "scraped_at": "2025-07-29T09:51:22.023247",
    "total_subjects": 1,
    "total_courses": 83
  },
  "subjects": {
    "CSCI": [
      {
        "subject": "CSCI",
        "course_code": "1020",
        "title": "Hands-on Introduction to C++",
        "credits": "1.00",
        "terms": [
          {
            "term_code": "2350",
            "term_name": "2024-25 Term 2",
            "schedule": [
              {
                "section": "--LEC (8192)",
                "meetings": [
                  {
                    "time": "Th 1:30PM - 2:15PM",
                    "location": "Mong Man Wai Bldg 707",
                    "instructor": "Dr. CHEONG Chi Hong",
                    "dates": "9/1, 16/1, 23/1"
                  },
                  {
                    "time": "Th 1:30PM - 2:15PM",
                    "location": "Mong Man Wai Bldg 707",
                    "instructor": "Dr. CHEONG Chi Hong",
                    "dates": "6/2, 13/2, 20/2, 27/2"
                  },
                  {
                    "time": "Th 1:30PM - 2:15PM",
                    "location": "Mong Man Wai Bldg 707",
                    "instructor": "Dr. CHEONG Chi Hong",
                    "dates": "13/3, 20/3, 27/3, 3/4, 10/4, 17/4"
                  }
                ],
                "availability": {
                  "capacity": "50",
                  "enrolled": "36",
                  "waitlist_capacity": "999",
                  "waitlist_total": "0",
                  "available_seats": "14",
                  "status": "Open"
                }
              },
              {
                "section": "-L01-LAB (5726)",
                "meetings": [
                  {
                    "time": "Th 3:30PM - 5:15PM",
                    "location": "Ho Sin-Hang Engg Bldg Rm123",
                    "instructor": "Dr. CHEONG Chi Hong",
                    "dates": "9/1, 16/1, 23/1"
                  },
                  {
                    "time": "Th 3:30PM - 5:15PM",
                    "location": "Ho Sin-Hang Engg Bldg Rm123",
                    "instructor": "Dr. CHEONG Chi Hong",
                    "dates": "6/2, 13/2, 20/2, 27/2"
                  },
                  {
                    "time": "Th 3:30PM - 5:15PM",
                    "location": "Ho Sin-Hang Engg Bldg Rm123",
                    "instructor": "Dr. CHEONG Chi Hong",
                    "dates": "13/3, 20/3, 27/3, 3/4, 10/4, 17/4"
                  }
                ],
                "availability": {
                  "capacity": "50",
                  "enrolled": "36",
                  "waitlist_capacity": "999",
                  "waitlist_total": "0",
                  "available_seats": "14",
                  "status": "Open"
                }
              }
            ],
            "instructor": ["Dr. CHEONG Chi Hong"],
            "capacity": "",
            "enrolled": "",
            "waitlist": ""
          }
        ],
        "description": "This course aims to provide an intensive hands-on introduction to the C++ programming language. Topics include the basic C++ language syntax, variable declaration, basic operators, program flow and control, defining and using functions, file and operating system interface. Specific key features of the C++ programming language such as object-oriented methodology, class templates, encapsulation, inheritance, polymorphism, etc. will be highlighted.",
        "enrollment_requirement": "Not for students who have taken CSCI1120 or 1520 or 1540 or ESTR1100.",
        "academic_career": "Undergraduate",
        "grading_basis": "Graded",
        "component": "Laboratory Lecture",
        "campus": "Main Campus",
        "academic_group": "Dept of Computer Sci & Engg",
        "academic_org": "Dept of Computer Sci & Engg"
      }
    ]
  }
}
```

## 🚨 URGENT: Fix Schedule Parsing 

### Current Critical Issues
1. **HTML Structure Changed**: CUHK website updated HTML structure, breaking core parsing functionality
2. **Missing `gv_detail` Table**: Course listing table not found in current HTML
3. **No Schedule Extraction**: All courses return empty schedules 
4. **Disabled Show Sections**: Buttons are disabled, preventing access to schedule data

### Required Fixes ⭐ HIGHEST PRIORITY
1. **🔍 HTML Structure Analysis**: Use `analyze_html_structure.py` to investigate current website structure
2. **🛠️ Update Table Selectors**: Find new table IDs/classes for course listings and schedules  
3. **🔧 Fix Parsing Logic**: Update BeautifulSoup selectors to match new HTML elements
4. **✅ Test Schedule Extraction**: Verify sections and meetings are parsed correctly
5. **📋 Update Sample Files**: Save new working HTML samples for future reference

### Investigation Tools Created
- **`test_live_scraping.py`**: Live scraping verification script
- **`analyze_html_structure.py`**: HTML structure analysis tool
- **Debug files in `tests/output/`**: Recent HTML captures for analysis

### Next Steps for Complete System (After Fixing)
1. **🚨 Fix schedule parsing**: Critical blocking issue ⭐ **HIGHEST PRIORITY** 
2. **🚀 Build React frontend**: Use structured JSON data for interactive course planning
3. **📊 Full-scale data collection**: Scale to all 263 subjects with detailed multi-term data
4. **⚡ Performance optimization**: Add concurrent scraping for faster large-scale collection  
5. **🔄 Automated updates**: Schedule regular data refresh for course planning app
6. **🌐 Deploy web application**: Host the complete course planner for public use

### Current Architecture Benefits (Still Valid)
- **✅ Clean JSON structure**: Single source of truth, no redundant fields 
- **✅ Progress tracking**: Crash recovery with periodic saves
- **✅ Fault tolerance**: Per-subject exports prevent total data loss
- **📱 Frontend ready**: Hierarchical JSON structure perfect for React components
- **🔮 Future proof**: Multi-term support handles academic year transitions seamlessly
- **🛠️ Maintainable**: Clean architecture with proper error handling
- **📈 Scalable**: Can easily extend once parsing is fixed

### Recent Improvements ✅ COMPLETED
- **🗓️ Complete date extraction**: Fixed missing first date rows (e.g., "9/1, 16/1, 23/1") by properly parsing both normal and alternating HTML row styles
- **🏗️ Hierarchical data structure**: Sections now contain nested meetings reflecting the website's merged cell structure
- **🧹 Code refactoring**: Eliminated ~50% code duplication by extracting shared parsing logic into reusable methods
- **🛡️ Robust validation**: Added section identifier validation to prevent parsing artifacts from corrupting data
- **📦 Raw data preservation**: Each HTML table row becomes one JSON meeting entry with complete fidelity
- **📈 Hybrid enrollment approach**: Added optional detailed enrollment data via section-level postbacks (only 1.3x slower)
- **🔧 Section naming fix**: Corrected section names to use full format from original schedule page (e.g., "--LEC (8192)")

### Technical Architecture ✅ REFACTORED & ENHANCED
- **`_parse_schedule_from_html()`**: Shared parsing logic for both single and multi-term courses
- **`_create_term_info()`**: Unified term creation with optional metadata (term_code, term_name)
- **`_parse_term_info()`**: Simple wrapper for multi-term courses  
- **`_parse_current_term_info()`**: Simple wrapper for single-term courses
- **`_parse_schedule_with_enrollment_details()`**: Hybrid approach with section-level postbacks
- **`_get_section_enrollment_details()`**: Individual section postback handler
- **`_parse_class_details()`**: Class details page parser with enrollment data
- **`_parse_class_availability()`**: Enrollment metrics extraction (capacity, enrolled, available, waitlist)
- **Zero code duplication**: All HTML parsing consolidated into maintainable methods

### Performance Analysis
- **Current capability**: Successfully scrapes 83 courses with full multi-term details and complete date ranges
- **Processing efficiency**: 
  - Standard approach: ~3-5 seconds per course with complete term data
  - **Hybrid approach**: ~4-7 seconds per course with enrollment details (only 1.3x slower)
- **Full scale estimates**: 
  - Standard: ~263 subjects × 5 sec = ~22 minutes for comprehensive dataset
  - **Hybrid**: ~263 subjects × 6.5 sec = ~29 minutes for complete enrollment data
- **Server consideration**: Built-in rate limiting (1-2 second delays) ensures stability
- **Reliability**: Exponential backoff retry logic handles captcha/network failures automatically
- **Debug support**: Comprehensive HTML file saves enable quick troubleshooting
- **Data quality**: Hybrid approach provides precise enrollment metrics vs status icons