// PostHog initialization for Next.js 15+ (instrumentation-client pattern)
// Runs client-side before the app becomes interactive

/* FUTURE ANALYTICS NAMING CONVENTION:
 * - Use snake_case: course_search, subject_access
 * - Use category:object_action format: "subject_access:csci_button_click"
 * - Present tense verbs: click, submit, create, view, add
 * - Boolean properties: is_subscribed, has_conflicts
 * - Timestamps: user_creation_date, last_visit_timestamp
 */

import posthog from 'posthog-js'

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY

// Initialize PostHog for all environments (filter in dashboard by hostname)
if (typeof window !== 'undefined' && posthogKey) {
  posthog.init(posthogKey, {
    api_host: '/x8m2k', // Reverse proxy on Cloudflare (bypasses ad blockers)
    ui_host: 'https://us.posthog.com', // PostHog dashboard (always the same for US region)

    // Privacy-first settings for student users
    person_profiles: 'never', // Don't create user profiles
    // Captured manually below, so we can strip UTM right after.
    capture_pageview: false,
    capture_pageleave: true, // Session duration tracking

    // Disable potentially intrusive features
    disable_session_recording: true, // No session recordings
    autocapture: false, // No automatic click tracking

    // Clean URL tracking (remove query params)
    sanitize_properties: (properties) => {
      if (properties.$current_url) {
        properties.$current_url = properties.$current_url.split('?')[0]
      }
      return properties
    },
  })

  // Capture the pageview (records UTM), then strip utm_* from the URL — else a
  // lingering ?utm_source=... sticks to bookmarks and re-shares, mis-attributing
  // later visits.
  posthog.capture('$pageview', { title: document.title })
  stripCampaignParams()
}

function stripCampaignParams() {
  const url = new URL(window.location.href)
  let changed = false
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith('utm_')) {
      url.searchParams.delete(key)
      changed = true
    }
  }
  if (changed) {
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  }
}
