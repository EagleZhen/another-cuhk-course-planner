import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const notice = (page: Page) => page.locator('[data-stale-version-notice]')

// Client-rendered once the aborted fetches below fail, so it proves hydration ran. An
// absence check against un-hydrated server HTML would otherwise pass for the wrong reason.
const hydrated = (page: Page) => page.getByText('failed to load due to a network error')

// `recovered` lands on the URL a recovery navigates to.
async function open(page: Page, { recovered = false } = {}) {
  await page.route('**/data/**', (route) => route.abort())
  await page.goto(recovered ? '/?refreshed=1' : '/')
  await expect(hydrated(page)).toBeVisible()
}

// A chunk error no boundary sees. From a timeout, so the evaluate returns before the
// recovery navigates. `marked` re-adds the `?refreshed=1` marker just before the throw: the
// mounted notice strips it, so a test needing a still-marked page (a recovery that landed on
// a broken target) has to restore it.
async function throwChunkLoadError(page: Page, path: EscapedPath, { marked = false } = {}) {
  await page.evaluate(
    ({ path, marked }) => {
      setTimeout(() => {
        if (marked) window.history.replaceState(null, '', '/?refreshed=1')
        const error = new Error('Loading chunk 123 failed.')
        error.name = 'ChunkLoadError'
        if (path === 'unhandledrejection') void Promise.reject(error)
        else window.dispatchEvent(new ErrorEvent('error', { error }))
      })
    },
    { path, marked }
  )
}

// Stands in for posthog's autocapture, which registers after the recovery listener and
// wraps each path separately. Session storage, because the recovery navigates away.
async function watchForReports(page: Page) {
  await page.evaluate(() => {
    for (const path of ['error', 'unhandledrejection']) {
      window.addEventListener(path, () => sessionStorage.setItem('reported', '1'))
    }
  })
}

const reported = (page: Page) => page.evaluate(() => sessionStorage.getItem('reported'))

// Both paths run the same recovery; they differ in which property carries the error.
type EscapedPath = 'error' | 'unhandledrejection'

for (const path of ['error', 'unhandledrejection'] as EscapedPath[]) {
  test(`recovers an escaped chunk error, and reports one it cannot (${path})`, async ({ page }) => {
    await open(page)
    await watchForReports(page)
    await throwChunkLoadError(page, path)
    await expect(notice(page)).toBeVisible()
    expect(await reported(page)).toBeNull()

    // The marker still on the URL means a recovery already landed here and failed again:
    // recovering once more is the loop, so this one is worth reporting.
    await watchForReports(page)
    await throwChunkLoadError(page, path, { marked: true })
    await expect.poll(() => reported(page)).toBe('1')
  })
}

// A stale document reappears unmarked (bfcache, back/forward, a restored tab): the same
// build we just recovered from, but with no marker recovery must fire again, not give up.
test('recovers again when the stale document reappears unmarked', async ({ page }) => {
  await open(page)
  await throwChunkLoadError(page, 'error')
  await expect(notice(page)).toBeVisible()

  // The notice stripped the marker, so the page is now unmarked, as a resurrected one is.
  // Dismiss it so its return proves the second recovery navigated rather than lingered.
  await notice(page).getByRole('button', { name: 'Dismiss' }).click()
  await watchForReports(page)
  await throwChunkLoadError(page, 'error')
  await expect(notice(page)).toBeVisible()
  expect(await reported(page)).toBeNull()
})

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

  await page.reload()
  await expect(hydrated(page)).toBeVisible()
  await expect(notice(page)).toHaveCount(0)
})

// The marker is stripped on arrival, so it cannot be reloaded from or shared onward —
// MobileDesktopNotice hands window.location.href straight to the share sheet.
test('drops the marker from the URL on arrival', async ({ page }) => {
  await open(page, { recovered: true })
  await expect(notice(page)).toBeVisible()
  expect(new URL(page.url()).searchParams.has('refreshed')).toBe(false)

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
