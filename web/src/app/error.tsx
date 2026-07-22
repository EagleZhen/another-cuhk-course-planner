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
        <h1 className="text-xl font-semibold text-slate-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-600">
          The planner hit an unexpected problem. Reload the page to try again.
        </p>
        <Button className="mt-6" onClick={() => window.location.reload()}>
          <RefreshCw aria-hidden="true" />
          Reload page
        </Button>
      </section>
    </main>
  )
}
