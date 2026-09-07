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
