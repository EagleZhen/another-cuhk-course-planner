# End-to-end tests (Playwright)

Playwright specs live here. Run them with `npx playwright test` (not `npm test`, which is vitest for unit tests).

Config: [`../playwright.config.ts`](../playwright.config.ts) — Chromium and WebKit. CI uses the static export to avoid development compilation; ordinary local runs use the dev server.

To reproduce production mode locally, run from `web/`:

```bash
npm run build
PLAYWRIGHT_PRODUCTION=1 npx playwright test
```

Production mode requires port 3000 to be free; server reuse could silently test the wrong app.

CI runs on PRs and pushes to main. Chromium uses `npm run check:source-maps` to cover PostHog build processing; WebKit uses the ordinary `npm run build`. Each tests its resulting export.

Retries stay off to keep intermittent failures visible. Extract `playwright-results-<browser>`, then run `npx playwright show-report <download-dir>/playwright-report` to inspect a failure and its trace.

Use [`mockCatalog`](helpers/catalog.ts) with external course records keyed by `year/subject`; unspecified subjects return empty courses. Empty catalogs preserve seeded carts; a course offering the selected term enables reconciliation.

Seed storage in the spec, then open term-specific fixtures with [`openPlannerAtTerm(page, { term, catalog })`](helpers/planner.ts). It delays catalog responses until selection to prevent the default term from synchronizing another cart. Use `selectTerm(page, term)` for later switches or after reload; populated fixtures need the response barrier again on reload. Leave startup tests on the configured default.

Mocks replace course records only; years, terms, subjects, and scrape times still come from generated manifests. Fixture years, terms, and subjects must remain available there. Retain real-data unit tests for schema compatibility.

After navigation or reload, use `expectEmptyCatalogLoaded(page)` for empty fixtures. Populated fixtures should wait for their expected results.

`setFixedTime()` fixes the date but leaves timers running, so it does not prevent expiry races.

Note: Playwright's WebKit is not real Safari.app and does not reproduce every Safari-specific rendering quirk. For those, test in real Safari (`safaridriver`) or a device cloud.

Storage fixtures seed legacy localStorage once per browser session; adoption copies them to IndexedDB. Assert saves with [`readSavedEnrollments`](helpers/schedule.ts), which reads canonical records through the real payload codec. Never fall back to legacy data in a save assertion or reseed missing data on reload.

Storage-safety specs audit every attempted legacy write/removal. Transaction specs exercise native IndexedDB aborts, competing revisions, adoption, and connection changes in both browsers. Assert authoritative records and downloaded contents: eventual correct UI can conceal a destructive intermediate write. Historical/current-build coexistence is separate coverage; these specs run the current build.

## Historical storage compatibility

Run from `web/`:

```bash
npm run build
npm run build:historical-schedules
npm run test:compat
```

This separate suite freezes two peers: `7c32e3dc` (numeric credits) and `af450c31` (range credits, unsafe legacy writer). The builder archives their pinned Git sources and installs each lockfile separately. Missing commits are fetched from `origin`; HEAD stays unchanged. Exports live in ignored `.cache/schedule-compat/`; removing that directory rebuilds them. The fixture manifest identifies the source revision; analytics build IDs can inherit the enclosing checkout’s identity.

Per-page routes serve each production export on the same origin, including later asset requests. Tabs share real browser storage and retain different JavaScript. No HMR or real analytics requests are involved. Carts come from the historical Add flow, without storage seeding.

The baseline proves deletion and the credits crash. Protected cases verify old reentry, edits, and clearing cannot change an adopted cart or resurrect an intentionally empty one. Reload does not reseed. CI runs both suites in Chromium and WebKit; ordinary E2E runs exclude the historical suite.
