import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const notice = (page: Page) => page.locator('[data-stale-version-notice]')

// Client-rendered once the aborted fetches below fail, so it proves hydration ran. An
// absence check against un-hydrated server HTML would otherwise pass for the wrong reason.
const hydrated = (page: Page) => page.getByText('failed to load due to a network error')

// `recovered` lands on the URL error.tsx navigates to when it recovers.
async function open(page: Page, { recovered = false } = {}) {
  await page.route('**/data/**', (route) => route.abort())
  await page.goto(recovered ? '/?refreshed=1' : '/')
  await expect(hydrated(page)).toBeVisible()
}

test('explains the refresh after a stale-chunk reload', async ({ page }) => {
  await open(page)
  await expect(notice(page)).toHaveCount(0)

  await open(page, { recovered: true })
  await expect(notice(page)).toBeVisible()
})

test('dismisses, and does not come back on the next load', async ({ page }) => {
  await open(page, { recovered: true })
  await notice(page).getByRole('button', { name: 'Dismiss' }).click()
  await expect(notice(page)).toHaveCount(0)

  // Dismissing strips the marker from the URL, so a reload has nothing left to explain.
  await page.reload()
  await expect(hydrated(page)).toBeVisible()
  await expect(notice(page)).toHaveCount(0)
})

// Both the notice and the feedback button are fixed to the bottom edge, and on a phone
// the notice is nearly full width — so they collided until the notice moved up.
test('clears the feedback button on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await open(page, { recovered: true })
  await expect(notice(page)).toBeVisible()

  const box = (await notice(page).boundingBox())!
  const feedback = (await page
    .getByTitle('Share feedback about this course planner')
    .boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(feedback.y)
})
