'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ReadySchedule, SavedSchedule } from '@/hooks/useSavedSchedule'
import { serializeStoredSchedule } from '@/lib/storedSchedule'
import { readScheduleBackup } from '@/lib/scheduleStorage'

export default function ScheduleStorageNotice({
  cart,
  unsaved,
  onSelectTerm,
  onRetrySave,
  onReloadSaved,
}: {
  cart: SavedSchedule
  unsaved: ReadySchedule[]
  onSelectTerm: (term: string) => void
  onRetrySave: () => void
  onReloadSaved: () => void
}) {
  const [failedDownload, setFailedDownload] = useState<SavedSchedule | null>(null)
  const failures = unsaved.filter(
    (schedule) =>
      schedule.saveStatus === 'failed' ||
      schedule.saveStatus === 'refused' ||
      schedule.term !== cart.term
  )
  const showNotice = cart.status === 'blocked' || failures.length > 0 || failedDownload === cart
  const canDownloadRecovery =
    (cart.status === 'ready' && (cart.saveStatus === 'failed' || cart.saveStatus === 'refused')) ||
    (cart.status === 'blocked' && (cart.layer === 'record' || cart.layer === 'payload'))
  if (!showNotice) return null

  const download = async (contents: () => string | Promise<string>, term: string, kind: string) => {
    setFailedDownload(null)
    try {
      const url = URL.createObjectURL(new Blob([await contents()], { type: 'application/json' }))
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
          {schedule.saveStatus === 'refused' ? (
            <p>
              {schedule.saveProblem?.reason === 'revision_conflict'
                ? `The schedule for ${schedule.term} changed in another tab. Changes in this tab are not being saved.`
                : `Changes to ${schedule.term} are not being saved because this tab cannot safely update the saved data.`}
            </p>
          ) : (
            <p>
              Changes to {schedule.term} have not been saved. Keep this tab open or download your
              changes.
            </p>
          )}
          {schedule.saveStatus === 'refused' && (
            <p>You can keep editing here. Download your changes before closing this tab.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {schedule.term !== cart.term ? (
              <Button variant="ghost-warning" size="sm" onClick={() => onSelectTerm(schedule.term)}>
                View unsaved schedule
              </Button>
            ) : schedule.saveProblem?.reason === 'revision_conflict' ? (
              <Button
                variant="ghost-warning"
                size="sm"
                onClick={() => {
                  if (
                    window.confirm(
                      'Replace this tab’s unsaved changes with the saved version? Download your changes first if you want to keep them.'
                    )
                  )
                    onReloadSaved()
                }}
              >
                Discard edits and load saved version
              </Button>
            ) : schedule.saveStatus === 'failed' ? (
              <Button variant="ghost-warning" size="sm" onClick={onRetrySave}>
                Try saving again
              </Button>
            ) : null}
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
      {canDownloadRecovery && (
        <Button
          variant="ghost-warning"
          size="sm"
          onClick={() => download(() => readScheduleBackup(cart.term), cart.term, 'backup')}
        >
          Download recovery data
        </Button>
      )}
    </div>
  )
}
