import { defineConfig } from 'vitest/config'

// Unit tests (vitest) live in `src`; end-to-end tests (Playwright) live in `e2e`
// and run via `npx playwright test`. Scoping vitest to `src` keeps it from
// picking up Playwright's `.spec.ts` files, which it can't execute.
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
