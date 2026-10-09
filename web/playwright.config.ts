import { defineConfig, devices } from '@playwright/test'

const isCI = Boolean(process.env.CI)
const isProduction = isCI || process.env.PLAYWRIGHT_PRODUCTION === '1'
const serverURL = 'http://127.0.0.1:3000'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: isCI ? 2 : undefined,
  // A committed `test.only` would leave CI green having run one test.
  forbidOnly: isCI,
  retries: 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: serverURL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: isProduction ? 'npm run start' : 'npm run dev',
    url: serverURL,
    reuseExistingServer: !isProduction,
    env: { NO_UPDATE_CHECK: '1' },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
