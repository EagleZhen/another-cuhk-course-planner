# Web App

Next.js frontend for Another CUHK Course Planner.

For full local setup, data publishing, and development workflow, see [../docs/development.md](../docs/development.md).

## Commands

Run these from `web/`:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local Next.js dev server. |
| `npm run typecheck` | Run TypeScript checks without emitting build output. |
| `npm run build` | Create a production build. |

## Course Data

The app reads published course data from `public/data/`. Those files are generated from scraped data by the root-level publish workflow.

Run this from the repository root:

```bash
poetry run python scripts/publish_course_data.py
```

See [../docs/development.md](../docs/development.md) for the scraper and publishing workflow.
