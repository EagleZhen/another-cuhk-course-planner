import { describe, expect, it } from 'vitest'
import { getScreenshotCaptureHeight, getScreenshotContentWidth } from './screenshotUtils'

describe('screenshot content width', () => {
  it('uses the screenshot floor for a five-day calendar', () => {
    expect(getScreenshotContentWidth(688)).toBe(800)
  })

  it('keeps a wider seven-day calendar at its minimum width', () => {
    expect(getScreenshotContentWidth(944)).toBe(944)
  })
})

describe('screenshot capture height', () => {
  it('keeps the timetable bottom edge inside the capture area', () => {
    expect(getScreenshotCaptureHeight(640)).toBe(641)
  })
})
