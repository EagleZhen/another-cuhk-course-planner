import { describe, it, expect } from 'vitest'
import {
  groupOverlappingEvents,
  assignOverlapColumns,
  layoutDayEvents,
  startOfWeek,
  weekRange,
  defaultWeek,
  eventsInWeek,
} from './calendarLayout'
import type { CalendarEvent } from './types'

describe('day column layout', () => {
  // Week of Monday 7 September 2026, so a card's date matches its day index.
  const dayOf = (day: number) => new Date(2026, 8, 7 + day)
  const event = (id: string, startHour: number, endHour: number, day = 2): CalendarEvent =>
    ({
      id,
      day,
      date: dayOf(day),
      startHour,
      startMinute: 30,
      endHour,
      endMinute: 15,
    }) as CalendarEvent

  // A chain: the 9:30 and 11:30 classes miss each other but both hit the 10:30 one.
  const early = event('early', 9, 11)
  const middle = event('middle', 10, 12)
  const late = event('late', 11, 13)

  const grouped = (events: CalendarEvent[]) =>
    groupOverlappingEvents(events).map((group) => group.map((member) => member.id).sort())

  it('groups a chain of overlaps whatever order the cards arrive in', () => {
    for (const order of [
      [early, middle, late],
      [late, middle, early],
      [middle, early, late],
    ]) {
      expect(grouped(order)).toEqual([['early', 'late', 'middle']])
    }
  })

  it('keeps cards that never overlap in separate groups', () => {
    const apart = event('apart', 14, 16)

    expect(grouped([early, middle, apart])).toEqual([['early', 'middle'], ['apart']])
  })

  it('gives a chain two columns, so the ends share the left edge', () => {
    const columns = assignOverlapColumns([early, middle, late])

    expect([...columns]).toEqual([
      ['early', 0],
      ['middle', 1],
      ['late', 0],
    ])
  })

  it('gives every simultaneous card its own column', () => {
    const alsoEarly = event('also-early', 9, 11)
    const columns = assignOverlapColumns([early, middle, alsoEarly])

    expect([...columns.values()].sort()).toEqual([0, 1, 2])
  })

  it('never groups across days', () => {
    const sameTimeNextDay = event('thursday', 9, 11, 3)

    expect(grouped([early, sameTimeNextDay])).toEqual([['early'], ['thursday']])
  })

  it('lays out one day, with each group spanning its whole chain', () => {
    const otherDay = event('other-day', 9, 11, 3)
    const apart = event('apart', 14, 16)

    const groups = layoutDayEvents([early, middle, late, apart, otherDay], 2)

    expect(groups).toEqual([
      {
        events: [
          { event: early, column: 0 },
          { event: middle, column: 1 },
          { event: late, column: 0 },
        ],
        columnCount: 2,
        startMinutes: 9 * 60 + 30,
        endMinutes: 13 * 60 + 15,
      },
      {
        events: [{ event: apart, column: 0 }],
        columnCount: 1,
        startMinutes: 14 * 60 + 30,
        endMinutes: 16 * 60 + 15,
      },
    ])
  })
})

describe('weeks', () => {
  const on = (date: Date): CalendarEvent => ({ id: date.toDateString(), date }) as CalendarEvent

  const SEP_7 = new Date(2026, 8, 7) // Monday
  const SEP_21 = new Date(2026, 8, 21)
  const OCT_5 = new Date(2026, 9, 5)

  it('starts a week on Monday, whatever day it is given', () => {
    expect(startOfWeek(new Date(2026, 8, 7))).toEqual(SEP_7)
    expect(startOfWeek(new Date(2026, 8, 13))).toEqual(SEP_7) // the Sunday
  })

  // A gap week stays in the range: an empty week is a fact, not a week to skip.
  it('spans first to last occurrence without skipping an empty week', () => {
    const weeks = weekRange([on(new Date(2026, 8, 9)), on(new Date(2026, 9, 7))])

    expect(weeks).toEqual([SEP_7, new Date(2026, 8, 14), SEP_21, new Date(2026, 8, 28), OCT_5])
    expect(weekRange([])).toEqual([])
  })

  it('lands on today, clamped to the range at either end', () => {
    const weeks = [SEP_7, SEP_21]

    expect(defaultWeek(weeks, new Date(2026, 7, 1))).toEqual(SEP_7) // before
    expect(defaultWeek(weeks, new Date(2026, 8, 23))).toEqual(SEP_21) // inside
    expect(defaultWeek(weeks, new Date(2027, 0, 1))).toEqual(SEP_21) // after
    expect(defaultWeek([], new Date(2026, 8, 23))).toBeNull()
  })

  it('picks the seven days from the week start', () => {
    const inside = on(new Date(2026, 8, 13)) // the Sunday
    const outside = on(new Date(2026, 8, 14)) // the next Monday

    expect(eventsInWeek([on(SEP_7), inside, outside], SEP_7)).toEqual([on(SEP_7), inside])
  })
})
