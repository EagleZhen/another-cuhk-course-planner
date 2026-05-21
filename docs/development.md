# Development

This guide covers the local workflow for the scraper and the web app.

## Prerequisites

- Python 3.12.2 is the currently tested version. `pyproject.toml` allows Python 3.10 to 3.12, but not every allowed version is actively tested.
- [Poetry](https://python-poetry.org/docs/#installation)
- Node.js and npm

## Install Dependencies

Install Python dependencies from the repository root:

```bash
poetry install --no-root
```

Install Git hooks for Python formatting/linting and basic source-file whitespace cleanup:

```bash
poetry run pre-commit install
```

Install web dependencies:

```bash
cd web
npm install
```

## Run The Web App

```bash
cd web
npm run dev
```

Open <http://localhost:3000>.

The web app reads published course data from `web/public/data/`. If that directory is missing or stale, run the scraper/publish workflow below.

## Test On Another Device

Next.js blocks cross-origin dev-server resources by default. To test from another device on the same network, add the host computer's LAN IP address to `web/.env.local`:

```bash
ALLOWED_DEV_ORIGINS=192.168.8.52
```

Use the IP address that the phone/tablet will open in the browser, for example `http://192.168.8.52:3000`. The devices must be on the same network and able to reach each other. Restart `npm run dev` after changing the env file.

## Environment Variables

Create local web env vars in `web/.env.local`.

```bash
ALLOWED_DEV_ORIGINS=
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=
```

- `ALLOWED_DEV_ORIGINS`: comma-separated dev origins for LAN/mobile testing.
- `NEXT_PUBLIC_POSTHOG_KEY`: optional PostHog project key. Local development works without it.
- `NEXT_PUBLIC_POSTHOG_HOST`: optional PostHog ingest host; defaults to `https://us.i.posthog.com`.

## Scrape Course Data

Run the production scraper from the repository root:

```bash
poetry run python scripts/scrape_all_subjects.py
```

Scrape specific subjects while debugging:

```bash
poetry run python scripts/scrape_all_subjects.py PHED
poetry run python scripts/scrape_all_subjects.py PHED,CSCI
```

Scraped JSON files are written to `data/`.

The scraper is stable in normal use, but it is fragile by nature because it depends on CUHK website structure, response behavior, and captcha handling. After a scrape, review:

```bash
logs/summary/scraping_progress.json
logs/summary/failed_course_outcomes.txt
```

Look for failed subjects, unusual course counts, repeated validation failures, or unexpectedly missing courses.

## Publish Course Data

After scraping, validate and publish the data for the web app:

```bash
poetry run python scripts/publish_course_data.py
```

The publish script validates JSON structure, subject-list consistency, course counts, and scraping progress metadata before copying files. It blocks publishing when the subject list no longer matches `web/src/lib/subjects.ts`, reports problematic files, and asks for confirmation before copying.

To inspect validation output without copying files, use:

```bash
poetry run python scripts/publish_course_data.py --dry-run
```

Published files are written to `web/public/data/`.

Review the latest publish log after publishing:

```bash
logs/publish/latest_publish.log
```

Pay attention to:

- failed subjects in the scraping summary
- subject-list mismatch errors
- files with structural issues
- subjects with unexpectedly zero courses
- a published file count that differs from the expected course JSON count

If scraped subjects are added or removed, regenerate the `SUBJECT_TITLES` mapping used by `web/src/lib/subjects.ts`:

```bash
poetry run python scripts/generate_subjects.py
```

The script prints a replacement `SUBJECT_TITLES` constant generated from `data/*.json`, excluding administrative placeholder subjects. Copy the output into `web/src/lib/subjects.ts`.

## Common Checks

Run these from `web/`:

```bash
npm exec tsc -- --noEmit
npm run build
npm run lint
```

If Git hooks were installed with `poetry run pre-commit install`, the configured hooks run automatically on commit. Current hooks cover Python formatting/linting for `scripts/*.py` and basic whitespace/end-of-file cleanup for selected source files. To run the hooks manually before committing:

```bash
poetry run pre-commit run
```
