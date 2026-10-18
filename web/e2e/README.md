# End-to-end tests (Playwright)

Playwright specs live here. Run them with `npx playwright test` (not `npm test`, which is vitest for unit tests).

Config: [`../playwright.config.ts`](../playwright.config.ts) — Chromium and WebKit. CI uses the static export to avoid development compilation; ordinary local runs use the dev server.

To reproduce production mode locally, run from `web/`:

```bash
npm run build
PLAYWRIGHT_PRODUCTION=1 npx playwright test
```

Production mode requires port 3000 to be free; server reuse could silently test the wrong app.

Each CI browser job builds independently to avoid waiting for a shared build and artifact download.

Retries stay off to keep intermittent failures visible. Extract `playwright-results-<browser>`, then run `npx playwright show-report <download-dir>/playwright-report` to inspect a failure and its trace.

Use [`mockCatalog`](helpers/catalog.ts) with external course records keyed by `year/subject`; unspecified subjects return empty courses. Empty catalogs preserve seeded carts; a course offering the selected term enables reconciliation.

For term-specific fixtures, seed storage in the spec, then call [`openPlannerAtTerm(page, { term, catalog })`](helpers/planner.ts). It selects the fixture year and term before releasing catalog responses, preventing the initial default from synchronizing another cart. Use `selectTerm(page, term)` for later switches. After reloading an empty fixture, select its term again; populated fixtures also need the startup response barrier. Leave ordinary startup tests on the configured default.

Course records are mocked; available years, terms, subjects, and scrape timestamps still come from generated manifests. Keep fixture subjects published and retain the unit checks against real published data for schema compatibility. A full catalog copy would not remove this metadata dependency.

After navigation or reload, use `expectEmptyCatalogLoaded(page)` for empty fixtures. Populated fixtures should wait for their expected results.

`setFixedTime()` fixes the date but leaves timers running, so it does not prevent expiry races.

Note: Playwright's WebKit is not real Safari.app and does not reproduce every Safari-specific rendering quirk. For those, test in real Safari (`safaridriver`) or a device cloud.
