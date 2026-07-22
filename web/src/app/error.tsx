'use client'

import { useEffect } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import posthog from 'posthog-js'
import { Button } from '@/components/ui/button'

export default function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    posthog.captureException(error, { error_boundary: 'app' })
  }, [error])

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
