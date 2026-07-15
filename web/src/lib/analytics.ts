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
  // `no_conflict_active`: was the no-conflict filter shaping the list at add time — the outcome signal.
  courseAdded: (course: string, subject: string, termName: string, noConflictActive: boolean) => {
    track('course_added', { course, subject, term: termName, no_conflict_active: noConflictActive })
  },

  // Track search effectiveness → informs discovery method priority (search vs browse)
  // Key question: What result count range leads to successful course selection?
  searchUsed: (resultsCount: number) => {
    track('search_used', { results_count: resultsCount })
  },

  // Track shuffle usage → validates course discovery encouragement feature
  // Key question: Do users actually want randomized course discovery?
  // Key decision: Should randomization be default behavior vs manual feature?
  shuffleUsed: (totalCourses: number) => {
    track('shuffle_used', { total_courses: totalCourses })
  },

  // Track shuffle reset → measures shuffle satisfaction via reset rate
  // Key insight: Reset rate <30% = good shuffle, >70% = shuffle frustrating users
  // Key analysis: shuffle_reset/shuffle_used ratio reveals discovery effectiveness
  shuffleReset: () => {
    track('shuffle_reset')
  },

  // === UX OPTIMIZATION ===

  // Track subject exploration → reveals which subjects students actively seek/avoid
  // Key decision: Should subject filters be more prominent in navigation?
  subjectToggled: (subject: string) => {
    track('subject_toggled', { subject })
  },

  // Track chip-filter usage (day / credits / level / career) → which catalog facets students narrow by.
  // `level` = numeric course level (code's first digit); `career` = UG/PG. (Pre-#203, `level` carried career values, since split into `career`.)
  // Key questions: which levels/credits/days matter? Is the default career (UG) right?
  chipFilterToggled: (filter: string, value: string, action: 'add' | 'remove') => {
    track('chip_filter_toggled', { filter, value, action })
  },

  // Track the no-conflict filter → is it used when it can help, or toggled on an empty-cart no-op?
  // `enrolled_count`: the active cart it filters against (0 = no-op).
  noConflictFilterToggled: (action: 'add' | 'remove', enrolledCount: number) => {
    track('no_conflict_filter_toggled', { action, enrolled_count: enrolledCount })
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
  },

  // === SCHEDULE FINALIZATION ===

  // Track ICS export → curiosity metric to understand schedule export trends
  icsExported: () => {
    track('ics_exported')
  },

  // Track ICS undo file generation → measures import mistake frequency
  // Key questions: How often do users need to undo? Is the feature valuable?
  icsUndo: () => {
    track('ics_undo')
  },

  // Track screenshot export → curiosity metric to understand schedule export trends
  screenshotTaken: () => {
    track('screenshot_taken')
  },

  // === MOBILE DESKTOP NOTICE ===

  // Track how often the desktop-nudge modal shows → is it engagement or just friction?
  noticeShown: (version: string) => {
    track('notice_shown', { version })
  },

  // Track dismissals by how the notice was closed → tapping outside vs. using a button.
  noticeDismissed: (version: string, method: 'backdrop' | 'button') => {
    track('notice_dismissed', { version, method })
  },

  // Track the desktop-bridge action → the win we care about, plus Web Share vs. copy reach.
  noticeShared: (version: string, method: 'share' | 'copy') => {
    track('notice_shared', { version, method })
  },

  // === PERFORMANCE ===

  // Track course data loading performance → identifies real-world load times across user networks
  // Key questions: What's the P90 load time? Are failures common? Which subjects are bottlenecks?
  courseDataLoaded: (stats: {
    totalLoadTimeMs: number
    subjectCount: number
    successCount: number
    failedCount: number
    totalSizeKb: number
    slowestSubject: string
    slowestTimeMs: number
    avgTimeMs: number
  }) => {
    track('course_data_loaded', {
      total_load_time_ms: stats.totalLoadTimeMs,
      subject_count: stats.subjectCount,
      success_count: stats.successCount,
      failed_count: stats.failedCount,
      total_size_kb: stats.totalSizeKb,
      slowest_subject: stats.slowestSubject,
      slowest_time_ms: stats.slowestTimeMs,
      avg_time_ms: stats.avgTimeMs,
    })
  },
}
