# Development

This guide covers local setup, common commands, and day-to-day checks.

## Project Workflow

The repository has two main parts:

- `scripts/`: Python tools for collecting and publishing course data.
- `web/`: Next.js app that reads the published course data.

The CUHK course catalog is an external data source. It is not part of this project, but the scraper depends on its page structure and available content.

```text
CUHK course catalog (external)
    ↓
scripts/scrape_all_subjects.py
    ↓
data/*.json
    ↓
scripts/publish_course_data.py
    ↓
web/public/data/<year>/*.json
    ↓
web/ Next.js app
```

- Scraper work changes how course data is collected into `data/*.json`.
- Publishing validates scraped data and copies it into `web/public/data/`.
- Web app work changes how the published data is loaded, transformed, and displayed.

For normal UI development, you usually only need existing published data and `npm run dev`. For scraper behavior, publish validation, file counts, and edge cases, see [data-pipeline.md](data-pipeline.md).

## Prerequisites

- Python 3.12.2 is the currently tested version. `pyproject.toml` allows Python 3.10 to 3.12, but not every allowed version is actively tested.
- [uv](https://docs.astral.sh/uv/getting-started/installation/)
- Node.js matching `web/.nvmrc` (the version Cloudflare Pages actually builds with; `engines.node` is a wider, non-enforced range), and npm. Version managers that read `.nvmrc` (`nvm`, `fnm`) can switch automatically.

## Install Dependencies

Install Python dependencies from the repository root:

```bash
uv sync
```

Install repository-level tooling such as Prettier:

```bash
npm install
```

Install Git hooks for automatic formatting, Python linting, and basic source-file hygiene:

```bash
uv run pre-commit install
```

`uv sync` installs the `pre-commit` command, but `uv run pre-commit install` is what connects it to `git commit`. If the hook is not installed, manual commands such as `uv run pre-commit run --all-files` still work, but `git commit` will not run the hooks automatically.

Install web dependencies:

```bash
cd web
npm install
```

## Formatting And Checks

Use the configured tools instead of formatting files by hand.

Pre-commit is the normal formatting entry point. After installing hooks with `uv run pre-commit install`, each commit follows this flow:

```text
git commit
    ↓
pre-commit
    ├─ Prettier: supported staged JS/TS/JSON/YAML/CSS/Markdown
    ├─ Ruff/Ruff format/isort: scripts/*.py
    └─ Basic hygiene: JSON/YAML validity, merge conflicts, whitespace, EOF
```

Prettier rules live in `.prettierrc.json`; ignored generated/vendor paths live in `.prettierignore`.

To run hooks manually on staged files:

```bash
uv run pre-commit run
```

### Format The Whole Repository

To run the full configured formatting and hygiene system across all tracked files:

```bash
uv run pre-commit run --all-files
```

If hooks modify files, stage the changes and run the command again.

To run only Prettier across the repository:

```bash
npm run format
```

Generated source files should ideally be emitted in the expected format by their generator. Avoid excluding generated files only because the generator produces slightly different style.

## Run The Web App

```bash
cd web
npm run dev
```

Open <http://localhost:3000>.

The web app reads published course data from `web/public/data/`. If that directory is missing or stale, run the data pipeline commands below.

## Console Logging (web)

- `console.warn`/`console.error` for real failures — keep the ⚠️/❌, it's what makes them stand out.
- `console.log` for rare events worth seeing by default (e.g. a legacy-data migration).
- `console.debug` for routine or hot-path tracing (hidden unless DevTools is set to "Verbose").
- No emoji elsewhere.

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
```

- `ALLOWED_DEV_ORIGINS`: comma-separated dev origins for LAN/mobile testing.
- `NEXT_PUBLIC_POSTHOG_KEY`: optional PostHog project key. Local development works without it.

## Data Pipeline

For scraping, publishing, validation, file counts, edge cases, and debugging notes, see [data-pipeline.md](data-pipeline.md).

## Common Checks

Run these from `web/`:

| Command             | Purpose                                                |
| ------------------- | ------------------------------------------------------ |
| `npm run typecheck` | Verify TypeScript types without emitting build output. |
| `npm run lint`      | Run ESLint on the web app source.                      |
| `npm run build`     | Verify the production build.                           |

For routine web changes, `npm run typecheck` and `npm run lint` are usually the lightweight checks. Run `npm run build` before deployment or when changing Next.js config, routing, static generation, metadata, or other build-sensitive behavior.
