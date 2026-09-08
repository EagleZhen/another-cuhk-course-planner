import { describe, it, expect } from 'vitest'
import {
  groupOverlappingEvents,
  assignOverlapColumns,
  layoutDayEvents,
  startOfWeek,
  weekRange,
  defaultWeek,
  eventsInWeek,
  distinctWeeks,
  changedEventIds,
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

describe('what changes between weeks', () => {
  const MON = (week: number) => new Date(2026, 8, 7 + week * 7)
  const card = (
    week: number,
    section: string,
    location = 'LSK 101',
    time = 'Mo 9:30AM - 11:15AM'
  ): CalendarEvent =>
    ({
      id: `${section}-${time.slice(0, 2)}-${week}`,
      date: MON(week),
      enrollmentId: 'GEWS1011',
      sectionCode: section,
      time,
      location,
      instructors: 'Staff',
    }) as CalendarEvent

  it('stops only at weeks that differ from the one before', () => {
    // Same lecture for three weeks, then the room moves, then back.
    const events = [card(0, 'LEC'), card(1, 'LEC'), card(2, 'LEC', 'YIA 404'), card(3, 'LEC')]

    expect(distinctWeeks(events, [MON(0), MON(1), MON(2), MON(3)])).toEqual([
      MON(0),
      MON(2),
      MON(3),
    ])
  })

  it('treats a uniform cart as a single stop', () => {
    const events = [card(0, 'LEC'), card(1, 'LEC'), card(2, 'LEC')]

    expect(distinctWeeks(events, [MON(0), MON(1), MON(2)])).toEqual([MON(0)])
  })

  it('marks a section starting or changing, and nothing in the first week', () => {
    const events = [card(0, 'LEC'), card(1, 'LEC'), card(1, 'TUT'), card(2, 'LEC', 'YIA 404')]

    expect(changedEventIds(events, MON(0))).toEqual(new Set())
    expect(changedEventIds(events, MON(1))).toEqual(new Set(['TUT-Mo-1']))
    expect(changedEventIds(events, MON(2))).toEqual(new Set(['LEC-Mo-2']))
  })

  // GEWS1011: one lecture, two weeks, two buildings. Whichever week you arrive
  // at, the room differs from the one you left, so both directions mark it.
  it('marks a room change from either direction', () => {
    const events = [card(0, 'LEC'), card(1, 'LEC', 'YIA 404')]

    expect(changedEventIds(events, MON(1), MON(0))).toEqual(new Set(['LEC-Mo-1']))
    expect(changedEventIds(events, MON(0), MON(1))).toEqual(new Set(['LEC-Mo-0']))
  })

  it('marks nothing in the first week reached without a previous one', () => {
    const events = [card(0, 'LEC'), card(1, 'LEC', 'YIA 404')]

    expect(changedEventIds(events, MON(0))).toEqual(new Set())
  })

  it('marks nothing in a week that would be skipped', () => {
    const events = [card(0, 'LEC'), card(1, 'LEC')]

    expect(distinctWeeks(events, [MON(0), MON(1)])).toEqual([MON(0)])
    expect(changedEventIds(events, MON(1))).toEqual(new Set())
  })

  // A holiday week is still a stop, but coming back from it is not a change.
  it('marks nothing when a section resumes unchanged after a break', () => {
    const events = [card(0, 'LEC'), card(2, 'LEC')]

    expect(distinctWeeks(events, [MON(0), MON(1), MON(2)])).toEqual([MON(0), MON(1), MON(2)])
    // Arrived at from the empty week between, or from the week before that.
    expect(changedEventIds(events, MON(2), MON(1))).toEqual(new Set())
    expect(changedEventIds(events, MON(2), MON(0))).toEqual(new Set())
  })

  // ELTU1001 DAC1-CLW meets twice a week; only the Thursday pauses for a holiday.
  // The section is still present via its Tuesday class, so comparing by section
  // rather than by slot made the Thursday's return look like a change to it.
  it("marks nothing when one of a section's two weekly meetings resumes", () => {
    const tuesday = (week: number) => card(week, 'CLW', 'LSK 101', 'Tu 9:30AM - 10:15AM')
    const thursday = (week: number) => card(week, 'CLW', 'LSK 101', 'Th 10:30AM - 12:15PM')
    const events = [tuesday(0), thursday(0), tuesday(1), tuesday(2), thursday(2)]

    expect(changedEventIds(events, MON(2), MON(1))).toEqual(new Set())
  })

  it('still marks a section that resumes in a different room', () => {
    const events = [card(0, 'LEC'), card(2, 'LEC', 'YIA 404')]

    expect(changedEventIds(events, MON(2))).toEqual(new Set(['LEC-Mo-2']))
  })
})
