'use client'

import { attributeRowState, formatClassAttributesCompact } from '@/lib/courseUtils'
import { changedText } from '@/components/MeetingRowCard'

// One of a section's own facts, on the search card and in the cart. Shared so the two
// surfaces can't drift, and so each change state is written once.
function AttributeRow({
  icon,
  label,
  removedTooltip,
  format,
  value,
  className,
  changed = false,
  previous,
}: {
  icon: string
  label: string // Names the value in its tooltip.
  removedTooltip: string
  format: (value: string) => string[] // How the value breaks into lines.
  value: string
  className: string // Per-surface size, colour and spacing.
  changed?: boolean
  previous?: string // What the user last saw, when this changed.
}) {
  const state = attributeRowState(value, previous, changed)
  if (!state) return null

  return (
    <div className={`flex items-start gap-1 ${className}`}>
      <span className="flex-shrink-0">{icon}</span>
      {/* One block per line, so a wrapped line isn't mistaken for the next one. */}
      <div
        className={`min-w-0 space-y-1 ${changed ? changedText : ''} ${state.removed ? 'line-through' : ''}`}
        title={
          state.removed
            ? removedTooltip
            : changed && previous !== undefined
              ? `Previously ${previous || 'not specified'}`
              : `${label}: ${value}`
        }
      >
        {format(state.text).map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      </div>
    </div>
  )
}

type RowProps = { value: string; className: string; changed?: boolean; previous?: string }

export function ClassAttributesRow(props: RowProps) {
  return (
    <AttributeRow
      icon="🌐"
      label="Class attributes"
      removedTooltip="These class attributes were removed since you last checked"
      format={(value) => [formatClassAttributesCompact(value)]}
      {...props}
    />
  )
}

export function EnrollmentRequirementRow(props: RowProps) {
  return (
    <AttributeRow
      icon="🔒"
      label="Enrollment requirement"
      removedTooltip="This enrollment requirement was removed since you last checked"
      format={(value) => value.split('\n')}
      {...props}
    />
  )
}
