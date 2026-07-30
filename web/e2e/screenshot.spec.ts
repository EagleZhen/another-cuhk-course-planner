import { expect, test } from '@playwright/test'
import { stat } from 'node:fs/promises'

test.beforeEach(async ({ page }) => {
  await page.route('**/data/**', (route) => route.abort())
})

test('downloads the timetable as a PNG', async ({ page }) => {
  await page.goto('/')

  const screenshotButton = page.getByRole('button', { name: 'Screenshot' })
  const downloadPromise = page.waitForEvent('download')

  await screenshotButton.click()

  const download = await downloadPromise
  const downloadPath = await download.path()

  expect(download.suggestedFilename()).toMatch(
    /^2026-27-Term-1-Schedule-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.png$/
  )
  expect(downloadPath).not.toBeNull()
  expect((await stat(downloadPath!)).size).toBeGreaterThan(0)
  await expect(screenshotButton).toHaveText('Screenshot')
})

test('shows an error and allows another screenshot attempt', async ({ page }) => {
  await page.addInitScript(() => {
    const originalToBlob = HTMLCanvasElement.prototype.toBlob
    HTMLCanvasElement.prototype.toBlob = function (callback) {
      HTMLCanvasElement.prototype.toBlob = originalToBlob
      callback(null)
    }
  })
  await page.goto('/')

  const screenshotButton = page.getByRole('button', { name: 'Screenshot' })
  const screenshotAlert = page
    .getByRole('alert')
    .filter({ hasText: 'Couldn’t create the screenshot.' })
  await screenshotButton.click()

  await expect(screenshotAlert).toHaveText('Couldn’t create the screenshot. Please try again.')

  const downloadPromise = page.waitForEvent('download')
  await screenshotButton.click()
  await downloadPromise

  await expect(screenshotAlert).toHaveCount(0)
  await expect(screenshotButton).toHaveText('Screenshot')
})
