/**
 * App-wide constants
 */

// Mobile notice configuration
export const MOBILE_BREAKPOINT = 768 // Tailwind md breakpoint
export const NOTICE_STORAGE_KEY = 'desktop-notice-version'
export const NOTICE_VERSION = '2' // Bump to re-show notice to all users
export const NOTICE_IMAGE_LOADED_EVENT = 'mobile-notice-image-loaded'

// Data versioning
export const SCHEDULE_DATA_VERSION = 3

// Default selected term. Bump on rollover manually for now.
export const DEFAULT_CURRENT_TERM = '2026-27 Term 1'

// Academic year the app eager-loads, derived from the default term (a term name
// is "YYYY-YY <suffix>"). The single current-year knob is DEFAULT_CURRENT_TERM.
export const CURRENT_ACADEMIC_YEAR = DEFAULT_CURRENT_TERM.split(' ')[0]
