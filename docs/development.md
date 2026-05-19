# Development

This guide covers the local workflow for the scraper and the web app.

## Prerequisites

- Python 3.10 to 3.12
- [Poetry](https://python-poetry.org/docs/#installation)
- Node.js and npm

## Install Dependencies

Install Python dependencies from the repository root:

```bash
poetry install --no-root
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

Next.js blocks cross-origin dev-server resources by default. To test from another device on the same network, add the device-facing host to `web/.env.local`:

```bash
ALLOWED_DEV_ORIGINS=192.168.8.52
```

Use the IP address or host that appears in the browser URL on the other device, then restart `npm run dev`.

## Environment Variables

Create local web env vars in `web/.env.local`.

```bash
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
ALLOWED_DEV_ORIGINS=
```

- `NEXT_PUBLIC_POSTHOG_KEY`: PostHog project key for analytics.
- `NEXT_PUBLIC_POSTHOG_HOST`: optional PostHog ingest host; defaults to `https://us.i.posthog.com`.
- `ALLOWED_DEV_ORIGINS`: comma-separated dev origins for LAN/mobile testing.

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

## Publish Course Data

After scraping, validate and publish the data for the web app:

```bash
poetry run python scripts/publish_course_data.py
```

Published files are written to `web/public/data/`.

If subject metadata needs regeneration, run:

```bash
poetry run python scripts/generate_subjects.py
```

## Common Checks

Run these from `web/`:

```bash
npm exec tsc -- --noEmit
npm run build
npm run lint
```

Run Python formatting/linting through pre-commit from the repository root:

```bash
poetry run pre-commit install
poetry run pre-commit run
```

## Local State

The web app stores schedules in browser `localStorage`, scoped by term. If local testing behaves unexpectedly after data-shape changes, clear site data for `localhost:3000`.
