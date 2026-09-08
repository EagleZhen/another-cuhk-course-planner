'use client'

import {
  formatDateRange,
  formatTimeCompact,
  formatInstructorsCompact,
  googleSearchAndOpen,
  googleMapsSearchAndOpen,
} from '@/lib/courseUtils'
import type { MeetingRow } from '@/lib/types'
import { GoogleIcon } from '@/components/icons/GoogleIcon'
import { GoogleMapsIcon } from '@/components/icons/GoogleMapsIcon'

// Amber text marks a changed value without shifting the surrounding row.
// Exported for the cart's language-of-instruction line, which uses the same treatment.
export const changedText = 'rounded bg-amber-100 text-amber-800 cursor-help'

// A changed value shows both, since the row truncates and the arrow says which
// way it went. Labelling them would only repeat what the arrow already states.
function changedTooltip(before: string, now: string): string {
  return `${before}\n↓\n${now}`
}

// One meeting in the unified 3-row emoji format, styled by its change status.
// Shared by the cart (all statuses) and search results (always 'unchanged').
export function MeetingRowCard({
  row,
  showChangeTooltip = true,
}: {
  row: MeetingRow
  showChangeTooltip?: boolean
}) {
  const { meeting } = row
  const before = row.status === 'changed' ? row.before : undefined
  const fields = row.status === 'changed' ? row.fields : undefined
  const formattedTime = formatTimeCompact(meeting.time)
  const formattedInstructor = formatInstructorsCompact(meeting.instructor)
  const location = meeting.location || 'TBA'

  let containerClass = 'bg-white border-gray-200'
  let valueClass = 'text-gray-600'
  let tooltip: string | undefined
  let wholeMeetingChange = false

  switch (row.status) {
    case 'unchanged':
      break
    case 'added':
      containerClass = `bg-amber-50 border-amber-200${showChangeTooltip ? ' cursor-help' : ''}`
      tooltip = showChangeTooltip ? 'New meeting (added since you last checked)' : undefined
      wholeMeetingChange = true
      break
    case 'changed':
      break
    case 'removed':
      containerClass = `bg-amber-50 border-amber-200${showChangeTooltip ? ' cursor-help' : ''}`
      valueClass = 'text-gray-400 line-through'
      tooltip = showChangeTooltip ? 'This meeting was removed since you last checked' : undefined
      wholeMeetingChange = true
      break
  }

  // Each source row is one weekly run, so it reads as a range; the break between
  // runs is what shows a gap.
  const dateRanges = meeting.dates?.map(formatDateRange).filter(Boolean) ?? []
  // Only worth a tooltip where a range stands for dates it does not show.
  const hiddenDates = meeting.dates?.some((run) => run.includes(',')) ?? false
  const datesTooltip = fields?.dates
    ? changedTooltip(before!.dates!.map(formatDateRange).join(', '), dateRanges.join(', '))
    : hiddenDates
      ? meeting.dates!.join('\n')
      : undefined
  const timeTooltip =
    fields?.time && before
      ? changedTooltip(formatTimeCompact(before.time), formattedTime)
      : undefined

  return (
    <div className={`rounded border px-2 py-1.5 shadow-sm ${containerClass}`} title={tooltip}>
      {/* Row 1: Time, with the dates it runs on beneath */}
      <div className="flex items-start gap-1 text-[11px]">
        <span>⏰</span>
        {/* Dates share the time's column so they align with it whatever the emoji
            measures, and take no icon of their own — one here would read like the
            row's action buttons. Quiet at rest: the timetable answers "when" far
            better, so this is only here to stop a varying section looking uniform. */}
        <div className="min-w-0 flex-1">
          <span
            className={`font-mono ${fields?.time ? changedText : valueClass}`}
            title={timeTooltip}
          >
            {formattedTime}
          </span>
          {dateRanges.length > 0 && (
            <div
              className={`truncate text-[10px] ${
                fields?.dates ? `${changedText} w-fit` : 'text-gray-400'
              }${datesTooltip ? ' cursor-help' : ''}`}
              title={datesTooltip}
            >
              {dateRanges.join(', ')}
            </div>
          )}
        </div>
      </div>
      {/* Row 2: Instructor */}
      <div className="flex items-center gap-1 text-[11px] mt-1">
        <span>🧑🏻‍🏫</span>
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <span
            className={`truncate ${fields?.instructor ? changedText : valueClass}`}
            title={
              fields?.instructor && before
                ? changedTooltip(formatInstructorsCompact(before.instructor), formattedInstructor)
                : wholeMeetingChange
                  ? undefined
                  : formattedInstructor
            }
          >
            {formattedInstructor}
          </span>
          {formattedInstructor !== 'Staff' && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                googleSearchAndOpen(`CUHK ${formattedInstructor}`)
              }}
              className="flex-shrink-0 p-0.5 hover:bg-gray-100 rounded cursor-pointer transition-colors duration-200"
              title={`Search Google for "CUHK ${formattedInstructor}"`}
            >
              <GoogleIcon className="size-3" />
            </button>
          )}
        </div>
      </div>
      {/* Row 3: Location */}
      <div className="flex items-center gap-1 text-[11px] mt-1">
        <span>📍</span>
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <span
            className={`truncate ${fields?.location ? changedText : valueClass}`}
            title={
              fields?.location && before
                ? changedTooltip(before.location || 'TBA', location)
                : wholeMeetingChange
                  ? undefined
                  : location
            }
          >
            {location}
          </span>
          {location !== 'TBA' && location !== 'No Room Required' && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                googleMapsSearchAndOpen(location)
              }}
              className="flex-shrink-0 p-0.5 hover:bg-gray-100 rounded cursor-pointer transition-colors duration-200"
              title={`View "${location}" on Google Maps`}
            >
              <GoogleMapsIcon className="size-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
