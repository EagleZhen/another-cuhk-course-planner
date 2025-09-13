/**
 * Calendar configuration system for WeeklyCalendar
 * Centralizes all calendar-related constants and configuration options
 * 
 * Uses CalendarEvent.day convention: 0=Monday, 1=Tuesday, 2=Wednesday, 3=Thursday, 4=Friday, 5=Saturday, 6=Sunday
 * This matches the existing CalendarEvent data structure and eliminates conversion overhead.
 */

/** Day keys for readable configuration */
export type WeekDay = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'

/** Day information with CalendarEvent.day index mapping */
export interface DayInfo {
  /** CalendarEvent.day index (0=Monday, 1=Tuesday, etc.) */
  index: number
  /** Full day name for display */
  displayName: string  
  /** Whether this is a weekend day */
  isWeekend: boolean
}

/**
 * Single source of truth for all day information.
 * Maps readable day keys to CalendarEvent.day indices and metadata.
 * Eliminates the need for multiple mapping functions.
 */
export const DAYS: Record<WeekDay, DayInfo> = {
  'Mon': { index: 0, displayName: 'Monday', isWeekend: false },
  'Tue': { index: 1, displayName: 'Tuesday', isWeekend: false },
  'Wed': { index: 2, displayName: 'Wednesday', isWeekend: false },
  'Thu': { index: 3, displayName: 'Thursday', isWeekend: false },
  'Fri': { index: 4, displayName: 'Friday', isWeekend: false },
  'Sat': { index: 5, displayName: 'Saturday', isWeekend: true },
  'Sun': { index: 6, displayName: 'Sunday', isWeekend: true }
} as const

/** Predefined day combinations for common calendar configurations */
export const DAY_COMBINATIONS = {
  /** Monday through Friday - standard work/school week */
  weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as WeekDay[],
  /** Saturday and Sunday - weekend days */
  weekends: ['Sat', 'Sun'] as WeekDay[],
  /** All seven days - complete week */
  full: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as WeekDay[]
} as const

/** Configuration for what information to display on course cards */
export interface CalendarDisplayConfig {
  /** Show course time (e.g., "09:30-10:15") */
  showTime: boolean
  /** Show course location (e.g., "LSK LT4") */
  showLocation: boolean
  /** Show instructor name */  
  showInstructor: boolean
  /** Show full course title */
  showTitle: boolean
}

/** Complete calendar layout and behavior configuration */
export interface CalendarLayoutConfig {
  /** Which days to show in the calendar */
  activeDays: WeekDay[]
  /** Earliest hour to display (24-hour format) */
  startHour: number
  /** Latest hour to display (24-hour format) */
  endHour: number
  /** What information to show on course cards */
  displayConfig: CalendarDisplayConfig
  /** Whether weekend days are included in activeDays */
  showWeekends: boolean
}

/**
 * Fixed calendar layout constants that never change regardless of content.
 * These values ensure consistent visual appearance across all calendar configurations.
 */
export const CALENDAR_LAYOUT_CONSTANTS = {
  /** Height of each hour time slot in pixels (baseline before dynamic scaling) */
  BASE_HOUR_SLOT_HEIGHT: 64,
  /** Width of the time labels column displaying hours (e.g., "09", "10", "11") */
  TIME_LABEL_COLUMN_WIDTH: 48,
  /** Pixel offset for stacking overlapping course cards to show conflicts */
  CONFLICT_CARD_STACK_OFFSET: 16,
  /** Internal padding inside each course card for text spacing */
  COURSE_CARD_PADDING: 4,
  /** Absolute minimum height for very short events (accessibility requirement) */
  MINIMUM_CARD_HEIGHT: 24,
} as const

/**
 * Typography styles for consistent course card text rendering.
 * Prioritized by information importance in timetable context.
 */
