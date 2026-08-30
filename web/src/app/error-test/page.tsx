'use client'

// TEMPORARY — revert before merging. Throws inside a component so PostHog receives an
// exception whose frames are all in our bundle, which is what proves symbolication works.

import { useState } from 'react'

export default function ErrorTestPage() {
  const [shouldThrow, setShouldThrow] = useState(false)

  if (shouldThrow) throw new Error('Source map check: this frame should name page.tsx')

  return (
    <main className="flex min-h-screen items-center justify-center">
      <button
        className="rounded-lg bg-slate-900 px-6 py-3 text-white"
        onClick={() => setShouldThrow(true)}
      >
        Throw a test error
      </button>
    </main>
  )
}
