import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// Each page serves its own frozen export through routes on this identical origin.
export default defineConfig({
  ...base,
  testMatch: 'historical-schedule.spec.ts',
  testIgnore: [],
  workers: 2,
  use: { ...base.use, baseURL: 'http://127.0.0.1:3014' },
  webServer: undefined,
})
