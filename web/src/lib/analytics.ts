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
  
  // Track course browsing without enrollment (discovery value)
  courseViewed: (course: string, addedToCart: boolean) => {
    track('course_viewed', {
      course,
      resulted_in_enrollment: addedToCart
    })
  },

  // === OPTIMIZATION: Critical for Edge Request Decisions ===
  
  // Track which subjects are accessed (for JSON loading optimization)
  subjectAccessed: (subject: string) => {
    track('subject_accessed', { subject })
  }
}