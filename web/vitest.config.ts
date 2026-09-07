import { defineConfig } from 'vitest/config'

// Unit tests (vitest) live in `src`; end-to-end tests (Playwright) live in `e2e`
// and run via `npx playwright test`. Scoping vitest to `src` keeps it from
// picking up Playwright's `.spec.ts` files, which it can't execute.
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Pin the zone so date assertions don't vary by machine. Neither Hong Kong
    // nor UTC: the export converts HKT to UTC, so under either of those zones
    // code confusing the local zone with one of them would still pass.
    env: { TZ: 'America/Chicago' },
  },
})
