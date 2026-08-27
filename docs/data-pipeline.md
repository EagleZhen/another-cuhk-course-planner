# Data Pipeline

The data pipeline turns CUHK course catalog pages into JSON files used by the web app.

```text
CUHK course catalog
    -> scripts/scrape_all_subjects.py
    -> data/<year>/*.json (+ data/no-terms/*.json for courses with no scheduled terms)
    -> scripts/publish_course_data.py
        -> web/public/data/<year>/*.json
        -> web/src/lib/generated/{subjects,terms,scrape-times}.ts
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

# Inspect publish validation without changing publish outputs
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

### File Schema

Every course file carries `metadata.schema_version` (`SCHEMA_VERSION` in [scripts/data_utils.py](../scripts/data_utils.py)); publishing rejects anything else. Bump it for any file-shape change and add a row.

| Version | Change |
| --- | --- |
| 1 | Versioned metadata, no per-file scrape timestamp (see [decisions.md](decisions.md#stamp-each-data-directory-with-its-scrape-time)) |

### Freshness

Each data directory holds a `_scraped_at.txt`: when the scrape that wrote it started. Publishing reads those into [scrape-times.ts](../web/src/lib/generated/scrape-times.ts) for the app's "Last Data Sync", shown in CUHK's timezone (HKT), not the viewer's. It renders only after hydration — browsers rewrite a date left in the prerendered HTML (data detectors, translation, extensions), which breaks hydration.

Only full scrapes write them, and only for the directories they produced — so a year CUHK drops keeps its own time ([why](decisions.md#stamp-each-data-directory-with-its-scrape-time)).

## Publish

Publishing validates scraped data and copies publishable files to a per-year directory under [web/public/data/](../web/public/data/) (`web/public/data/<year>/`), so the app can fetch one year at a time. Fields the app never renders are stripped during the copy (see `STRIPPED_COURSE_FIELDS` in [scripts/publish_course_data.py](../scripts/publish_course_data.py)); the full data stays in [data/](../data/).

The publish script checks:

- JSON structure and per-course subject consistency
- filename subject codes against `metadata.subject`
- scraping progress metadata
- zero-course subjects and structural issues

These checks validate selected files; they do not prove that an academic year contains every subject. Treat unexpected subject removals as data-review signals.

A run ends by copying a ready-to-paste commit title to the clipboard: `chore(data): update <years> courses (<scrape time in HKT>)`. It lists only the years stamped by the latest full scrape, excluding older frozen years that remain publishable.

After validation succeeds, publishing regenerates the app's manifests (see [Generated Manifests](#generated-manifests)). Validation failures and dry runs leave them unchanged.

Publish logs are written to [logs/latest_publish.log](../logs/latest_publish.log) and timestamped files in [logs/publish/](../logs/publish/).

Use [logs/latest_publish.log](../logs/latest_publish.log) for exact current counts.

Read the publish count summary per source year (`data/<year>/`) as:

- source JSON files found in that year's directory
- files selected and copied for publishing

## Generated Manifests

Publishing generates the app's manifests from validated yearly data:

- [subjects.ts](../web/src/lib/generated/subjects.ts): subject codes per academic year and code-to-title mappings
- [terms.ts](../web/src/lib/generated/terms.ts): available terms per academic year
- [scrape-times.ts](../web/src/lib/generated/scrape-times.ts): each year's scrape time (see [Freshness](#freshness))

The subject and term manifests are derived from the same publishable files copied into the web app, so a skipped file cannot enter an index the app fetches by. `scrape-times.ts` takes only its years from those files; the times themselves come from each source directory's stamp.

If a subject or term manifest changes, the publisher warns. Review and commit its Git diff with the data PR; no separate generation command or second publish run is needed. `scrape-times.ts` changes on every scrape by design, so it is not warned about.

The default selected term (`DEFAULT_CURRENT_TERM` in [web/src/lib/constants.ts](../web/src/lib/constants.ts)) is set by hand; [constants.test.ts](../web/src/lib/constants.test.ts) verifies it remains in the generated term list.

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

Failures retry rather than resolving to empty data, because empty is what a legitimately empty subject, term, or section returns. Each scope retries by redoing the whole unit below it:

| Scope | Retries on | Limit | When it runs out |
| --- | --- | --- | --- |
| Request | network errors, HTTP 502/503/504 | unbounded | other statuses raise to the course |
| Course | anything raised while fetching or parsing a course page | `max_course_attempts` (5) | costs the subject one attempt |
| Subject | any course failure, restarting from the course list | `max_subject_attempts` (10) | records the subject failed, run moves on |

So a run finishes even when subjects fail, rather than stalling on one course. A failed subject blocks publishing, which names it and stops before writing anything. Re-scrape that subject and publish again.

CUHK's own system-error pages are permanent and never retried — see [System Error Pages](#system-error-pages).

### Request Pacing

Every request, retries included, waits its turn in `_robust_request`; `request_delay` is that interval and the only thing pacing a healthy run. Runtime follows from it — roughly requests × interval, plus whatever retry backoff adds; [scraping_progress.json](../logs/scraping_progress.json) records what the last run took.

The production 0.8s is a judgement call, not a derived number: slow enough that the load stays light to the official server, fast enough that a full run fits the window it is given. Retune it against the last run's duration.

When in doubt, go slower. The catalog is public but captcha-gated, so visible bulk traffic invites the registry to harden it — a tougher captcha, a WAF, an auth wall. Any of those ends this scraper for good and leaves the site worse for everyone using it. A run that takes an extra three hours costs nothing by comparison.

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
- [scripts/generate_subjects.py](../scripts/generate_subjects.py) - standalone subject-manifest generation
- [scripts/data_utils.py](../scripts/data_utils.py) - HTML utilities and JSON output helpers
