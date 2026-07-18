'use client'

import {
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

// One meeting in the unified 3-row emoji format, styled by its change status.
// Shared by the cart (all statuses) and search results (always 'unchanged').
export function MeetingRowCard({ row }: { row: MeetingRow }) {
  const { meeting } = row
  const before = row.status === 'changed' ? row.before : undefined
  const fields = row.status === 'changed' ? row.fields : undefined
  const formattedTime = formatTimeCompact(meeting.time || 'TBA')
  const formattedInstructor = formatInstructorsCompact(meeting.instructor || 'TBA')
  const location = meeting.location || 'TBA'

  let containerClass = 'bg-white border-gray-200'
  let valueClass = 'text-gray-600'
  let tooltip: string | undefined
  let wholeMeetingChange = false

  switch (row.status) {
    case 'unchanged':
      break
    case 'added':
      containerClass = 'bg-amber-50 border-amber-200 cursor-help'
      tooltip = 'New meeting (added since you last checked)'
      wholeMeetingChange = true
      break
    case 'changed':
      break
    case 'removed':
      containerClass = 'bg-amber-50 border-amber-200 cursor-help'
      valueClass = 'text-gray-400 line-through'
      tooltip = 'This meeting was removed since you last checked'
      wholeMeetingChange = true
      break
  }

  return (
    <div className={`rounded border px-2 py-1.5 shadow-sm ${containerClass}`} title={tooltip}>
      {/* Row 1: Time */}
      <div className="flex items-center gap-1 text-[11px]">
        <span>⏰</span>
        <span
          className={`font-mono ${fields?.time ? changedText : valueClass}`}
          title={fields?.time && before ? `Previously ${before.time}` : undefined}
        >
          {formattedTime}
        </span>
      </div>
      {/* Row 2: Instructor */}
      <div className="flex items-center gap-1 text-[11px] mt-1">
        <span>🧑🏻‍🏫</span>
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <span
            className={`truncate ${fields?.instructor ? changedText : valueClass}`}
            title={
              fields?.instructor && before
                ? `Previously ${before.instructor}`
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
                ? `Previously ${before.location}`
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
