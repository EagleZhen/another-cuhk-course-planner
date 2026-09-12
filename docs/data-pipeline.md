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

## Layers

Course data passes through three steps, and they differ enormously in how hard a mistake is to undo. That is what decides where each transformation belongs — see [Where A Transformation Belongs](decisions.md#where-a-transformation-belongs).

| step | fixing a mistake means |
| --- | --- |
| scrape | scraping everything again, around 9 hours — and for a year CUHK has dropped, there is no way to fix it at all |
| publish | re-running the publisher on data we already have: minutes, landing as a reviewable diff. A schema change also costs us a migration for saved carts — our work, invisible to users |
| use | changing code; every user gets it on their next page load |

Only the scrape is one-way. [data/](../data/) still holds everything it wrote, so the later steps can always be redone.

## Quick Start

Run these from the repository root.

```bash
# Scrape all subjects from the live catalog
uv run python scripts/scrape_all_subjects.py

# Scrape selected subjects while debugging (leaves scrape times alone)
uv run python scripts/scrape_all_subjects.py CSCI
uv run python scripts/scrape_all_subjects.py CSCI,UGFN

# Finish an interrupted full scrape (warns if it is over a day old)
uv run python scripts/scrape_all_subjects.py --resume

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
- fails a section whose class details response is unreadable — wrong class number, no status, or unreadable seat counts — rather than recording a blank one. The course is retried; an exhausted one fails its subject.
- tracks progress in [logs/scraping_progress.json](../logs/scraping_progress.json)
- writes verbose logs to [logs/scrape/](../logs/scrape/)

Log filenames in [logs/scrape/](../logs/scrape/) use the machine timezone, normally HKT/UTC+8 for this project environment.

Each line shows its level in a column (🟡 warning, 🔴 error, unmarked below that), then its scope — `[CSCI1130]`, or `[CSCI]` for work spanning the subject; run-level lines have none. The console uses the same format and also carries the runner's own lines — the subjects a partial run was given, and why a run died — which never reach the log file.

### Progress Log

[scraping_progress.json](../logs/scraping_progress.json) holds three blocks, shortest-lived first:

- `latest_run` describes one invocation, counting only the subjects that run covered — so a one-subject retry reports 1, not the whole catalog, and `mode` says which kind of run produced the counts. It is written for a human and never read back, hence HKT timestamps and no machine-readable copies. Its `status` stays `in_progress` until the run ends, so a killed run never reaches `completed`. `last_updated` moves once per subject; [logs/scrape/](../logs/scrape/) is what shows whether a run is still alive.
- `latest_full_scrape` describes one scrape of the whole catalog, which may span several runs: `started_at` is what its directories are stamped with, `remaining` is what it has not attempted yet (empty means it finished), `directories` is what it wrote. Full runs start one and resumes continue it; partial runs leave it alone ([why](decisions.md#record-the-scrape-apart-from-the-run)).
- `subjects` is the cumulative registry of what sits in [data/](../data/), keyed by subject code, so it keeps entries for subjects the current run never visited.

A log that will not parse stops both the scraper and the publisher rather than reading as an empty one — it is our own output. Read as an absence, it makes `--resume` report no scrape recorded when one sits there half-finished, and lets publishing skip the gate that waits for a finished scrape. A missing log is different, and still degrades: no log is a legitimate first run.

```bash
jq '.latest_run' logs/scraping_progress.json
```

Scripts that write JSON output use `save_json_with_newline()` in [scripts/data_utils.py](../scripts/data_utils.py) for consistent formatting (2-space indent, trailing newline) and clean diffs. It renames a temporary file over the target, so a kill mid-write leaves the previous file rather than a truncated one.

### File Schema

Every course file carries `metadata.schema_version` (`SCHEMA_VERSION` in [scripts/data_utils.py](../scripts/data_utils.py)); publishing rejects anything else. Bump it for any file-shape change and add a row.

A bump forces a full re-scrape, which is the point: published data can never be a silent mix of old and new records.

| Version | Change |
| --- | --- |
| 1 | Versioned metadata, no per-file scrape timestamp (see [decisions.md](decisions.md#stamp-each-data-directory-with-its-scrape-time)) |
| 2 | `availability.status` is CUHK's own word, not one derived from seat counts (see [decisions.md](decisions.md#record-the-catalog-status-verbatim)) |
| 3 | Sections store what their class page states: `class_attributes` unthinned ([#323](https://github.com/EagleZhen/another-cuhk-course-planner/issues/323)), plus a new `enrollment_requirement` ([#327](https://github.com/EagleZhen/another-cuhk-course-planner/issues/327)). Publishing drops the lines their course repeats |

### Freshness

Each data directory holds a `_scraped_at.txt`: when the scrape that wrote it started. Publishing reads those into [scrape-times.ts](../web/src/lib/generated/scrape-times.ts) for the app's "Last Data Sync", shown in CUHK's timezone (HKT), not the viewer's. It renders only after hydration — browsers rewrite a date left in the prerendered HTML (data detectors, translation, extensions), which breaks hydration. A stamp with no UTC offset is skipped as undated, rather than read in the publisher's timezone.

Only full scrapes and resumes write them, and only for the directories that scrape produced — so a year CUHK drops keeps its own time ([why](decisions.md#stamp-each-data-directory-with-its-scrape-time)). A resume writes the interrupted scrape's start, not its own.

## Publish

Publishing validates scraped data and copies publishable files to a per-year directory under [web/public/data/](../web/public/data/) (`web/public/data/<year>/`), so the app can fetch one year at a time. Fields the app never renders are stripped during the copy (see `STRIPPED_COURSE_FIELDS` in [scripts/publish_course_data.py](../scripts/publish_course_data.py)); the full data stays in [data/](../data/).

Two fields are thinned rather than copied: a section's `class_attributes` and `enrollment_requirement` lose the lines its course already states, which the course block renders anyway. What an empty result means differs by field, so each has its own name — `lines_the_class_adds` for the requirement, `lines_the_class_states` for the attributes; see [Thin Enrollment Information At Publish](decisions.md#thin-enrollment-information-at-publish). The page's own words stay in [data/](../data/), so correcting the rule costs a re-publish, not a re-scrape — which is why the scraper no longer does it ([#323](https://github.com/EagleZhen/another-cuhk-course-planner/issues/323), [#327](https://github.com/EagleZhen/another-cuhk-course-planner/issues/327)).

The publish script checks:

- JSON structure and per-course subject consistency
- filename subject codes against `metadata.subject`
- scraping progress metadata
- zero-course subjects and structural issues

A year the latest full scrape did not produce is **archived**: CUHK no longer serves it, so no scrape can rewrite its files and the schema check could only reject them forever. Such a year is neither version-checked nor re-copied, since its published copy is complete and can no longer change. It still feeds the manifests — dropping it would erase the year from the app — but its subjects and terms are read from the published copy, so a manifest can never name a subject that was never copied. Its scrape time still comes from the stamp in [data/](../data/).

These checks validate selected files; they do not prove that an academic year contains every subject. Treat unexpected subject removals as data-review signals.

A run ends by copying a ready-to-paste commit title to the clipboard: `chore(data): update <years> courses (<scrape time in HKT>)`. It lists only the years stamped by the latest full scrape, excluding archived ones.

After validation succeeds, publishing regenerates the app's manifests (see [Generated Manifests](#generated-manifests)). Validation failures and dry runs leave them unchanged.

Publish logs are written to [logs/latest_publish.log](../logs/latest_publish.log) and timestamped files in [logs/publish/](../logs/publish/).

Use [logs/latest_publish.log](../logs/latest_publish.log) for exact current counts.

Read the publish count summary per source year (`data/<year>/`) as:

- source JSON files found in that year's directory
- files selected and copied for publishing — an archived year reports its files as selected but copies none

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

### Meeting Rows

Meeting rows take these shapes, with no exceptions across both published years:

| `time`                  | `dates`                            | rows   |
| ----------------------- | ---------------------------------- | ------ |
| `"Th 9:30AM - 12:15PM"` | explicit list, `"9/1, 16/1, 23/1"` | 60,019 |
| `"TBA"`                 | range, `"05/01/2026 - 13/04/2026"` | 15,608 |
| `"TBA"`                 | `"TBA"`                            | 4      |

**A row that states a time always enumerates its dates.** The timetable expands that list to place classes; a row with no time has none, so it goes to the Unscheduled card. A timed row carrying a range instead would silently vanish.

Dates carry no year — see [weekly-calendar.md](components/weekly-calendar.md#dates).

## Edge Cases

### Future-Dated Courses

Courses marked as available from a future date can use different formatting on different pages. PHED1370 is the canonical sample:

- [Course list sample](<../lab/scraper/samples/webpages/Course List - PHED.html>)
- [Detail page sample](<../lab/scraper/samples/webpages/Course Detail - PHED 1370 - Archery.html>)
- [Outcome page sample](<../lab/scraper/samples/webpages/Course Outcome - PHED 1370 - Archery.html>)

On the list page, the course code may be wrapped in brackets and the title may include an availability remark. On the outcome page, the course header may be a dash. The scraper therefore trusts the detail page for the clean course code and title.

### System Error Pages

CUHK sometimes returns a system-error page for course outcomes:

- [System error sample](<../lab/scraper/samples/webpages/System error.html>)

Retrying never clears these — CUHK's data for the course is malformed, so the fix has to come from ITSC. `logs/failed_course_outcomes.txt` lists them.

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
| Request | network errors, HTTP 502/503/504 | `max_request_attempts` (6) | raises to the course; any other status raises at once |
| Course | anything raised while fetching or parsing a course page | `max_course_attempts` (5) | costs the subject one attempt |
| Subject | any course failure, restarting from the course list on a new session | `max_subject_attempts` (10) | records the subject failed, run moves on |

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
jq '.subjects.CSCI' logs/scraping_progress.json
```

Check for outstanding outcome failures — no file means none:

```bash
cat logs/failed_course_outcomes.txt 2>/dev/null || echo "none outstanding"
```

Only a scrape that reached every subject rewrites it — a partial run, or one that lost a subject, leaves the list alone rather than speaking for what it never saw.

A production scrape already keeps the page behind each failure, so look for one before reproducing it:

| File                  | Written when                                                            |
| --------------------- | ----------------------------------------------------------------------- |
| `*_FAILED.html`       | a course exhausted `max_course_attempts`                                |
| `*_SYSTEM_ERROR.html` | CUHK's outcome page is malformed for good                               |
| `*_INVALID.html`      | an outcome page failed validation — kept even if a retry then succeeded |

To keep every page instead, while investigating parser behavior:

```python
config = ScrapingConfig.for_production()
config.save_debug_files = True
scraper = CuhkScraper(config)
```

Debug HTML is saved to [lab/scraper/outputs/debug_html/](../lab/scraper/outputs/debug_html/), which `.gitignore` covers only at the repository root — the path is relative, so run the scraper from the root or the files land somewhere untracked.

## See Also

- [scripts/scrape_all_subjects.py](../scripts/scrape_all_subjects.py) - production scrape entry point
- [scripts/cuhk_scraper.py](../scripts/cuhk_scraper.py) - core scraper implementation
- [scripts/publish_course_data.py](../scripts/publish_course_data.py) - validation and publishing
- [scripts/generate_subjects.py](../scripts/generate_subjects.py) - standalone subject-manifest generation
- [scripts/data_utils.py](../scripts/data_utils.py) - HTML utilities and JSON output helpers
