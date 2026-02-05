# CUHK Course Scraper

Comprehensive documentation for the production-ready course data scraper.

## Overview

The scraper extracts course data from CUHK's course catalog system using OCR for captcha solving, robust error handling, and progress tracking. It generates per-subject JSON files (~50MB total, 259 files) with complete course information including schedules, enrollment data, and learning outcomes.

## Architecture

### Core Components

```python
# Configuration
ScrapingConfig.for_production()  # Unlimited courses, full details, enrollment data

# Progress Tracking
ScrapingProgressTracker(progress_file, logger)  # Resume capability, per-subject tracking

# Main Scraper
CuhkScraper(config)  # Orchestrates scraping with retry mechanisms
```

### Class Hierarchy

```
CuhkScraper
├── _robust_request()              # Network layer with infinite retry
├── scrape_subject()               # Subject-level orchestration
├── get_course_details()           # Navigate to detail page
├── _extract_course_details()      # Parse all detail page fields
│   └── _extract_course_header_info()  # Helper: parse header
├── _scrape_course_outcome()       # Navigate to outcome page
└── _validate_course_outcome_response()  # 3-check validation
```

---

## Data Flow

### 1. Page Navigation Flow

```
List Page → Detail Page → Outcome Page → Term Pages
   ↓            ↓              ↓              ↓
Parse      Extract ALL    Extract         Extract
course     details:       outcomes:       schedules:
links      - Code/title   - Learning      - Sections
           - Credits      - Syllabus      - Times
           - Description  - Assessments   - Enrollment
           - Requirements - Readings      - Instructors
```

### 2. Data Extraction Pattern

**Key Principle**: Detail page is the **authoritative source** for course identity.

```python
# List page: Tentative data (may have artifacts)
course_code = "(1370)"  # Brackets for future courses
title = "Archery\n** available as of 2026-07-01"  # With remarks

# Detail page: Authoritative data (clean)
_extract_course_details(soup, course):
    header_info = _extract_course_header_info(soup)  # Parses "PHED 1370 - Archery"
    course.course_code = "1370"  # ✅ Clean code
    course.title = "Archery"      # ✅ Clean title
    # ... extract 10+ other fields ...
```

**Why this matters**:
- List page format varies (brackets, remarks, future course indicators)
- Detail page format is consistent (subject code - title)
- Validation can trust the detail page identity

---

## Retry Mechanisms

### Network Layer: Infinite Retry

Located in `_robust_request()` - retries indefinitely for network issues:

```python
def _robust_request(method, url, **kwargs):
    while True:  # Infinite retry
        try:
            response = self.session.get/post(url, **kwargs)
            _ = response.content  # Pre-load to catch connection drops
            return response
        except (ConnectionError, Timeout, ConnectionResetError):
            wait_time = min(60, 1.0 * (2 ** (attempt - 1)))  # Exponential backoff
            time.sleep(wait_time)
            continue  # Retry infinitely
        except HTTPError as e:
            if e.response.status_code in [502, 503, 504]:
                # Server errors - retry
                continue
            else:
                raise  # Client errors (4xx) - don't retry
```

**Error Types**:
- `ConnectionError`, `Timeout` → Network issues (retry)
- `ConnectionResetError` → Mid-transfer drops (retry)
- HTTP 502/503/504 → Server overload (retry)
- HTTP 4xx → Client errors (fail immediately)

### Validation Layer: Infinite Retry (Current Behavior)

⚠️ **Known Issue**: Validation failures currently retry infinitely.

Located in `get_course_details()`:

```python
while True:  # ⚠️ Infinite loop
    try:
        detailed_course = _get_course_details_with_term_selection(response.text, course)
        return detailed_course
    except ValueError as e:
        # Validation error - currently retries infinitely
        attempt += 1
        wait_time = min(60, 1.0 * (2 ** (attempt - 1)))
        time.sleep(wait_time)
        # ⚠️ No exit condition - can loop forever
```

**Problem**: Can't distinguish between:
- **Transient corruption** (network glitch) → Should retry ✅
- **Permanent format issues** (data mismatch) → Should fail fast ❌

**Future Enhancement**: Add retry limits for validation failures (see GitHub issue).

---

## Validation Strategy

### Course Outcome Page Validation (3 Checks)

Located in `_validate_course_outcome_response()`:

