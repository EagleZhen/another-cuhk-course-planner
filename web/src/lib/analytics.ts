// PostHog Analytics - Privacy-First Value Tracking
// PostHog is initialized in instrumentation-client.ts

declare global {
  interface Window {
    posthog?: {
      capture: (event: string, properties?: Record<string, unknown>) => void;
    };
  }
}

// Simple tracking helper that safely handles PostHog availability
const track = (event: string, properties?: Record<string, unknown>) => {
  if (typeof window !== 'undefined' && window.posthog) {
    window.posthog.capture(event, properties)
  }
}

// Analytics focused ONLY on validating core value hypotheses
export const analytics = {
  // === HYPOTHESIS 1: "App Helps People Plan Schedules" ===
  
  // Track when section cycling is used (key utility feature)
  sectionCycled: (course: string) => {
    track('section_cycled', { course })
  },

  // === HYPOTHESIS 2: "App Has Discovery/Browsing Value" ===
  
  // Track course detail viewing (discovery behavior)
  courseViewed: (course: string, subject: string) => {
    track('course_viewed', { course, subject })
  },
  
  // Track course enrollment (conversion from discovery)
  courseAdded: (course: string, subject: string) => {
    track('course_added', { course, subject })
  },
  
  // Track search usage (key discovery method)
  searchUsed: (resultsCount: number) => {
    track('search_used', { results_count: resultsCount })
  },

  // === UX OPTIMIZATION ===
  
  // Track subject exploration intent
  subjectToggled: (subject: string) => {
    track('subject_toggled', { subject })
  }
}