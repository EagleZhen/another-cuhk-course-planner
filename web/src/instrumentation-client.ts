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

// Initialize PostHog for all environments (filter in dashboard by hostname)
if (typeof window !== 'undefined') {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: '/x8m2k', // Reverse proxy on Cloudflare (bypasses ad blockers)
    ui_host: 'https://us.posthog.com', // PostHog dashboard (always the same for US region)
    
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