'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import posthog from 'posthog-js'
import { Button } from '@/components/ui/button'
import { analytics } from '@/lib/analytics'
import {
  hasRefreshMarker,
  isStaleChunkError,
  readStaleChunkReload,
  rememberStaleChunkReload,
  shouldReloadForStaleChunk,
  withoutRefreshMarker,
  withRefreshMarker,
} from '@/lib/staleChunk'

export default function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  // Decided during render, not in an effect, so this page never flashes before the reload.
  const [recovering, setRecovering] = useState(
    () =>
      typeof window !== 'undefined' &&
      shouldReloadForStaleChunk(error, readStaleChunkReload(Date.now()), Date.now())
  )

  useEffect(() => {
    if (recovering) {
      // Reloading without a stored guard would loop, so fall back to the error page.
      if (!rememberStaleChunkReload(Date.now())) {
        setRecovering(false)
        return
      }
      // Handled — the user sees a reload, not a failure, so this is not one to triage.
      analytics.staleChunkRecovered()
      window.location.replace(withRefreshMarker(window.location.href))
      return
    }

    // Recovery failed, so drop the marker before StaleVersionNotice — mounted after us —
    // reads it and claims success beside this page.
    if (hasRefreshMarker(window.location.href)) {
      window.history.replaceState(null, '', withoutRefreshMarker(window.location.href))
    }

    posthog.captureException(error, {
      error_boundary: 'app',
      // The reload did not help and the user is looking at this page.
      ...(isStaleChunkError(error) && { stale_chunk_recovery: 'exhausted' }),
    })
  }, [error, recovering])

  if (recovering) return null

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-16">
      <section
        role="alert"
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm"
      >
        <TriangleAlert aria-hidden="true" className="mx-auto mb-4 size-10 text-amber-500" />
        <h1 className="text-balance text-xl font-semibold text-slate-900">
          The planner ran into a problem
        </h1>
        <p className="mt-2 text-balance text-sm text-slate-600">Reload the page to try again.</p>
        <Button
          className="mt-6 bg-slate-900 hover:bg-slate-700 active:bg-slate-950"
          onClick={() => window.location.reload()}
        >
          <RefreshCw aria-hidden="true" />
          Reload page
        </Button>
        <p className="mt-3 text-xs text-slate-500">Still stuck? Let me know through Feedback.</p>
      </section>
    </main>
  )
}
