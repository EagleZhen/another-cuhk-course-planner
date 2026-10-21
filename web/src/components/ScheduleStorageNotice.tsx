'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ReadySchedule, SavedSchedule } from '@/hooks/useSavedSchedule'
import { serializeStoredSchedule } from '@/lib/storedSchedule'

export default function ScheduleStorageNotice({
  cart,
  unsaved,
  onSelectTerm,
  onRetrySave,
}: {
  cart: SavedSchedule
  unsaved: ReadySchedule[]
  onSelectTerm: (term: string) => void
  onRetrySave: () => void
}) {
  const [failedDownload, setFailedDownload] = useState<SavedSchedule | null>(null)
  const failures = unsaved.filter(
    (schedule) => schedule.saveStatus === 'failed' || schedule.term !== cart.term
  )
  if (cart.status !== 'blocked' && failures.length === 0) return null

  const download = (contents: () => string, term: string, kind: string) => {
    setFailedDownload(null)
    try {
      const url = URL.createObjectURL(new Blob([contents()], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `schedule_${term.replaceAll(' ', '_')}_${kind}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setFailedDownload(cart)
    }
  }

  return (
    <div
      role="alert"
      data-schedule-storage-notice
      className="mx-auto mb-4 max-w-7xl space-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      {cart.status === 'blocked' && (
        <div>
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            Saved schedule unavailable for {cart.term}.
          </p>
          <p>
            {cart.reason === 'read_failed'
              ? 'This tab could not read the saved data. It has been left unchanged.'
              : 'Your saved data has been kept unchanged. This tab cannot edit it.'}
          </p>
          {cart.raw !== undefined && (
            <Button
              variant="ghost-warning"
              size="sm"
              onClick={() => download(() => cart.raw!, cart.term, 'original')}
            >
              Download original data
            </Button>
          )}
        </div>
      )}
      {failures.map((schedule) => (
        <div key={schedule.term}>
          <p>
            Changes to {schedule.term} have not been saved. Keep this tab open or download your
            changes.
          </p>
          <div className="flex flex-wrap gap-2">
            {schedule.term === cart.term ? (
              <Button variant="ghost-warning" size="sm" onClick={onRetrySave}>
                Try saving again
              </Button>
            ) : (
              <Button variant="ghost-warning" size="sm" onClick={() => onSelectTerm(schedule.term)}>
                View unsaved schedule
              </Button>
            )}
            <Button
              variant="ghost-warning"
              size="sm"
              onClick={() =>
                download(
                  () => serializeStoredSchedule(schedule.enrollments, schedule.envelope),
                  schedule.term,
                  'unsaved'
                )
              }
            >
              Download changes
            </Button>
          </div>
        </div>
      ))}
      {failedDownload === cart && <p>The download failed. Keep this tab open and try again.</p>}
    </div>
  )
}