```python
def _validate_course_outcome_response(html, course):
    # Check 1: Not a system error page
    if "<title>System error</title>" in html:
        return False  # CUHK database error - don't retry

    # Check 2: Correct page type (has "Course Outcome" title)
    if not soup.find("div", class_="titleNormal", string="Course Outcome"):
        return False  # Wrong page or corrupted

    # Check 3: Has content sections
    section_headers = soup.find_all("td", class_="reverseHeaderStyle")
    if len(section_headers) < 1:
        return False  # Empty outcome page

    return True  # Valid outcome page ✅
```

**What We Validate**:
- ✅ Page structure (not error page, correct type, has sections)

**What We DON'T Validate** (intentional):
- ❌ Course code/title match (detail page is authoritative source)
- ❌ Exact content format (handles incomplete future courses)

**Section Headers** (`reverseHeaderStyle`):
- Learning Outcome
- Course Syllabus
- Assessment Type
- Feedback for Evaluation
- Required Readings
- Recommended Readings

---

## Edge Cases & Solutions

### 1. Future-Dated Courses

**Problem**: Courses marked "** available as of [date]" have special formatting.

**Example**: PHED1370 (Archery)

**List Page**:
```html
<a>( 1370)</a>  <!-- ⚠️ Brackets -->
<a>Archery
** available as of 2026-07-01</a>  <!-- ⚠️ Remark -->
```

**Detail Page**:
```html
<span id="uc_course_lbl_course">PHED 1370 - Archery</span>  <!-- ✅ Clean -->
<span id="uc_course_lbl_course_effdt">** available as of 2026-07-01</span>  <!-- Separate -->
```

**Outcome Page**:
```html
<span id="uc_course_outcome_lbl_course"> - </span>  <!-- ⚠️ Just a dash! -->
```

**Solution**:
- Extract from detail page (authoritative)
- Validation accepts incomplete outcome pages
- Log warning for manual review

### 2. System Error Pages

**CUHK Returns**: `<title>System error</title>`

**Frequency**: ~8% of outcome page requests

**Behavior**:
- Detection: Check 1 catches these
- Action: Return early, don't retry (permanent database issue)
- Tracking: `_track_failed_course_outcome()` logs for manual review

### 3. Corrupted HTML (Network Issues)

**Symptoms**: Missing buttons, malformed structure

**Detection**: `ValueError` raised during parsing

**Current Behavior**: Infinite retry (assumes transient)

**Risk**: Can loop forever on permanent format issues (see PHED1370 case)

---

## Progress Tracking

### ScrapingProgressTracker

**Purpose**: Enable resume capability for long-running scrapes (~1 hour).

**Storage**: `logs/summary/scraping_progress.json`

**Structure**:
```json
{
  "scraping_log": {
    "started_at_hkt": "2026-02-05 18:00:00",
    "started_at_utc": "2026-02-05T10:00:00Z",
    "total_subjects": 259,
    "completed": 45,
    "failed": 2,
    "subjects": {
      "PHED": {
        "status": "in_progress",
        "courses_scraped": 15,
        "last_course_completed": "1370",
        "estimated_courses": 80
      }
    }
  }
}
```

**Features**:
- Per-subject progress (completed courses, last course, timestamp)
- Periodic saves (every 60 seconds during scraping)
- Retry count tracking
- Failed subject tracking for manual review

---

## Configuration

### ScrapingConfig

**Production Configuration**:
```python
ScrapingConfig.for_production()
# - max_courses_per_subject: None (unlimited)
# - get_details: True
# - get_enrollment_details: True
# - get_course_outcome: True
# - output_directory: "data"
# - save_debug_files: False (production)
# - track_progress: True
```

**Testing Configuration**:
```python
ScrapingConfig()  # Defaults
# - max_courses_per_subject: 3 (limited)
# - get_details: False (basic only)
# - save_debug_files: True (debugging)
# - output_directory: "tests/output"
# - track_progress: False
```

**Debug HTML Saving**:
- `save_debug_files: True` → Save all pages
- `save_debug_on_error: True` → Save only on parse failures
- Directory: `tests/output/debug_html/` (separate from data)

---

## Debugging Guide

### Enable Debug HTML Saving

```python
# In scrape_all_subjects.py
config = ScrapingConfig.for_production()
config.save_debug_files = True  # Enable
scraper = CuhkScraper(config)
```

**Saved Files**:
- `response_{SUBJECT}_attempt_{N}.html` - Captcha response
- `course_details_{SUBJECT}_{CODE}.html` - Detail page
- `sections_{SUBJECT}_{CODE}_{TERM}.html` - Section listings
- `course_outcome_{SUBJECT}_{CODE}.html` - Outcome page

### Test Specific Subjects

