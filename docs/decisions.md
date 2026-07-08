# Decisions

Optional rationale for project choices. Operational docs should stay concise and link here when extra context would distract from the workflow.

Keep entries short and focused on real "why not another option?" questions.

## Frontend-Only Static App

The planner mostly serves scraped course data and runs interactive planning in the browser. A backend would add maintenance, deployment complexity, fragility, and cost without solving a current core problem.

Decision: publish static JSON files to [web/public/data/](../web/public/data/) and keep planner state in the browser.

Why it fits:

- hosting stays simple and cheap
- development, debugging, and iteration stay easier because there is no app server to operate
- search/filtering is fast after startup because the searchable text is small enough to handle in the browser
- the app is less fragile to backend/network availability after static data has loaded

Tradeoffs / watchouts:

- startup loading needs care because the browser fetches many JSON files
- features that require private server-side state would need a new architecture

## Cloudflare Pages Over Vercel

The app is mostly static after build, but Vercel Edge requests consumed the free quota quickly.

Decision: host the app on Cloudflare Pages.

Why it fits:

- Cloudflare's static asset request and bandwidth model fits this app better
- deployment stays aligned with the frontend-only/static architecture

## PostHog Over Vercel Analytics

Vercel Analytics was too limited for this project's free-plan analytics needs, especially around date ranges, breakdowns, and event analysis.

Decision: use PostHog for product analytics.

Why it fits:

- PostHog gives more useful ways to understand how students use planner features
- flexible breakdowns and date ranges are more useful than Vercel Analytics for current product questions

Where:

- analytics initializes in [web/src/instrumentation-client.ts](../web/src/instrumentation-client.ts)
- event helpers live in [web/src/lib/analytics.ts](../web/src/lib/analytics.ts)

## Regression-First Testing

No tests exist yet; shipping has relied on manual testing. Retroactive full coverage is a stalling task; a test per bug fix is not.

Decision: write a test alongside each bug fix (reproduce, then fix) instead of attempting upfront coverage. Start with [Vitest](https://vitest.dev/) unit tests on pure logic in [courseUtils.ts](../web/src/lib/courseUtils.ts) — a bug's correct and incorrect behavior are already known, so there's no test-design work, and this also guards the planned [courseUtils.ts split](improvements.md#architecture-debt) against reintroducing fixed bugs.

Test files are colocated next to their source (`courseUtils.test.ts` beside `courseUtils.ts`), not in a separate `__tests__` tree — easy to find, moves with the file during refactors. Next.js's own guide leads with `__tests__` as its example, but that's specifically about files inside `app/` (Next's routing directory); plain `lib/` modules don't carry that concern.

Deferred:

- component interaction tests (Vitest + React Testing Library) once UI logic, not pure logic, is what breaks
- full end-to-end tests (Playwright) for only the highest-value flows (ICS roundtrip, screenshot export) — most expensive to maintain

## Pin The Node Version Via .nvmrc

A lockfile that satisfied one local npm install still failed on Cloudflare's — nothing pinned which Node/npm version is authoritative, so installing cleanly locally wasn't proof the lockfile was actually complete. Cloudflare's build system also ignores `engines`/`packageManager` entirely; it only reads `NODE_VERSION` (env var, or `.nvmrc`), with npm bundled to whichever Node version is chosen.

Decision: pin Node exactly via [web/.nvmrc](../web/.nvmrc), rather than relying on Cloudflare's current default or a contributor's local version.

Why it fits:

- the only lever Cloudflare's build system respects for this
- pinned to Node 24 (Active LTS, supported to April 2028), not Cloudflare's aging default (22) or a contributor's local version, which can silently drift onto an already-EOL release

## Strip Unrendered Fields At Publish

Scraped course data carries fields the app doesn't render (`course_syllabus`, required/recommended readings, feedback) — some with base64-embedded images. Serving them cost roughly two-thirds of the gzipped transfer for data no one sees (~12MB → ~4MB on the wire as of mid-2026; both figures grow with each added year of data).

Decision: strip these at publish (`STRIPPED_COURSE_FIELDS` in [scripts/publish_course_data.py](../scripts/publish_course_data.py)), not at scrape. [data/](../data/) keeps the full raw data, so a field can be published again by removing it from the list once the app renders it well (see [issue #27](https://github.com/EagleZhen/another-cuhk-course-planner/issues/27)). Stripping at the publish boundary keeps the source complete while shrinking only what ships.

## Partition Course Data By Academic Year At Scrape Time

CUHK's catalog now shows 2025-26 and 2026-27 simultaneously, and will eventually drop 2025-26. Each scrape overwrites `data/<subject>.json` wholesale, so a flat layout would silently lose 2025-26 the moment CUHK stops serving it.

Decision: split each subject's courses by academic year (parsed from `term_name`) at scrape time, into `data/<year>/<subject>.json`, with dormant/no-term courses in `data/no-terms/`.

Why it fits:

- splitting at scrape, not publish, keeps `data/` itself complete and regenerable instead of flat and overwritten
- year, not term: a term freezes and thaws with its year, not on its own — splitting further would turn today's instant term switching into a network fetch, for no preservation gain
- a year freezes for free once CUHK stops serving it (a scrape only overwrites what it currently produces) — no archive step needed. `no-terms` is the exception: the subject keeps being scraped regardless, so a stale entry there has no archival meaning and is actively pruned (`partition_subject_by_year` in [scripts/data_utils.py](../scripts/data_utils.py))