export const TEXT_STYLES = {
  /** Course code styling - most important identifier (e.g., "CSCI3100-A") */
  COURSE_CODE: 'text-xs font-semibold leading-tight',
  /** Course title styling - secondary information, smaller than course code */
  TITLE: 'text-[9px] leading-tight opacity-85',
  /** Time styling - critical scheduling information */
  TIME: 'text-[10px] leading-tight opacity-90',
  /** Location styling - critical navigation information */
  LOCATION: 'text-[10px] leading-tight opacity-85',
  /** Instructor styling - less critical for daily scheduling */
  INSTRUCTOR: 'text-[8px] leading-tight opacity-70',
} as const

/**
 * Row height constants matching typography styles (in pixels).
 * Used for dynamic height calculation based on displayed information.
 */
export const ROW_HEIGHTS = {
  /** Height for course code + section type row */
  COURSE_CODE: 14,
  /** Height for course title row */
  TITLE: 11,
  /** Height for time information row */
  TIME: 12,
  /** Height for location information row */
  LOCATION: 12,
  /** Height for instructor information row */
  INSTRUCTOR: 10,
} as const

/**
 * Minimum class duration used as baseline for dynamic height calculation.
 * 45 minutes is the shortest CUHK course duration - ensures even the smallest courses
 * can display all required information properly, then longer courses scale proportionally.
 */
export const MINIMUM_COURSE_DURATION_MINUTES = 45

// Default calendar configuration
export const DEFAULT_CALENDAR_CONFIG: CalendarLayoutConfig = {
  activeDays: DAY_COMBINATIONS.weekdays,
  startHour: 8,
  endHour: 18,
  displayConfig: {
    showTitle: false,
    showTime: true,
    showLocation: true,
    showInstructor: false,
  },
  showWeekends: false
}

/**
 * Simple utility functions for day operations.
 * No complex mapping - uses the single source of truth DAYS registry.
 */

/** Get CalendarEvent.day index from readable day key */
export function getDayIndex(day: WeekDay): number {
  return DAYS[day].index
}

/** Get readable day key from CalendarEvent.day index */
export function getDayKey(index: number): WeekDay {
  // Simple lookup - no complex mapping needed
  const dayEntry = Object.entries(DAYS).find(([_, info]) => info.index === index)
  if (!dayEntry) throw new Error(`Invalid day index: ${index}`)
  return dayEntry[0] as WeekDay
}

/** Check if a day is a weekend */
export function isWeekend(day: WeekDay): boolean {
  return DAYS[day].isWeekend
}

/**
 * Detect if any events occur on weekends (Saturday or Sunday).
 * Uses binary logic: if ANY weekend course exists, show full week.
 */
export function hasWeekendCourses(events: Array<{ day: number }>): boolean {
  return events.some(event => event.day === 5 || event.day === 6) // Saturday=5, Sunday=6
}

/**
 * Get appropriate days to display based on events.
 * Academic week approach: Monday-first, show weekends only when needed.
 */
export function getRequiredDays(events: Array<{ day: number }>): WeekDay[] {
  return hasWeekendCourses(events) ? DAY_COMBINATIONS.full : DAY_COMBINATIONS.weekdays
}

/**
 * Generate CSS grid-template-columns string for calendar layout.
 * Creates responsive column layout: fixed time column + equal day columns.
 */
export function getGridColumns(dayCount: number): string {
  const timeColumnWidth = CALENDAR_LAYOUT_CONSTANTS.TIME_LABEL_COLUMN_WIDTH
  const dayColumns = Array(dayCount).fill('1fr').join(' ')
  return `${timeColumnWidth}px ${dayColumns}`
}

/** Get calendar configuration with weekend support */
export function getCalendarConfigWithWeekends(includeWeekends: boolean): CalendarLayoutConfig {
  return {
    ...DEFAULT_CALENDAR_CONFIG,
    activeDays: includeWeekends ? DAY_COMBINATIONS.full : DAY_COMBINATIONS.weekdays,
    showWeekends: includeWeekends
  }
}