```bash
# Single subject
poetry run python scripts/scrape_all_subjects.py PHED

# Multiple subjects
poetry run python scripts/scrape_all_subjects.py PHED,CSCI,MATH
```

### Interpret Logs

**Successful flow**:
```
INFO - 📖 Getting details for course 1/80: 1370
INFO - Navigating to Course Outcome page for 1370
INFO - Course Outcome parsed for 1370
INFO - Extracted details for 1370: Credits=1.00, Terms=2
```

**Validation failure** (infinite loop):
```
ERROR - Missing or incorrect course header for 1370
WARNING - ⚠️ Course details validation failed for 1370 (attempt 277), retrying in 60s
```

**System error** (permanent):
```
ERROR - 🚨 System error (PERMANENT) for 1370 course outcome - cannot scrape
INFO - 📝 Tracked failed course outcome: PHED1370 (system_error_permanent)
```

### Check Progress

```bash
cat logs/summary/scraping_progress.json | jq '.scraping_log.subjects.PHED'
```

### Review Failed Courses

```bash
cat logs/summary/failed_course_outcomes.txt
```

---

## Usage Examples

### Production Scraping (All Subjects)

```bash
poetry run python scripts/scrape_all_subjects.py
```

**Output**:
- `data/PHED.json`, `data/CSCI.json`, ... (259 files)
- `logs/scraper_20260205_180000.log` (timestamped log)
- `logs/summary/scraping_progress.json` (progress tracking)
- `logs/summary/failed_course_outcomes.txt` (manual retry list)

### Debug Single Subject

```bash
# Enable debug HTML saving in scrape_all_subjects.py first
poetry run python scripts/scrape_all_subjects.py PHED
```

**Debug Output**:
- `tests/output/debug_html/course_details_PHED_1370.html`
- `tests/output/debug_html/course_outcome_PHED_1370.html`

### Resume After Interruption

Progress is automatically saved. Just re-run:
```bash
poetry run python scripts/scrape_all_subjects.py
```

The scraper will:
- Load existing progress from `scraping_progress.json`
- Preserve completed subjects
- Continue from where it left off

---

## Known Issues & Future Enhancements

### Current Issues

1. **Infinite Retry on Validation Failures**
   - Symptom: Stuck on attempt 277+
   - Cause: Can't distinguish transient vs permanent errors
   - Impact: Wastes hours on unrecoverable format issues
   - Plan: Add retry limits (max 3-5 attempts for validation)

2. **No Rate Limiting**
   - Currently: Fixed 1-2 second delays
   - Risk: Could be throttled by CUHK servers
   - Enhancement: Adaptive rate limiting based on response times

3. **Memory Usage**
   - Large subjects (UGEC, CHLT) can use significant memory
   - Mitigation: Garbage collection after each subject
   - Enhancement: Stream processing for very large subjects

### Future Enhancements

1. **Smarter Error Classification**
   ```python
   class ScraperError(Exception):
       pass

   class NetworkError(ScraperError):  # Retry infinitely
       pass

   class ValidationError(ScraperError):  # Retry limited
       pass

   class PermanentError(ScraperError):  # Fail fast
       pass
   ```

2. **Resume from Failed Courses**
   - Currently: Resume at subject level
   - Enhancement: Resume at course level within subject

3. **Parallel Scraping**
   - Currently: Sequential (one subject at a time)
   - Enhancement: Parallel workers for independent subjects
   - Risk: Need to manage captcha solving and rate limits

---

## Related Files

**Core Scraper**:
- `scripts/cuhk_scraper.py` - Main scraper implementation
- `scripts/data_utils.py` - HTML utilities, formatting helpers

**Scripts**:
- `scripts/scrape_all_subjects.py` - Production scraping entry point
- `scripts/generate_subjects.py` - Subject title extraction
- `scripts/publish_course_data.py` - Data publishing with validation

**Configuration**:
- `pyproject.toml` - Python dependencies (ddddocr, beautifulsoup4, requests)

**Output**:
- `data/*.json` - Per-subject course data (production)
- `logs/scraper_*.log` - Timestamped scraping logs
- `logs/summary/scraping_progress.json` - Progress tracking
- `logs/summary/failed_course_outcomes.txt` - Failed course list

---

## See Also

- [CLAUDE.md](../CLAUDE.md) - High-level project overview
- [Architecture Patterns](../CLAUDE.md#critical-architecture-patterns) - Cross-cutting concerns
- [Data Validation](../CLAUDE.md#type-safety-boundary) - Zod schemas and type safety
