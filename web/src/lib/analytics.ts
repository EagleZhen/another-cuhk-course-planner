import { track } from '@vercel/analytics'

// Enhanced analytics for course planner MVP
export const analytics = {
  // Session tracking
  sessionStart: (term: string) => {
    track('session_start', { 
      term,
      timestamp: new Date().toISOString(),
      is_returning_user: localStorage.getItem('has_used_app') === 'true'
    })
    localStorage.setItem('has_used_app', 'true')
  },

  sessionEnd: (duration: number, coursesInCart: number) => {
    track('session_end', { 
      duration_minutes: Math.round(duration / 60),
      courses_in_cart: coursesInCart,
      completed_schedule: coursesInCart > 0
    })
  },

  // Loading performance
  catalogLoadStart: () => {
    const connection = (navigator as unknown as { connection?: { effectiveType?: string } })?.connection
    track('catalog_load_start', {
      connection: connection?.effectiveType || 'unknown'
    })
  },

  catalogLoadComplete: (loadTime: number, subjectsLoaded: number, totalDataSize: number) => {
    track('catalog_load_complete', {
      load_time_ms: Math.round(loadTime),
      subjects_loaded: subjectsLoaded,
      data_size_kb: Math.round(totalDataSize / 1024),
      performance_rating: loadTime < 5000 ? 'fast' : loadTime < 15000 ? 'medium' : 'slow'
    })
  },

  catalogLoadFailed: (error: string, retryCount: number) => {
    track('catalog_load_failed', { error_type: error, retry_count: retryCount })
  },

  // User actions
  courseSearch: (query: string, resultsCount: number, searchType: 'course_code' | 'title' | 'instructor' | 'mixed') => {
    track('course_search', {
      query_length: query.length,
      results_count: resultsCount,
      search_type: searchType,
      found_results: resultsCount > 0
    })
  },

  courseAdded: (courseCode: string, term: string, isFirstCourse: boolean) => {
    track('course_added', {
      course_code: courseCode,
      term,
      is_first_course: isFirstCourse
    })
  },

  courseRemoved: (courseCode: string, reason: 'conflict' | 'change_mind' | 'mistake' | 'other') => {
    track('course_removed', { course_code: courseCode, reason })
  },

  // Feature usage
  subjectFilterUsed: (subjectsCount: number, resultsNarrowed: boolean) => {
    track('subject_filter_used', {
      subjects_selected: subjectsCount,
      results_narrowed: resultsNarrowed
    })
  },

  termSwitched: (fromTerm: string, toTerm: string) => {
    track('term_switched', { from_term: fromTerm, to_term: toTerm })
  },

  // Errors and friction
  emptySearchResults: (query: string) => {
    track('empty_search_results', { 
      search_query: query.toLowerCase(),
      query_type: /^[A-Z]{4}\d{4}/.test(query) ? 'course_code' : 'other'
    })
  },

  calendarConflict: (conflictType: 'time_overlap' | 'section_incompatible') => {
    track('calendar_conflict', { conflict_type: conflictType })
  },

  // Performance insights
  userWaitedDuringLoading: (waitTime: number, abandonedEarly: boolean) => {
    track('loading_patience', {
      wait_time_ms: Math.round(waitTime),
      abandoned_early: abandonedEarly
    })
  }
}

// Helper to detect search type
export const detectSearchType = (query: string): 'course_code' | 'title' | 'instructor' | 'mixed' => {
  if (/^[A-Z]{4}\d{4}/.test(query.toUpperCase())) return 'course_code'
  if (/^[A-Z]{4}/.test(query.toUpperCase())) return 'course_code'
  if (query.includes(' ') && query.length > 10) return 'title'
  if (/^[A-Z][a-z]+ [A-Z]/.test(query)) return 'instructor'
  return 'mixed'
}
