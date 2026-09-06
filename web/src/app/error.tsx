'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import posthog from 'posthog-js'
import { Button } from '@/components/ui/button'
import { analytics } from '@/lib/analytics'
import {
  hasRefreshMarker,
  readStaleChunkReload,
  rememberStaleChunkReload,
  shouldReloadForStaleChunk,
  withoutRefreshMarker,
  withRefreshMarker,
} from '@/lib/staleChunk'

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? 'unknown'

export default function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  // Decided during render, not in an effect, so this page never flashes before the reload.
  const [recovering] = useState(
    () =>
      typeof window !== 'undefined' &&
      shouldReloadForStaleChunk(error, readStaleChunkReload(), BUILD_ID)
  )

  useEffect(() => {
    if (recovering) {
      rememberStaleChunkReload(BUILD_ID)
      // Handled — the user sees a reload, not a failure, so this is not one to triage.
      analytics.staleChunkRecovered()
      window.location.replace(withRefreshMarker(window.location.href))
      return
    }

    // Recovery failed, so drop the marker: a later manual reload must not claim we picked
    // up a new version.
    if (hasRefreshMarker(window.location.href)) {
      window.history.replaceState(null, '', withoutRefreshMarker(window.location.href))
    }

    // A ChunkLoadError reaching here means we already tried this build; the recovered
    // case reports stale_chunk_recovered instead, and build_id rides on both.
    posthog.captureException(error, { error_boundary: 'app' })
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
