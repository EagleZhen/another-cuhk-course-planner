import { track } from '@vercel/analytics'

// Simple MVP analytics - 4 core questions only
export const analytics = {
  // 1. Is anyone using this? (Traffic & Users)
  userVisited: (term: string) => {
    track('user_visited', { term })
  },

  // 2. Does it work? (Technical Performance)
  catalogLoaded: (loadTimeSeconds: number, subjectsCount: number) => {
    track('catalog_loaded', {
      load_seconds: loadTimeSeconds,
      subjects: subjectsCount,
      technical_success: true
    })
  },

  catalogFailed: () => {
    track('catalog_failed', { technical_success: false })
  },

  // 3. Do people actually plan courses? (Core Feature Usage)
  courseAdded: (courseCode: string, isFirstCourse: boolean) => {
    track('course_added', {
      course: courseCode,
      first_course: isFirstCourse
    })
  },

  scheduleBuilt: (courseCount: number) => {
    track('schedule_built', {
      courses: courseCount,
      feature_success: courseCount > 0
    })
  },

  // 4. How good is the user experience? (UX Performance)
  searchUsed: (foundResults: boolean) => {
    track('search_used', {
      found_results: foundResults
    })
  },

  loadingExperience: (loadTimeSeconds: number) => {
    track('loading_ux', {
      load_seconds: loadTimeSeconds,
      ux_rating: loadTimeSeconds < 10 ? 'good' : loadTimeSeconds < 20 ? 'ok' : 'poor'
    })
  },

  userError: (errorType: string) => {
    track('user_error', { error: errorType })
  }
}
