# Data Pipeline

The data pipeline turns CUHK course catalog pages into JSON files used by the web app.

```text
CUHK course catalog
    -> scripts/scrape_all_subjects.py
    -> data/*.json
    -> scripts/publish_course_data.py
    -> web/public/data/*.json
```

## Quick Start

Run these from the repository root.

```bash
# Scrape all subjects from the live catalog
uv run python scripts/scrape_all_subjects.py

# Scrape selected subjects while debugging
uv run python scripts/scrape_all_subjects.py CSCI
uv run python scripts/scrape_all_subjects.py CSCI,UGFN

# Validate and copy publishable data into the web app
uv run python scripts/publish_course_data.py

# Inspect publish validation without copying files
uv run python scripts/publish_course_data.py --dry-run
```

## Scrape

Production scraping uses `ScrapingConfig.for_production()`:

- reads the subject list from the live CUHK site when no subject argument is passed
- writes one JSON file per scraped subject to [data/](../data/)
- collects course details, enrollment data, and course outcome data
- tracks progress in [logs/scraping_progress.json](../logs/scraping_progress.json)
- writes verbose logs to [logs/scrape/](../logs/scrape/)

The scrape log timestamp uses the local machine timezone, normally HKT/UTC+8 for this project environment.

Scripts that write JSON output use `save_json_with_newline()` in [scripts/data_utils.py](../scripts/data_utils.py) for consistent formatting (2-space indent, trailing newline) and clean diffs.

## Publish

Publishing validates scraped data and copies publishable files to [web/public/data/](../web/public/data/). Fields the app never renders are stripped during the copy (see `STRIPPED_COURSE_FIELDS` in [scripts/publish_course_data.py](../scripts/publish_course_data.py)); the full data stays in [data/](../data/).

The publish script checks:

- JSON structure and per-course subject consistency
- scraped subjects against [web/src/lib/subjects.ts](../web/src/lib/subjects.ts)
- scraping progress metadata
- zero-course subjects and structural issues

Publish logs are written to [logs/latest_publish.log](../logs/latest_publish.log) and timestamped files in [logs/publish/](../logs/publish/).

Use [logs/latest_publish.log](../logs/latest_publish.log) for exact current counts. The number of source JSON files in [data/](../data/) can be higher than the number of published JSON files, because publish excludes exemption/admin placeholder codes:

```text
EX_PGDE, EX_RPG, EX_TPG, EX_UG, XCBS, XCCS, XFUD, XUNC, XUSC, XWAS
```

Read the publish count summary as:

- source JSON files found in [data/](../data/)
- excluded placeholder files
- files selected and copied for publishing

## Subject List Changes

[web/src/lib/subjects.ts](../web/src/lib/subjects.ts) is the web app's subject list. If CUHK adds or removes subjects, publishing blocks until this list is updated.

Regenerate the `SUBJECT_TITLES` constant:

```bash
uv run python scripts/generate_subjects.py
```

Copy the printed constant into [web/src/lib/subjects.ts](../web/src/lib/subjects.ts), then run the publish script again.

## Scraper Model

Course detail pages are the authoritative source for course identity. List pages and outcome pages can contain formatting artifacts, so validation should not depend on them for clean course code/title data.

```text
List page -> detail page -> outcome page -> term/section pages
```

- List page: finds course links.
- Detail page: extracts course code, title, credits, description, requirements, and academic info.
- Outcome page: extracts learning outcomes, syllabus, assessment types, and readings when available.
- Term/section pages: extract schedules and enrollment data.

## Edge Cases

### Future-Dated Courses

Courses marked as available from a future date can use different formatting on different pages. PHED1370 is the canonical sample:

- [Course list sample](<../lab/scraper/samples/webpages/Course List - PHED.html>)
- [Detail page sample](<../lab/scraper/samples/webpages/Class Detail - PHED 1370 - Archery.html>)
- [Outcome page sample](<../lab/scraper/samples/webpages/Course Outcome - PHED 1370 - Archery .html>)

On the list page, the course code may be wrapped in brackets and the title may include an availability remark. On the outcome page, the course header may be a dash. The scraper therefore trusts the detail page for the clean course code and title.

### System Error Pages

CUHK sometimes returns a system-error page for course outcomes:

- [System error sample](<../lab/scraper/samples/webpages/System error.html>)

These are treated as permanent outcome failures and recorded in [logs/failed_course_outcomes.txt](../logs/failed_course_outcomes.txt) for review.

### Incomplete Or Alternate Pages

Some pages are valid but sparse or represent non-course-result states:

- [No record found sample](<../lab/scraper/samples/webpages/No record found - AENP.html>)
- [Invalid verification code sample](<../lab/scraper/samples/webpages/Invalid Verification Code - AENP.html>)
- [Outcome table sample](<../lab/scraper/samples/webpages/Course Syllabus - List + Table.html>)

Outcome validation checks structure, not content completeness. A sparse outcome page can still be accepted if it has the expected sections.

## Validation And Retry

Outcome pages pass validation when they:

1. are not system-error pages
2. have the expected Course Outcome page title
3. contain outcome section headers

Course code/title validation is intentionally not repeated on outcome pages, because the detail page is authoritative.

Network errors and HTTP 502/503/504 responses retry with exponential backoff. Course-detail validation failures also retry, because malformed HTML can be transient. This can loop for a long time if the upstream format changes in a permanent way.

## Debugging

Check the latest scrape log and progress metadata:

```bash
ls -t logs/scrape/scrape_*.log | head -1
cat logs/scraping_progress.json | jq '.scraping_log.subjects.CSCI'
```

Review [failed course outcomes](../logs/failed_course_outcomes.txt):

```bash
cat logs/failed_course_outcomes.txt
```

Enable debug HTML saving while investigating parser behavior:

```python
config = ScrapingConfig.for_production()
config.save_debug_files = True
scraper = CuhkScraper(config)
```

Debug HTML is saved to [lab/scraper/outputs/debug_html/](../lab/scraper/outputs/debug_html/).

## See Also

- [scripts/scrape_all_subjects.py](../scripts/scrape_all_subjects.py) - production scrape entry point
- [scripts/cuhk_scraper.py](../scripts/cuhk_scraper.py) - core scraper implementation
- [scripts/publish_course_data.py](../scripts/publish_course_data.py) - validation and publishing
- [scripts/generate_subjects.py](../scripts/generate_subjects.py) - subject list generation
- [scripts/data_utils.py](../scripts/data_utils.py) - HTML utilities and JSON output helpers
