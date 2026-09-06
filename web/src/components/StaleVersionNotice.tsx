'use client'

import { useCallback, useEffect, useState } from 'react'
import { Info, X } from 'lucide-react'
import { hasRefreshMarker, withoutRefreshMarker } from '@/lib/staleChunk'

const AUTO_HIDE_MS = 10_000

// Explains the reload that error.tsx just fired.
export default function StaleVersionNotice() {
  const [show, setShow] = useState(false)

  // Stripped as soon as it is read: the URL is shared and reloaded from, and neither
  // should carry a refresh that already happened.
  useEffect(() => {
    if (!hasRefreshMarker(window.location.href)) return
    window.history.replaceState(null, '', withoutRefreshMarker(window.location.href))
    setShow(true)
  }, [])

  const hide = useCallback(() => setShow(false), [])

  // Drives the countdown bar off the timer's own constant, so the two cannot drift.
  // Flipping it one frame after mount is what starts the transition.
  const [elapsed, setElapsed] = useState(false)

  useEffect(() => {
    if (!show) return
    const frame = requestAnimationFrame(() => setElapsed(true))
    const timer = setTimeout(hide, AUTO_HIDE_MS)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [show, hide])

  // The live region stays mounted and its contents are swapped in: assistive tech
  // announces changes to a region it already knows about, not one that appears full.
  return (
    <div
      role="status"
      className={
        show
          ? 'fixed bottom-20 left-6 z-50 flex overflow-hidden sm:bottom-6 max-w-[calc(100vw-3rem)] items-start gap-2 sm:max-w-lg rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-lg'
          : undefined
      }
      data-stale-version-notice={show ? '' : undefined}
    >
      {show && (
        <>
          <Info aria-hidden="true" className="mt-0.5 size-4 flex-shrink-0 text-slate-400" />
          <span>This page refreshed automatically to pick up a new version.</span>
          <button
            onClick={hide}
            aria-label="Dismiss"
            className="-mr-1 cursor-pointer rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-4" />
          </button>

          <div
            aria-hidden="true"
            className="absolute bottom-0 right-0 h-1 bg-slate-400 transition-[width] ease-linear motion-reduce:hidden"
            style={{ width: elapsed ? '0%' : '100%', transitionDuration: `${AUTO_HIDE_MS}ms` }}
          />
        </>
      )}
    </div>
  )
}
