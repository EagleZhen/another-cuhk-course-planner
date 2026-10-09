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

Use [`mockCatalog`](helpers/catalog.ts) with external course records keyed by `year/subject`; unspecified subjects return empty courses. Empty catalogs preserve seeded carts; a course offering the selected term enables reconciliation.

After navigation or reload, use `expectEmptyCatalogLoaded(page)` for empty fixtures. Populated fixtures should wait for their expected results.

`setFixedTime()` fixes the date but leaves timers running, so it does not prevent expiry races.

Note: Playwright's WebKit is not real Safari.app and does not reproduce every Safari-specific rendering quirk. For those, test in real Safari (`safaridriver`) or a device cloud.
