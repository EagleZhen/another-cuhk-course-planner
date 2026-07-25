import { describe, expect, it } from 'vitest'
import {
  calculateReferenceCardHeight,
  getCardTextLineLimits,
  getGridColumns,
  getMinimumCalendarWidth,
  ROW_HEIGHTS,
  type CalendarDisplayConfig,
} from './calendarConfig'

const displayConfig: CalendarDisplayConfig = {
  showTitle: false,
  showTime: true,
  showLocation: true,
  showInstructor: true,
}

describe('calendar column sizing', () => {
  it('uses equal day columns with a minimum width', () => {
    expect(getGridColumns(5)).toBe('48px repeat(5, minmax(128px, 1fr))')
    expect(getGridColumns(7)).toBe('48px repeat(7, minmax(128px, 1fr))')
  })

  it('calculates when the calendar should start scrolling', () => {
    expect(getMinimumCalendarWidth(5)).toBe(688)
    expect(getMinimumCalendarWidth(7)).toBe(944)
  })
})

describe('calendar card text wrapping', () => {
  const referenceHeight = calculateReferenceCardHeight(displayConfig)

  it('keeps every field to one line when the card has no spare height', () => {
    expect(getCardTextLineLimits(referenceHeight, displayConfig)).toEqual({
      location: 1,
      instructor: 1,
    })
  })

  it('gives spare height to location before instructor', () => {
    expect(getCardTextLineLimits(referenceHeight + ROW_HEIGHTS.LOCATION, displayConfig)).toEqual({
      location: 2,
      instructor: 1,
    })
  })

  it('allows both fields to wrap when both extra lines fit', () => {
    expect(
      getCardTextLineLimits(
        referenceHeight + ROW_HEIGHTS.LOCATION + ROW_HEIGHTS.INSTRUCTOR,
        displayConfig
      )
    ).toEqual({ location: 2, instructor: 2 })
  })

  it('uses the first extra line for instructor when location is hidden', () => {
    const instructorOnly = { ...displayConfig, showLocation: false }
    const height = calculateReferenceCardHeight(instructorOnly) + ROW_HEIGHTS.INSTRUCTOR

    expect(getCardTextLineLimits(height, instructorOnly)).toEqual({
      location: 1,
      instructor: 2,
    })
  })
})
