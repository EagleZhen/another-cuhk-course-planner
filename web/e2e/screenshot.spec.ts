import { expect, test } from '@playwright/test'
import { readFile, stat } from 'node:fs/promises'

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

  // Width is minContentWidth (800) plus padding on both sides (2x50), at canvas scale 2.
  // Pins the side margins to `padding`: a canvas-width floor above that silently widens them.
  const png = await readFile(downloadPath!)
  expect(png.readUInt32BE(16)).toBe(1800)
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

// Firefox 146/Android reported `undefined` from the `font-family` reflection on an
// @font-face rule, which threw inside the rasterizer and killed the export. No engine
// Playwright ships does that, so the quirk is injected rather than waited for.
test('exports when the font-family reflection yields undefined', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(CSSStyleDeclaration.prototype, 'fontFamily', {
      configurable: true,
      get: () => undefined,
    })
  })
  await page.goto('/')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Screenshot' }).click()

  expect((await stat((await (await downloadPromise).path())!)).size).toBeGreaterThan(0)
})
