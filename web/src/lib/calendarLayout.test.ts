import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { transformExternalCourseData } from './validation'
import { enrollmentsToCalendarEvents } from './courseUtils'
import {
  groupOverlappingEvents,
  assignOverlapColumns,
  layoutDayEvents,
  startOfWeek,
  weekRange,
  defaultWeek,
  eventsInWeek,
  nextDistinctWeek,
  changedEventIds,
  weeksWithConflict,
} from './calendarLayout'
import type { CalendarEvent, InternalCourse } from './types'

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

  // One room for two weeks, then another for three.
  const twoRuns = [
    card(0, 'LEC'),
    card(1, 'LEC'),
    card(2, 'LEC', 'YIA 404'),
    card(3, 'LEC', 'YIA 404'),
    card(4, 'LEC', 'YIA 404'),
  ]
  const fiveWeeks = [MON(0), MON(1), MON(2), MON(3), MON(4)]

  it('steps to the nearest week showing something else', () => {
    expect(nextDistinctWeek(twoRuns, fiveWeeks, MON(0), 1)).toEqual(MON(2))
    expect(nextDistinctWeek(twoRuns, fiveWeeks, MON(2), -1)).toEqual(MON(1))
  })

  // Standing in week 4, back has to clear weeks 3 and 2 — they show what week 4
  // already does. Stepping to a precomputed run boundary landed on week 2 and
  // changed nothing on screen.
  it('clears the run it is standing in', () => {
    expect(nextDistinctWeek(twoRuns, fiveWeeks, MON(4), -1)).toEqual(MON(1))
  })

  // Nothing differs, so there is no move to make and no way to be stranded.
  it('offers no move in a uniform cart, wherever you stand', () => {
    const uniform = [card(0, 'LEC'), card(1, 'LEC'), card(2, 'LEC')]
    const weeks = [MON(0), MON(1), MON(2)]

    expect(nextDistinctWeek(uniform, weeks, MON(1), -1)).toBeNull()
    expect(nextDistinctWeek(uniform, weeks, MON(1), 1)).toBeNull()
    expect(nextDistinctWeek(uniform, weeks, MON(0), 1)).toBeNull()
  })

  // An empty week differs from a full one, so it is somewhere to land.
  it('treats a week with no classes as different', () => {
    const events = [card(0, 'LEC'), card(2, 'LEC')]
    const weeks = [MON(0), MON(1), MON(2)]

    expect(nextDistinctWeek(events, weeks, MON(0), 1)).toEqual(MON(1))
    expect(nextDistinctWeek(events, weeks, MON(2), -1)).toEqual(MON(1))
  })

  // Starting, resuming and moving room are one case, so none of them needs a rule.
  it('marks a class that was not on the timetable it came from', () => {
    const events = [card(0, 'LEC'), card(1, 'LEC'), card(1, 'TUT'), card(3, 'TUT')]

    expect(changedEventIds(events, MON(1), MON(0))).toEqual(new Set(['TUT-Mo-1'])) // starts
    expect(changedEventIds(events, MON(3), MON(2))).toEqual(new Set(['TUT-Mo-3'])) // resumes
  })

  // A class that stops leaves no card, so the arrival has nothing to mark. That is
  // the only reason a skipped step can land on a week showing no ring at all.
  it('marks nothing when the difference is a class leaving', () => {
    const events = [card(0, 'LEC'), card(1, 'LEC'), card(1, 'TUT')]

    expect(changedEventIds(events, MON(0), MON(1))).toEqual(new Set())
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

    expect(nextDistinctWeek(events, [MON(0), MON(1)], MON(0), 1)).toBeNull()
    expect(changedEventIds(events, MON(1))).toEqual(new Set())
  })

  // Only the week you came from counts, so a break changes nothing about the rule:
  // arriving from the empty week marks, arriving from before it does not.
  it('compares against the week you came from, not the term', () => {
    const events = [card(0, 'LEC'), card(2, 'LEC')]

    expect(changedEventIds(events, MON(2), MON(1))).toEqual(new Set(['LEC-Mo-2']))
    expect(changedEventIds(events, MON(2), MON(0))).toEqual(new Set())
  })

  // The week between is blank, so the comparison has to reach past it — a quarter of
  // all real changes look like this.
  it('marks a section that resumes in a different room, across the empty week', () => {
    const events = [card(0, 'LEC'), card(2, 'LEC', 'YIA 404')]

    expect(changedEventIds(events, MON(2), MON(1))).toEqual(new Set(['LEC-Mo-2']))
    expect(changedEventIds(events, MON(0), MON(1))).toEqual(new Set(['LEC-Mo-0']))
  })
})

describe('weeksWithConflict', () => {
  const MON = (week: number) => new Date(2026, 8, 7 + week * 7)
  const at = (week: number, hasConflict: boolean): CalendarEvent =>
    ({ id: `${week}-${hasConflict}`, date: MON(week), hasConflict }) as CalendarEvent

  it('finds only the weeks a clash actually falls in', () => {
    const weeks = [MON(0), MON(1), MON(2)]
    const events = [at(0, false), at(1, true), at(2, false)]

    expect(weeksWithConflict(events, weeks)).toEqual([MON(1)])
    expect(weeksWithConflict([at(0, false)], weeks)).toEqual([])
  })
})

// The rule's three past bugs all came from carts no unit test held: a section
// swapping type, a lecture moving building, a class returning mid-term. Driven by
// the real producer, so a change in how occurrences are built shows up here.
describe('the arrival cue over a real cart', () => {
  const TERM = '2026-27 Term 1'

  const published = (subject: string, courseCode: string): InternalCourse => {
    const path = join(process.cwd(), 'public', 'data', '2026-27', `${subject}.json`)
    const { courses } = transformExternalCourseData(JSON.parse(readFileSync(path, 'utf8')))
    const course = courses.find((candidate) => candidate.courseCode === courseCode)
    if (!course) throw new Error(`${subject}${courseCode} is not in 2026-27 published data`)

    return course
  }

  // GEWS1011: lecture in weeks 1-2, moving building between them, then ten
  // tutorials from week 3. MBTE3510: a Monday lecture starting in week 2 and
  // stopping after week 9.
  const events = enrollmentsToCalendarEvents(
    [published('GEWS', '1011'), published('MBTE', '3510')].map((course) => ({
      courseId: `${course.subject}${course.courseCode}`,
      course,
      selectedSections: course.terms.find((term) => term.termName === TERM)!.sections,
      color: '#000000',
      isVisible: true,
    })),
    TERM
  )
  const weeks = weekRange(events)
  const marks = (from: number, to: number) =>
    [...changedEventIds(events, weeks[to - 1], weeks[from - 1])].map((id) => id.split('|')[1])

  it('marks the lecture that moves building, both ways', () => {
    expect(marks(1, 2)).toContain('GEWS1011_--LEC (5850)')
    expect(marks(2, 1)).toEqual(['GEWS1011_--LEC (5850)'])
  })

  it('marks a section type swapping in and out', () => {
    expect(marks(2, 3)).toHaveLength(10) // the tutorials start
    expect(marks(3, 2)).toEqual(['GEWS1011_--LEC (5850)']) // and the lecture is back
  })

  it('marks a class returning, and nothing when it leaves', () => {
    expect(marks(10, 9)).toEqual(['MBTE3510_--LEC (5987)'])
    expect(marks(9, 10)).toEqual([])
  })
})
