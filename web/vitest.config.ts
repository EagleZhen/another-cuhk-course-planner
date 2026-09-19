import { defineConfig } from 'vitest/config'

// Unit tests (vitest) cover `src` and the Pages Function in `functions`. Naming
// those explicitly keeps vitest off `e2e`'s Playwright `.spec.ts` files, which
// it can't execute (`npx playwright test` runs those).
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'functions/**/*.test.ts'],
    // Pin the zone so date assertions don't vary by machine. Neither Hong Kong
    // nor UTC: the export converts HKT to UTC, so under either of those zones
    // code confusing the local zone with one of them would still pass.
    env: { TZ: 'America/Chicago' },
  },
})
