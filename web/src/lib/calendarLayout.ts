import type { CalendarEvent } from './types'
import { eventsOverlap } from './courseUtils'

// Layout for one day column. `detectConflicts` answers whether cards clash;
// this answers where they sit.

/** A card and the column it occupies within its overlap group. */
export interface PlacedEvent {
  event: CalendarEvent
  column: number
}

/** Cards chained by overlap, with the bounds their conflict zone spans. */
export interface OverlapGroup {
  events: PlacedEvent[]
  columnCount: number
  startMinutes: number
  endMinutes: number
}

const startMinutes = (event: CalendarEvent) => event.startHour * 60 + event.startMinute
const endMinutes = (event: CalendarEvent) => event.endHour * 60 + event.endMinute

/**
 * Cards chained by overlap, one group per conflict zone. Overlap is not
 * transitive, so the group is swept as it grows: 9:30-11:15 and 11:30-13:00
 * belong with 10:30-12:15 even though they miss each other.
 */
export function groupOverlappingEvents(events: CalendarEvent[]): CalendarEvent[][] {
  const groups: CalendarEvent[][] = []
  const processed = new Set<string>()

  for (const event of events) {
    if (processed.has(event.id)) continue

    const group = [event]
    processed.add(event.id)

    for (let member = 0; member < group.length; member++) {
      for (const otherEvent of events) {
        if (processed.has(otherEvent.id)) continue

        if (eventsOverlap(group[member], otherEvent)) {
          group.push(otherEvent)
          processed.add(otherEvent.id)
        }
      }
    }

    groups.push(group)
  }

  return groups
}

/**
 * Column for each card, keyed by event id. A card only dodges cards it actually
 * overlaps, so the ends of a chain share column 0 rather than the stack marching
 * rightwards, and the column count is how many classes really run at once.
 */
export function assignOverlapColumns(group: CalendarEvent[]): Map<string, number> {
  // Earliest first makes the greedy choice below optimal; id breaks ties so the
  // placement does not depend on cart order.
  const byStart = [...group].sort(
    (a, b) => startMinutes(a) - startMinutes(b) || a.id.localeCompare(b.id)
  )

  const columns = new Map<string, number>()

  for (const event of byStart) {
    const taken = new Set(
      byStart
        .filter((other) => columns.has(other.id) && eventsOverlap(other, event))
        .map((other) => columns.get(other.id))
    )

    let column = 0
    while (taken.has(column)) column++
    columns.set(event.id, column)
  }

  return columns
}

/** A day's cards, grouped for zones and placed in columns. */
export function layoutDayEvents(events: CalendarEvent[], day: number): OverlapGroup[] {
  const dayEvents = events.filter((event) => event.day === day)

  return groupOverlappingEvents(dayEvents).map((group) => {
    const columns = assignOverlapColumns(group)

    return {
      events: group.map((event) => ({ event, column: columns.get(event.id)! })),
      columnCount: Math.max(...columns.values()) + 1,
      startMinutes: Math.min(...group.map(startMinutes)),
      endMinutes: Math.max(...group.map(endMinutes)),
    }
  })
}

// === WEEKS ===
//
// The week range comes from the cart's own occurrences, never a term calendar,
// so nothing here needs to know when a term starts or ends.

/** Monday of the week containing `date`, at local midnight. */
export function startOfWeek(date: Date): Date {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  // getDay() is Sunday-based; shift so Monday starts the week.
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return monday
}

/**
 * Every week from the first occurrence to the last, contiguous — a week nothing
 * falls in stays in the range rather than being skipped.
 */
export function weekRange(events: CalendarEvent[]): Date[] {
  if (events.length === 0) return []

  const times = events.map((event) => startOfWeek(event.date).getTime())
  const weeks: Date[] = []

  for (let week = new Date(Math.min(...times)); week.getTime() <= Math.max(...times);) {
    weeks.push(new Date(week))
    week = new Date(week.getFullYear(), week.getMonth(), week.getDate() + 7)
  }

  return weeks
}

/** The week containing `today`, clamped to the range. */
export function defaultWeek(weeks: Date[], today: Date): Date | null {
  if (weeks.length === 0) return null

  const current = startOfWeek(today).getTime()
  if (current <= weeks[0].getTime()) return weeks[0]

  return weeks.find((week) => week.getTime() === current) ?? weeks[weeks.length - 1]
}

/** Cards falling in the seven days from `weekStart`. */
export function eventsInWeek(events: CalendarEvent[], weekStart: Date): CalendarEvent[] {
  const start = weekStart.getTime()
  const end = new Date(
    weekStart.getFullYear(),
    weekStart.getMonth(),
    weekStart.getDate() + 7
  ).getTime()

  return events.filter((event) => event.date.getTime() >= start && event.date.getTime() < end)
}

// === WHAT CHANGES BETWEEN WEEKS ===
//
// A week is identified by what it shows, not when: same classes, same rooms, same
// instructors. Skipping repeats and ringing what changed are then the same
// comparison, so the two can never disagree.

/** A card's content, with its date left out. */
function contentKey(event: CalendarEvent): string {
  return [
    event.enrollmentId,
    event.sectionCode,
    event.time,
    event.location,
    event.instructors,
  ].join('|')
}

function weekContent(events: CalendarEvent[], weekStart: Date): Set<string> {
  return new Set(eventsInWeek(events, weekStart).map(contentKey))
}

/** The weeks worth stopping at: the first, and any that differ from the one before. */
export function distinctWeeks(events: CalendarEvent[], weeks: Date[]): Date[] {
  let previous: Set<string> | null = null

  return weeks.filter((week) => {
    const content = weekContent(events, week)
    const isNew =
      previous === null ||
      content.size !== previous.size ||
      [...content].some((key) => !previous!.has(key))

    previous = content
    return isNew
  })
}

/** The section a card belongs to, whatever it shows that week. */
function sectionKey(event: CalendarEvent): string {
  return `${event.enrollmentId}|${event.sectionCode}`
}

/**
 * Ids of the cards worth marking on arrival, given the week last shown:
 *
 * - the same section showing something different from where you came from —
 *   `GEWS1011`'s lecture changes building, and that reads the same in either
 *   direction, so week 1 marks it when reached from week 2;
 * - content no earlier week held, which catches a section starting mid-term.
 *
 * A section resuming unchanged after a break is neither. That was 96% of all
 * marks and reports what the empty grid already showed.
 */
export function changedEventIds(
  events: CalendarEvent[],
  weekStart: Date,
  lastShown?: Date | null
): Set<string> {
  const earlier = events.filter((event) => event.date.getTime() < weekStart.getTime())
  const seenBefore = new Set(earlier.map(contentKey))

  const shownLast = lastShown ? eventsInWeek(events, lastShown) : []
  const lastContent = new Set(shownLast.map(contentKey))
  const lastSections = new Set(shownLast.map(sectionKey))

  return new Set(
    eventsInWeek(events, weekStart)
      .filter((event) => {
        if (lastContent.has(contentKey(event))) return false
        if (lastSections.has(sectionKey(event))) return true

        return earlier.length > 0 && !seenBefore.has(contentKey(event))
      })
      .map((event) => event.id)
  )
}
