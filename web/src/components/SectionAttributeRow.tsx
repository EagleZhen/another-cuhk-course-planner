'use client'

import { formatClassAttributesCompact } from '@/lib/courseUtils'
import { changedText } from '@/components/MeetingRowCard'

// A fact a section states about itself, shown on both the search card and the cart. Shared
// so the two surfaces can't drift, and so a new change state is written once for every row.
function AttributeRow({
  icon,
  label,
  value,
  lines,
  className,
  changed = false,
  previous,
}: {
  icon: string
  label: string
  value: string // Raw, for the tooltip: `lines` may have been shortened for the row.
  lines: string[]
  className: string // The surface's own size, colour and spacing.
  changed?: boolean
  previous?: string // What the user last saw, when this changed.
}) {
  if (!value) return null

  return (
    <div className={`flex items-start gap-1 ${className}`}>
      <span className="flex-shrink-0">{icon}</span>
      {/* One block per line, so a wrapped line is not mistaken for the next one. */}
      <div
        className={`min-w-0 space-y-1 ${changed ? changedText : ''}`}
        title={
          changed && previous !== undefined
            ? `Previously ${previous || 'not specified'}`
            : `${label}: ${value}`
        }
      >
        {lines.map((line, index) => (
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
      lines={[formatClassAttributesCompact(props.value)]}
      {...props}
    />
  )
}

export function EnrollmentRequirementRow(props: RowProps) {
  return (
    <AttributeRow
      icon="🔒"
      label="Enrollment requirement"
      lines={props.value.split('\n')}
      {...props}
    />
  )
}
