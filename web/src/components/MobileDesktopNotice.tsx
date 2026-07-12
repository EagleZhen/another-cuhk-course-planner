'use client'

import React, { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Monitor, Share2, Check, X } from 'lucide-react'
import {
  MOBILE_BREAKPOINT,
  NOTICE_STORAGE_KEY,
  NOTICE_VERSION,
  NOTICE_IMAGE_LOADED_EVENT,
} from '@/lib/constants'
import { analytics } from '@/lib/analytics'
import { Button } from '@/components/ui/button'

// Copy text to the clipboard. Tries the async Clipboard API, then a legacy execCommand
// path that also works on insecure origins (e.g. LAN-IP dev servers) where the Clipboard
// API is unavailable. Returns whether the copy succeeded.
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

export default function MobileDesktopNotice() {
  const [showNotice, setShowNotice] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear a pending "copied" reset if the notice unmounts mid-timer.
  useEffect(
    () => () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current)
    },
    []
  )

  useEffect(() => {
    // Check if user is on mobile and hasn't seen this version
    const isMobile = window.innerWidth < MOBILE_BREAKPOINT
    const seenVersion = localStorage.getItem(NOTICE_STORAGE_KEY)

    // Cleanup old localStorage key
    localStorage.removeItem('desktop-notice-seen')

    if (isMobile && seenVersion !== NOTICE_VERSION) {
      setShowNotice(true)
      analytics.noticeShown(NOTICE_VERSION)
    }
  }, [])

  // Mark this version seen and close. Fires NOTICE_IMAGE_LOADED_EVENT so course data
  // loads even if the preview image never did (see CourseSearch's load-order coupling).
  const closeNotice = () => {
    localStorage.setItem(NOTICE_STORAGE_KEY, NOTICE_VERSION)
    setShowNotice(false)
    window.dispatchEvent(new Event(NOTICE_IMAGE_LOADED_EVENT))
  }

  const dismissNotice = (method: 'backdrop' | 'button') => {
    analytics.noticeDismissed(NOTICE_VERSION, method)
    closeNotice()
  }

  // Copy the link and confirm inline. Used where the native share sheet is unavailable.
  const copyLinkFallback = async () => {
    if (!(await copyText(window.location.href))) return
    setCopied(true)
    if (copyResetRef.current) clearTimeout(copyResetRef.current)
    copyResetRef.current = setTimeout(() => setCopied(false), 2000)
    analytics.noticeShared(NOTICE_VERSION, 'copy')
    localStorage.setItem(NOTICE_STORAGE_KEY, NOTICE_VERSION)
  }

  // Bridge the user to desktop: open the native share sheet so they can send the link
  // to themselves (AirDrop, Messages, email…). Falls back to copying the link.
  const shareToDesktop = async () => {
    if (!navigator.share) {
      await copyLinkFallback()
      return
    }
    try {
      await navigator.share({
        title: 'Another CUHK Course Planner',
        url: window.location.href,
      })
    } catch (err) {
      // User cancelled the sheet — leave the notice open so they can retry or dismiss.
      if (err instanceof Error && err.name === 'AbortError') return
      // Any other failure — try the clipboard instead.
      await copyLinkFallback()
      return
    }
    analytics.noticeShared(NOTICE_VERSION, 'share')
    closeNotice()
  }

  if (!showNotice) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0, 0, 0, 0.1)' }}
      onClick={() => dismissNotice('backdrop')}
    >
      <div
        className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl w-full mx-4 p-6 border border-white/20 relative max-h-[90vh] overflow-y-auto"
        style={{ backdropFilter: 'blur(20px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => dismissNotice('button')}
          aria-label="Close"
          className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground select-none hover:bg-accent hover:text-foreground active:scale-90 transition-all"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="text-center mb-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Monitor className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-base font-bold text-foreground">Better on Computer</h2>
          </div>
          <p className="text-muted-foreground text-sm">
            This tool works best on desktop with side-by-side layout, live preview, and clearer
            display of course information.
          </p>
        </div>

        {/* Desktop Preview Image */}
        <div className="mb-4">
          <div className="w-full aspect-[8/5] bg-muted rounded-lg border border-border shadow-md overflow-hidden relative">
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-muted-foreground rounded-full animate-spin"></div>
                  <span className="text-sm text-muted-foreground">Loading preview...</span>
                </div>
              </div>
            )}
            <Image
              src="/og-image.png"
              alt="Desktop view showing shopping cart and weekly calendar side by side"
              fill
              className={`object-cover transition-opacity duration-300 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              onLoad={() => {
                setImageLoaded(true)
                // Dispatch event to signal image is ready
                // Listened by: CourseSearch.tsx (delays data loading until image loads)
                window.dispatchEvent(new Event(NOTICE_IMAGE_LOADED_EVENT))
              }}
              onError={() => {
                console.error('Preview image failed to load')
                // Still dispatch event to prevent blocking data load
                window.dispatchEvent(new Event(NOTICE_IMAGE_LOADED_EVENT))
              }}
              priority
            />
          </div>
        </div>

        {/* Actions */}
        <div>
          <div className="space-y-2">
            <Button
              onClick={shareToDesktop}
              size="lg"
              className={`w-full select-none active:scale-95 ${
                copied ? 'bg-emerald-600 text-white hover:bg-emerald-600' : ''
              }`}
            >
              {copied ? <Check /> : <Share2 />}
              {copied ? 'Link copied!' : 'Send link to my computer'}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => dismissNotice('button')}
              className="w-full text-muted-foreground select-none active:scale-95"
            >
              Continue on mobile
            </Button>
          </div>

          <div className="border-t mt-2 mb-3" />

          <p className="text-center text-xs text-muted-foreground">
            Can&apos;t send it now?
            <br />
            Just search{' '}
            <span className="font-medium text-foreground">
              &ldquo;Another CUHK Course Planner&rdquo;
            </span>{' '}
            later.
          </p>
        </div>
      </div>
    </div>
  )
}
