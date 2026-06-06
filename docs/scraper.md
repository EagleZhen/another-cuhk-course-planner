# CUHK Course Scraper

Production scraper that extracts course data from CUHK's course catalog. Generates per-subject JSON files (259 files, ~50MB) with course details, schedules, enrollment data, and learning outcomes.

## Quick Start

```bash
# All subjects (production, ~1 hour)
poetry run python scripts/scrape_all_subjects.py

# Debug specific subjects
poetry run python scripts/scrape_all_subjects.py PHED,CSCI
```

**Output**: `data/PHED.json`, `data/CSCI.json`, etc.

---

## Key Architecture Principle

**Detail page is the authoritative source for course identity.**

List pages may have formatting artifacts (brackets, remarks), but detail pages are clean and consistent.

```python
# List page (unreliable format)
course_code = "(1370)"  # Brackets for future courses ⚠️
title = "Archery\n** available as of 2026-07-01"  # With remarks ⚠️

# Detail page (authoritative, clean)
_extract_course_details() extracts:
  course_code = "1370"  # ✅ Clean
  title = "Archery"     # ✅ Clean
```

**Why this matters**: Validation can trust detail page data, don't need to re-validate on outcome pages.

---

## Page Navigation Flow

```
List Page → Detail Page → Outcome Page → Term/Section Pages
   ↓            ↓              ↓              ↓
Parse      Extract ALL    Extract         Extract
course     details        outcomes        schedules
links      (authoritative) (optional)      (enrollment)
```

**Detail Page** extracts:

- Course code & title (authoritative)
- Credits, description, requirements
- Academic info, grading basis

**Outcome Page** extracts (optional):

- Learning outcomes, syllabus
- Assessment types, readings

---

## Edge Cases (Important!)

### 1. Future-Dated Courses

Courses marked "\*\* available as of [date]" have special formatting.

**Example**: PHED1370 (Archery)

**List page**:

```html
<a>(1370)</a>
<!-- Brackets! -->
<a>Archery ** available as of 2026-07-01</a>
<!-- Remark! -->
```

**Outcome page**:

```html
<span id="uc_course_outcome_lbl_course"> - </span>
<!-- Just a dash! -->
```

**Solution**: Extract from detail page (clean), validation accepts dash headers.

### 2. System Error Pages

CUHK returns `<title>System error</title>` for ~8% of outcome requests.

**Behavior**:

- Don't retry (permanent database issue)
- Track in `logs/summary/failed_course_outcomes.txt` for manual review

### 3. Incomplete Outcome Data

Some courses have outcome pages with minimal data (just dash in header, but valid structure).

**Validation accepts**: Structural validity (has sections), not content completeness.

---

## Validation Strategy

Outcome pages use **3-check validation**:

1. **Not a system error page** → Permanent failure, don't retry
2. **Has "Course Outcome" title** → Correct page type
3. **Has section headers** → Not empty (Learning Outcome, Course Syllabus, Assessment Type, etc.)

**What we DON'T validate**: Course code/title (detail page is authoritative, no need to re-check).

---

## Retry Mechanisms

### Network Errors: Infinite Retry ✅

`_robust_request()` retries indefinitely for:

- ConnectionError, Timeout, ConnectionResetError
- HTTP 502/503/504 (server overload)
- Exponential backoff (1s → 2s → 4s → max 60s)

### Validation Errors: Infinite Retry ⚠️

**Known Issue**: Currently retries infinitely on validation failures.

**Problem**: Can't distinguish transient corruption from permanent format issues.

**Future Fix**: Add retry limits (max 3-5 attempts) for validation failures.

---

## Debugging

### Enable Debug HTML Saving

```python
# In scrape_all_subjects.py
config = ScrapingConfig.for_production()
config.save_debug_files = True
scraper = CuhkScraper(config)
```

**Saved to**: `tests/output/debug_html/`

### Check Progress

```bash
cat logs/summary/scraping_progress.json | jq '.scraping_log.subjects.PHED'
```

### Review Failed Courses

```bash
cat logs/summary/failed_course_outcomes.txt
```

---

## Known Issues

1. **Infinite Retry on Validation Failures**
   - Can loop forever (e.g., attempt 277+)
   - Need retry limits for non-network errors

2. **Memory Usage**
   - Large subjects can use significant memory
   - Mitigated by garbage collection after each subject

---

## Configuration

**Production** (default):

```python
ScrapingConfig.for_production()
# - Unlimited courses
# - Full details + enrollment + outcomes
# - Progress tracking enabled
# - Output: data/
```

**Testing**:

```python
ScrapingConfig()  # Defaults
# - Max 3 courses per subject
# - Basic details only
# - Debug HTML enabled
# - Output: tests/output/
```

---

## See Also

- [CLAUDE.md](../CLAUDE.md) - Project overview
- `scripts/scrape_all_subjects.py` - Entry point (what you actually run)
- `scripts/cuhk_scraper.py` - Core scraper implementation
- `scripts/data_utils.py` - HTML utilities
