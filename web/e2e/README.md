# End-to-end tests (Playwright)

Playwright specs live here. Run them with `npx playwright test` (not `npm test`, which is vitest for unit tests).

Config: [`../playwright.config.ts`](../playwright.config.ts) — runs against `npm run dev` on `:3000`, projects for Chromium and WebKit.

Use [`mockCatalog`](helpers/catalog.ts) with external course records keyed by `year/subject`; unspecified subjects return empty courses. Empty catalogs preserve seeded carts; a course offering the selected term enables reconciliation.

After navigation or reload, use `expectEmptyCatalogLoaded(page)` for empty fixtures. Populated fixtures should wait for their expected results.

Note: Playwright's WebKit is not real Safari.app and does not reproduce every Safari-specific rendering quirk. For those, test in real Safari (`safaridriver`) or a device cloud.
