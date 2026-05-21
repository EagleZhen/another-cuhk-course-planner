# Web App

Next.js frontend for Another CUHK Course Planner.

For full local setup, data publishing, and development workflow, see [../docs/development.md](../docs/development.md).

## Commands

Run these from `web/`:

```bash
npm run dev
npm exec tsc -- --noEmit
npm run build
npm run lint
```

## Course Data

The app reads published course data from `public/data/`. Those files are generated from scraped data by the root-level publish workflow:

```bash
poetry run python scripts/publish_course_data.py
```

See [../docs/development.md](../docs/development.md) for the scraper and publishing workflow.
