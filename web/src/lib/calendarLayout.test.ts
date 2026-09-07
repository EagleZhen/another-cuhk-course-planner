import { describe, it, expect } from 'vitest'
import { groupOverlappingEvents, assignOverlapColumns, layoutDayEvents } from './calendarLayout'
import type { CalendarEvent } from './types'

describe('day column layout', () => {
  const event = (id: string, startHour: number, endHour: number): CalendarEvent =>
    ({ id, day: 2, startHour, startMinute: 30, endHour, endMinute: 15 }) as CalendarEvent

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
    const sameTimeNextDay = { ...event('thursday', 9, 11), day: 3 }

    expect(grouped([early, sameTimeNextDay])).toEqual([['early'], ['thursday']])
  })

  it('lays out one day, with each group spanning its whole chain', () => {
    const otherDay = { ...event('other-day', 9, 11), day: 3 }
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
