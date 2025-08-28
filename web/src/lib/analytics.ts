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
  
  // Track enrollment → measures conversion from discovery to action (KEEP term for planning analysis)
  // Key decisions: Focus on discovery vs planning features? Which terms get enrollment activity?
  courseAdded: (course: string, subject: string, termName: string) => {
    track('course_added', { course, subject, term: termName })
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
  },

  // === COURSE MANAGEMENT BEHAVIOR ===
  
  // Track course visibility toggles → reveals organization patterns
  // Key questions: Is hiding primarily for conflict resolution or general organization?
  courseVisibilityToggled: (course: string, action: 'hidden' | 'shown') => {
    track('course_visibility_toggled', { course, action })
  },
  
  // Track course removal → reveals deletion patterns vs conflict resolution
  // Key questions: How often do users delete courses vs other management methods?
  courseRemoved: (course: string, subject: string) => {
    track('course_removed', { course, subject })
  },

  // === CONFLICT RESOLUTION ===
  
  // Track successful conflict resolution → validates core scheduling utility
  // Key question: Does conflict detection actually help users succeed?
  // Cross-analyze with general usage patterns above to understand conflict-specific behavior
  conflictResolved: (resolutionMethod: string) => {
    track('conflict_resolved', { resolution_method: resolutionMethod })
  },

  // === PLANNING BEHAVIOR ===
  
  // Track term switches → reveals active planning behavior patterns
  // Key questions: How often do users actively switch between terms?
  // Key decisions: Focus on current term UX vs multi-semester planning features?
  termAccessed: (termName: string) => {
    track('term_accessed', { term: termName })
  }
}