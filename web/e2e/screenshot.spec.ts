import { expect, test } from '@playwright/test'
import { stat } from 'node:fs/promises'

test('downloads the timetable as a PNG', async ({ page }) => {
  await page.route('**/data/**', (route) => route.abort())
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
