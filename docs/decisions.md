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

- Cloudflare's static-asset request and bandwidth model suits a static frontend, with a generous free tier
- deployment stays aligned with the frontend-only/static architecture

Caveat (since resolved): this only holds once the site is a true static export. The original `@cloudflare/next-on-pages` setup routed every request through a Worker, so the ~400-file course-data fan-out was billed as Function requests — nearly the opposite of the static-asset model this rationale assumed. See [Static Export Over The next-on-pages Adapter](#static-export-over-the-next-on-pages-adapter).

## Static Export Over The next-on-pages Adapter

`@cloudflare/next-on-pages` (now deprecated) generated a worker-first `_routes.json` (`include: ["/*"]`, excluding only `/_next/static/*`), so nearly every request invoked the Worker. The ~400 `public/data/<year>/*.json` files eager-loaded each session were billed as Function requests, hitting ~78% of the 100k/day free limit during add-drop. Caching didn't help — the quota counts requests, not bytes, so even `304` revalidations were billed.

Decision: migrate to static export (`output: 'export'`). Cloudflare then serves assets first, so HTML, data, and images are free; only the PostHog `/x8m2k/*` proxy stays a Function.

Why it fits:

- makes the [Cloudflare Pages rationale](#cloudflare-pages-over-vercel) true — the catalog is served as static assets, not billed Function requests
- drops a deprecated dependency and the `legacy-peer-deps` workaround it required

Invariant: never route the course catalog through a Function. A `middleware.ts`, a `rewrites()`/`headers()` rule on data paths, or a dashboard misconfig would silently re-bill it at ~10× cost while the app still works. [#178](https://github.com/EagleZhen/another-cuhk-course-planner/issues/178) tracks automated guards.

Tradeoffs:

- no SSR or middleware (fine — the app is frontend-only anyway)
- `next/image` ships unoptimized (`images.unoptimized`) without a server
- the proxy moved from a `next.config` rewrite to a Function (`web/functions/x8m2k/[[path]].ts`), kept single-host (assets-host split is [#177](https://github.com/EagleZhen/another-cuhk-course-planner/issues/177))

## PostHog Over Vercel Analytics

Vercel Analytics was too limited for this project's free-plan analytics needs, especially around date ranges, breakdowns, and event analysis.

Decision: use PostHog for product analytics.

Why it fits:

- PostHog gives more useful ways to understand how students use planner features
- flexible breakdowns and date ranges are more useful than Vercel Analytics for current product questions

Where:

- analytics initializes in [web/src/instrumentation-client.ts](../web/src/instrumentation-client.ts)
- event helpers live in [web/src/lib/analytics.ts](../web/src/lib/analytics.ts)

## Keep Volatile Text Out Of Prerendered HTML

A formatted date/time in the static export is a magnet for anything that rewrites text before React hydrates — timezone drift (build renders UTC, browser renders local), iOS data detectors, page translation, extensions — and each mismatch is a hydration error (React #418). The app is prerendered but almost entirely client-rendered, so such text buys little and risks this.

Decision: keep volatile, rewritable text out of the prerendered HTML. The "Last Data Sync" time renders only after mount (a brief "Loading…" ships instead); its formatter is also timezone-pinned so our own output is deterministic.

Why it fits:

- removes the whole class at once — detectors and translators get nothing to act on, rather than patching each cause
- the gate looks removable but isn't; deleting it reopens #418

Where:

- render gate in [web/src/components/CourseSearch.tsx](../web/src/components/CourseSearch.tsx), timezone pin in `formatSyncTimestamp` ([web/src/lib/courseUtils.ts](../web/src/lib/courseUtils.ts))

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

Dependabot cannot see `.nvmrc`, so bump it by hand when a new 24.x LTS lands.

## Hold ESLint At v9

ESLint v10 removed `context.getFilename()`, which `eslint-plugin-react` still calls, so `npm run lint` crashes outright. The plugin has no v10-compatible release, and `eslint-config-next` depends on it anyway — its own `eslint: >=9.0.0` peer range overpromises.

Decision: hold `eslint` at `^9` in [web/package.json](../web/package.json).

Lift once `eslint-config-next` ships a v10-compatible `eslint-plugin-react`. Dependabot keeps proposing the major regardless; CI now fails it.

## Leave Python Dependencies Uncapped

Dependabot updates `uv.lock` within an upper cap but never proposes widening one, so a capped release arrives as silence — `<2026.0` blocked every 2026 `tzdata` release.

Decision: no upper caps in [pyproject.toml](../pyproject.toml). `uv.lock` pins exact versions and CI runs ruff and pytest on every pull request, so a major arrives as a PR to review rather than as nothing at all.

This is an application (`package = false`); a library, whose caps become its consumers' problem, would weigh it differently.

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

## Generate Data Manifests, Keep The Default Term By Hand

The app needs subject and term indexes that stay aligned with the published yearly data. Maintaining either index by hand creates a second source of truth.

Decision: after source validation, publish generates `subjects.ts` and `terms.ts` in [web/src/lib/generated/](../web/src/lib/generated/). The default term (`DEFAULT_CURRENT_TERM` in [constants.ts](../web/src/lib/constants.ts)) stays hand-set.

Why it fits:

- validated yearly data is authoritative; using an older generated file as a validation gate would duplicate state and block expected additions
- generation runs after validation, and dry runs do not write manifests
- publish warns when either manifest changes so its Git diff remains part of data review
- which term is "current" isn't in the data — the terms aren't a timeline (Term 3/4 postgraduate; Summer, Medicine special) — so it stays a human call.
- no fallback for a stale default: it would hide the mistake and force an arbitrary pick. A test ([constants.test.ts](../web/src/lib/constants.test.ts)) fails if the default isn't a generated term.

Limitation: bump `DEFAULT_CURRENT_TERM` by hand on rollover; the test catches a stale one.

## Stamp Each Data Directory With Its Scrape Time

Each course file used to carry its own `scraped_at`. Since a scrape rewrites every file, ~90% of the files in a scrape commit differed only by that timestamp (883 of 969 in `5ff71fd8`), burying the real course changes.

Decision: drop the per-file timestamp. A full scrape writes `data/<dir>/_scraped_at.txt`, and publishing reads those into `scrape-times.ts` for the app.

Why it fits:

- one timestamp per directory instead of ~900 per scrape, so a data diff shows course changes
- **per directory, not per subject**: a scrape only writes the years CUHK still serves, so a dropped year's timestamp freezes with its data. Anything derived from per-subject times (`last_scraped`, or the run's start) keeps advancing instead, because those subjects are still scraped for the live year — it would advertise frozen data as fresh
- full runs only: a partial scrape can't speak for the subjects it never touched, so it leaves the stamps alone and stays pessimistic
- a build-time constant, not another fetch: data and code deploy together, and the app already generates `subjects.ts` / `terms.ts` this way. The module stays purely derived, so deleting `generated/` and re-publishing round-trips

Watchouts:

- `schema_version` gates the file shape at publish, but stays optional in the app's Zod schema: a tab open across a deploy can fetch data from a different version, and that must degrade rather than fail to load
- freshness is not completeness — see [Data Pipeline](data-pipeline.md#freshness)
- enrollment counters still churn every scrape, so diffs are quieter, not quiet

## Save Each Subject Immediately

A full scrape covers ~260 subjects over ~10 hours. Accumulating every course in memory until the end risks losing the entire run to one crash.

Decision: write each subject's files as soon as it finishes, then `del` its courses and force a `gc.collect()` before the next one (`scrape_all_subjects` in [scripts/cuhk_scraper.py](../scripts/cuhk_scraper.py)).

Why it fits:

- a crash costs the remaining time, not the results: finished subjects are already written, and their previous data stays valid until a later run overwrites it
- peak memory stays flat in the number of subjects instead of growing across the run
- the progress log records what each subject produced and when, which is what publishing validates against

Limitation: a re-run rescrapes every subject it is given — there is no skip-completed resume.

## Eager Current Year, Lazy Archived Years

`CURRENT_ACADEMIC_YEAR` (from `DEFAULT_CURRENT_TERM`) is the single knob for the live year. The app eager-loads it at startup and fetches other years only when selected; a non-live year shows a persistent "archived, for reference only" bar.

Why it fits:

- archived years are worth keeping (last year's catalog predicts next year's, which CUHK hides at rollover) but rarely opened — so fetch on demand, not upfront.
- the reference bar and one-click return keep a frozen year from being mistaken for the live one and edited by accident.
- deriving the live year from `DEFAULT_CURRENT_TERM` makes rollover a single edit that flips both the eager year and the archived set.
