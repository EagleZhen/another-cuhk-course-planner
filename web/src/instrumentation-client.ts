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

// Filter out internal users to prevent skewed analytics data
const isInternalUser = () => {
  if (typeof window === 'undefined') return false
  
  const hostname = window.location.hostname
  return (
    hostname === 'localhost' ||
    // hostname.includes('vercel.app') // Preview deployments
    // Add other internal domains as needed
  )
}

// Only initialize PostHog for real users (not internal testing)
if (typeof window !== 'undefined' && !isInternalUser()) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: '/x8m2k', // Use reverse proxy to bypass ad blockers
    ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST, // PostHog dashboard links
    
    // Privacy-first settings for student users
    person_profiles: 'never', // Don't create user profiles
    capture_pageview: true,   // Automatic page view tracking (replaces Vercel Analytics)
    capture_pageleave: true,  // Session duration tracking
    
    // Disable potentially intrusive features  
    disable_session_recording: true, // No session recordings
    autocapture: false, // No automatic click tracking
    
    // Clean URL tracking (remove query params)
    sanitize_properties: (properties) => {
      if (properties.$current_url) {
        properties.$current_url = properties.$current_url.split('?')[0]
      }
      return properties
    }
  })
  
  console.log('📊 PostHog initialized - replacing Vercel Analytics')
}