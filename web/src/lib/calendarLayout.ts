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
 * Group overlapping calendar events for visual stacking
 */
export function groupOverlappingEvents(events: CalendarEvent[]): CalendarEvent[][] {
  const groups: CalendarEvent[][] = []
  const processed = new Set<string>()

  for (const event of events) {
    if (processed.has(event.id)) continue

    const group = [event]
    processed.add(event.id)

    // Overlap is not transitive, so sweep the group as it grows rather than
    // comparing against the seed alone: 9:30-11:15 and 11:30-13:00 both belong
    // with 10:30-12:15. Seeding alone splits that chain in a cart-order-dependent
    // way, and the resulting groups draw conflict zones that overlap on screen.
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
 * Column for each card in an overlap group, keyed by event id.
 *
 * A card only has to dodge cards it actually overlaps, so a chain does not march
 * rightwards: with 9:30-11:15, 10:30-12:15 and 11:30-13:00, the first and last
 * share column 0. Column count is therefore how many classes truly run at once.
 */
export function assignOverlapColumns(group: CalendarEvent[]): Map<string, number> {
  const minutes = (event: CalendarEvent) => event.startHour * 60 + event.startMinute
  // Earliest first, so the greedy choice below is optimal; id breaks ties for a
  // placement that does not depend on cart order.
  const byStart = [...group].sort((a, b) => minutes(a) - minutes(b) || a.id.localeCompare(b.id))

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

/**
 * Groups a day's cards by overlap and places each one in a column.
 *
 * A group is a chain, and its zone spans the whole of it, so two cards linked
 * only through a third share one zone rather than drawing two that overlap.
 * Columns come from real overlap, so the chain's ends share the left edge
 * instead of the stack marching rightwards.
 */
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
