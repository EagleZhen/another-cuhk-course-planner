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

// Analytics focused on validating core value hypotheses
export const analytics = {
  // === HYPOTHESIS 1: "App Helps People Plan Schedules" ===
  
  conflictResolved: (method: 'section_cycle' | 'course_removal' | 'manual_change', courseCount: number) => {
    track('conflict_resolved', { 
      resolution_method: method,
      remaining_courses: courseCount 
    })
  },
  
  sectionCycled: (successful: boolean, hadConflict: boolean) => {
    track('section_cycled', { 
      resolved_conflict: successful,
      was_conflict_resolution: hadConflict
    })
  },
  
  scheduleCompleted: (courseCount: number, conflictsResolved: number, sessionMinutes: number) => {
    track('schedule_completed', {
      final_course_count: courseCount,
      conflicts_resolved: conflictsResolved,
      session_duration_minutes: sessionMinutes,
      success: courseCount > 0
    })
  },

  // === HYPOTHESIS 2: "App Has Discovery/Browsing Value" ===
  
  courseExplored: (subject: string, addedToCart: boolean, timeSpentSeconds: number) => {
    track('course_explored', {
      subject: subject, // Aggregate by subject, not specific course
      resulted_in_enrollment: addedToCart,
      exploration_duration_seconds: timeSpentSeconds
    })
  },
  
  browsingSession: (subjectsVisited: string[], coursesViewed: number, coursesAdded: number) => {
    track('browsing_session', {
      subjects_explored: subjectsVisited,
      courses_viewed: coursesViewed,
      courses_added: coursesAdded,
      browse_to_add_ratio: coursesViewed > 0 ? coursesAdded / coursesViewed : 0
    })
  },
  
  searchPerformed: (hasResults: boolean, resultCount: number, selectedResult: boolean) => {
    track('search_performed', {
      found_results: hasResults,
      result_count: Math.min(resultCount, 50), // Cap for privacy
      resulted_in_selection: selectedResult
    })
  },

  // === OPTIMIZATION: Subject Loading Patterns ===
  
  subjectAccessed: (subject: string, accessOrder: number, resultedInSelection: boolean) => {
    track('subject_accessed', {
      subject,
      access_sequence: accessOrder,
      led_to_course_selection: resultedInSelection
    })
  },

  // === BASIC APP HEALTH ===
  
  appLoaded: (loadTimeSeconds: number, subjectsCount: number) => {
    track('app_loaded', {
      load_duration_seconds: loadTimeSeconds,
      subjects_available: subjectsCount
    })
  },
  
  sessionStarted: (term: string) => {
    track('session_started', { academic_term: term })
  }
}