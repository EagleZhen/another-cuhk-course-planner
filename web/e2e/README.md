# End-to-end tests (Playwright)

Playwright specs live here. Run them with `npx playwright test` (not `npm test`, which is vitest for unit tests).

Config: [`../playwright.config.ts`](../playwright.config.ts) — runs against `npm run dev` on `:3000`, projects for Chromium and WebKit.

Note: Playwright's WebKit is not real Safari.app and does not reproduce every Safari-specific rendering quirk. For those, test in real Safari (`safaridriver`) or a device cloud.
