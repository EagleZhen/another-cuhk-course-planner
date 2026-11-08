'use client'

import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ReadySchedule, SavedSchedule } from '@/hooks/useSavedSchedule'

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
  const failures = unsaved.filter(
    (schedule) => schedule.saveStatus === 'failed' || schedule.saveStatus === 'refused'
  )
  if (cart.status !== 'blocked' && failures.length === 0) return null

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
          {cart.reason === 'unsupported_version' && cart.layer !== 'legacy' && (
            <p>This saved schedule needs a newer planner. Refresh this page to try loading it.</p>
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
              Changes to {schedule.term} have not been saved. Keep this tab open to retain them.
            </p>
          )}
          {schedule.saveStatus === 'refused' && <p>Keep this tab open to retain your edits.</p>}
          {schedule.saveProblem?.reason === 'unsupported_version' && (
            <p>Open the planner in a new tab to try loading the saved schedule.</p>
          )}
          {schedule.saveProblem?.reason === 'read_failed' && (
            <p>The saved version could not be read. You can try loading it again.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {schedule.term !== cart.term ? (
              <Button variant="ghost-warning" size="sm" onClick={() => onSelectTerm(schedule.term)}>
                View unsaved schedule
              </Button>
            ) : schedule.saveProblem?.reason === 'revision_conflict' ||
              schedule.saveProblem?.reason === 'read_failed' ? (
              <Button
                variant="ghost-warning"
                size="sm"
                onClick={() => {
                  if (
                    window.confirm('Discard this tab’s unsaved changes and load the saved version?')
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
          </div>
        </div>
      ))}
    </div>
  )
}
