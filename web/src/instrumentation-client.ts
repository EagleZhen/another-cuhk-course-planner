// PostHog initialization for Next.js 15+ (instrumentation-client pattern)
// Runs client-side before the app becomes interactive
import posthog from 'posthog-js'

if (typeof window !== 'undefined') {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
    
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