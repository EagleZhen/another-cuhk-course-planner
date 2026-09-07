import { describe, expect, it } from 'vitest'
import {
  calculateReferenceCardHeight,
  getCardStackPlacement,
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

describe('conflict card stacking', () => {
  const stack = (groupSize: number) =>
    Array.from({ length: groupSize }, (_, index) => getCardStackPlacement(index, groupSize, false))

  // Inverted, the buried cards would show blank right edges instead.
  it('puts the last card of a stack on top', () => {
    expect(stack(3).map((placement) => placement.zIndex)).toEqual([20, 21, 22])
  })

  it('fans the cards rightwards at one shared width', () => {
    expect(stack(3).map((placement) => placement.leftOffset)).toEqual([0, 16, 32])
    expect(stack(3).map((placement) => placement.rightOffset)).toEqual([32, 16, 0])
  })

  it('leaves a card with no overlap flush and unstacked', () => {
    expect(getCardStackPlacement(0, 1, false)).toEqual({
      leftOffset: 0,
      rightOffset: 0,
      zIndex: 10,
    })
  })

  it('raises a selected card above the stack it is buried in', () => {
    const selected = getCardStackPlacement(0, 3, true)

    expect(selected.zIndex).toBeGreaterThan(stack(3)[2].zIndex)
    // Still below the sticky header.
    expect(selected.zIndex).toBeLessThan(50)
  })
})
