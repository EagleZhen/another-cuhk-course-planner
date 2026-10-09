# Web App

Next.js frontend for Another CUHK Course Planner.

For full local setup, data publishing, and development workflow, see [../docs/development.md](../docs/development.md).

## Prerequisites

- Node.js matching this package's `engines.node` range, and npm.

## Commands

Run these from `web/`:

| Command             | Purpose                                              |
| ------------------- | ---------------------------------------------------- |
| `npm run dev`       | Start the local Next.js dev server.                  |
| `npm run typecheck` | Run TypeScript checks without emitting build output. |
| `npm run lint`      | Run ESLint on the web app source.                    |
| `npm run build`     | Create the static production export in `out/`.       |
| `npm run start`     | Serve the static export (build first).               |

The `serve → compression` override fixes a [response-abort memory leak](https://github.com/advisories/GHSA-vc2v-76pw-4v95). Remove it when `serve` uses compression 1.8.2 or newer.

## Course Data

The app reads published course data from `public/data/`. Those files are generated from scraped data by the root-level publish workflow.

Run this from the repository root:

```bash
uv run python scripts/publish_course_data.py
```

See [../docs/development.md](../docs/development.md) for the scraper and publishing workflow.
