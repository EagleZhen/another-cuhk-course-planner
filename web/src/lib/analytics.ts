// PostHog Analytics - Privacy-First Value Tracking
// PostHog is initialized in instrumentation-client.ts

import posthog from 'posthog-js'

// Simple tracking helper using direct PostHog import
const track = (event: string, properties?: Record<string, unknown>) => {
  if (typeof window !== 'undefined') {
    posthog.capture(event, properties)
  }
}

// Analytics focused ONLY on validating core value hypotheses
export const analytics = {
  // === HYPOTHESIS 1: "App Helps People Plan Schedules" ===
  
  // Track section cycling → validates scheduling utility value
  // Key question: Is cycling feature worth maintaining vs simple dropdowns?
  sectionCycled: (course: string) => {
    track('section_cycled', { course })
  },

  // === HYPOTHESIS 2: "App Has Discovery/Browsing Value" ===
  
  // Track course viewing → measures exploration behavior
  // Key question: Are students browsing casually or with enrollment intent?
  courseViewed: (course: string, subject: string) => {
    track('course_viewed', { course, subject })
  },
  
  // Track enrollment → measures conversion from discovery to action
  // Key decision: Focus on discovery features vs planning/utility features?
  courseAdded: (course: string, subject: string) => {
    track('course_added', { course, subject })
  },
  
  // Track search effectiveness → informs discovery method priority (search vs browse)
  // Key question: What result count range leads to successful course selection?
  searchUsed: (resultsCount: number) => {
    track('search_used', { results_count: resultsCount })
  },

  // === UX OPTIMIZATION ===
  
  // Track subject exploration → reveals which subjects students actively seek/avoid
  // Key decision: Should subject filters be more prominent in navigation?
  subjectToggled: (subject: string) => {
    track('subject_toggled', { subject })
  }
}