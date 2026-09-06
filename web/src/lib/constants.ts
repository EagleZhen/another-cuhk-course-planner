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

// CUHK's timezone. Pin it wherever a date is formatted or parsed: the page is
// prerendered at build time, so reading the ambient zone instead would make the
// build machine's output disagree with the browser's and break hydration.
export const HONG_KONG_TIMEZONE = 'Asia/Hong_Kong'

// Suffix for times shown in that zone. Kept next to it so the two stay in step.
// Only CLDR's en-HK locale carries "HKT" — other English locales fall back to
// "GMT+8" — so a literal keeps the build and the browser in agreement whatever
// locale data each one ships.
export const HONG_KONG_TIMEZONE_LABEL = 'HKT'

// Default selected term. Bump on rollover manually for now.
export const DEFAULT_CURRENT_TERM = '2026-27 Term 1'

// Academic year the app eager-loads, derived from the default term (a term name
// is "YYYY-YY <suffix>"). The single current-year knob is DEFAULT_CURRENT_TERM.
export const CURRENT_ACADEMIC_YEAR = DEFAULT_CURRENT_TERM.split(' ')[0]

// Marks a tab that reloaded itself to recover from a stale chunk. Doubles as the loop
// guard, so it is cleared only once a page renders (see StaleVersionNotice).
export const STALE_CHUNK_RELOAD_KEY = 'stale-chunk-reloaded'
