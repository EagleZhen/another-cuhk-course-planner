'use client'

import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { STALE_CHUNK_RELOAD_KEY } from '@/lib/constants'

const AUTO_HIDE_MS = 10_000

// Explains the reload that error.tsx just fired.
export default function StaleVersionNotice() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) !== null) setShow(true)
  }, [])

  // Clearing the flag re-arms error.tsx's one-shot reload, so hold it until the notice has
  // been seen: a remount before that then re-reads it instead of swallowing the notice.
  const hide = useCallback(() => {
    sessionStorage.removeItem(STALE_CHUNK_RELOAD_KEY)
    setShow(false)
  }, [])

  useEffect(() => {
    if (!show) return
    const timer = setTimeout(hide, AUTO_HIDE_MS)
    return () => clearTimeout(timer)
  }, [show, hide])

  if (!show) return null

  return (
    <div
      role="status"
      data-stale-version-notice
      className="fixed bottom-6 left-6 z-50 flex max-w-[calc(100vw-3rem)] items-start gap-2 sm:max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-lg"
    >
      <span>This page refreshed automatically to load a new version.</span>
      <button
        onClick={hide}
        aria-label="Dismiss"
        className="-mr-1 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
