// FUTURE: PostHog Analytics Implementation
// This file is prepared for PostHog analytics but currently unused to reduce Edge requests.
// When Edge request consumption is under control, uncomment and implement PostHog tracking.

/*
// PostHog will be initialized in instrumentation-client.ts
declare global {
  interface Window {
    posthog?: {
      capture: (event: string, properties?: Record<string, unknown>) => void;
    };
  }
}

// Simple way to handle PostHog not being loaded yet
const track = (event: string, properties?: Record<string, unknown>) => {
  if (typeof window !== 'undefined' && window.posthog) {
    window.posthog.capture(event, properties)
  }
}

// Analytics focused on 3 critical questions for future implementation:
export const analytics = {
  // === QUESTION 1: "How well used is my app?" ===
  userVisited: (term: string) => track('page_visit', { term }),
  scheduleCompleted: (courseCount: number, timeSpent: number, conflicts: number) => 
    track('schedule_completed', { courses: courseCount, time_minutes: timeSpent, conflicts_resolved: conflicts }),
  
  // === QUESTION 2: "How is it helping users?" ===
  conflictDetected: (courses: string[], resolved: boolean) => 
    track('conflict_detected', { conflicting_courses: courses, user_resolved: resolved }),
  
  // === QUESTION 3: "Subject access patterns for optimization" ===
  subjectAccessed: (subject: string, order: number, timeFromLoad: number, selected: boolean) =>
    track('subject_accessed', { subject, access_order: order, time_from_load: timeFromLoad, resulted_in_selection: selected }),
  
  // === PRESERVED: Basic tracking events ===
  catalogLoaded: (loadTime: number, subjects: number) =>
    track('catalog_loaded', { load_seconds: loadTime, subjects_count: subjects }),
    
  courseAdded: (courseCode: string, isFirst: boolean) =>
    track('course_added', { course: courseCode, first_course: isFirst }),
    
  searchUsed: (foundResults: boolean) =>
    track('search_used', { found_results: foundResults })
}
*/