import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// STALE_CHUNK_RELOAD_KEY in src/lib/constants.ts, which error.tsx sets before reloading.
const storageKey = 'stale-chunk-reloaded'

const notice = (page: Page) => page.locator('[data-stale-version-notice]')

// Client-rendered once the aborted fetches below fail, so it proves hydration ran. An
// absence check against un-hydrated server HTML would otherwise pass for the wrong reason.
const hydrated = (page: Page) => page.getByText('failed to load due to a network error')

async function open(page: Page) {
  await page.route('**/data/**', (route) => route.abort())
  await page.goto('/')
  await expect(hydrated(page)).toBeVisible()
}

// Replays what error.tsx does: set the flag, then reload.
async function reloadAsStaleChunkRecovery(page: Page) {
  await page.evaluate((key) => sessionStorage.setItem(key, '1'), storageKey)
  await page.reload()
}

test('explains the refresh after a stale-chunk reload', async ({ page }) => {
  await open(page)
  await expect(notice(page)).toHaveCount(0)

  await reloadAsStaleChunkRecovery(page)
  await expect(notice(page)).toBeVisible()
})

test('dismisses, and does not come back on the next load', async ({ page }) => {
  await open(page)
  await reloadAsStaleChunkRecovery(page)
  await notice(page).getByRole('button', { name: 'Dismiss' }).click()
  await expect(notice(page)).toHaveCount(0)

  // Dismissing clears the flag, so a later load has nothing left to explain.
  await page.reload()
  await expect(hydrated(page)).toBeVisible()
  await expect(notice(page)).toHaveCount(0)
})
