import { describe, expect, it } from 'vitest'
import { getGridColumns, getMinimumCalendarWidth } from './calendarConfig'

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
