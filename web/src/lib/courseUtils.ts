// Unified course utilities for conflict detection and data transformation
// Uses clean internal types with proper validation boundaries

import type { 
  TimeRange, 
  CalendarEvent, 
  CourseEnrollment, 
  ConflictZone, 
  InternalCourse, 
  InternalSection, 
  InternalMeeting, 
  SectionType 
} from './types'

// Re-export types for backward compatibility
export type {
  TimeRange,
  CalendarEvent,
  CourseEnrollment,
  ConflictZone,
  InternalCourse,
  InternalSection,
  InternalMeeting,
  SectionType
}

/**
 * Parse time string like "Mo 14:30 - 15:15" or "Th 1:30PM - 2:15PM" into structured time range
 */
export function parseTimeRange(timeStr: string): TimeRange | null {
  const dayMatch = timeStr.match(/(Mo|Tu|We|Th|Fr)/)
  
  if (!dayMatch) return null
  
  // Try 12-hour format first (e.g., "1:30PM - 2:15PM")
  const timeMatch12 = timeStr.match(/(\d{1,2}):(\d{2})(AM|PM)\s*-\s*(\d{1,2}):(\d{2})(AM|PM)/)
  if (timeMatch12) {
    let startHour = parseInt(timeMatch12[1])
    let endHour = parseInt(timeMatch12[4])
    
    // Convert to 24-hour format
    if (timeMatch12[3] === 'PM' && startHour !== 12) startHour += 12
    if (timeMatch12[3] === 'AM' && startHour === 12) startHour = 0
    if (timeMatch12[6] === 'PM' && endHour !== 12) endHour += 12
    if (timeMatch12[6] === 'AM' && endHour === 12) endHour = 0
    
    return {
      day: dayMatch[1],
      startHour,
      startMinute: parseInt(timeMatch12[2]),
      endHour,
      endMinute: parseInt(timeMatch12[5])
    }
  }
  
  // Fallback to 24-hour format (e.g., "14:30 - 15:15")
  const timeMatch24 = timeStr.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/)
  if (timeMatch24) {
    return {
      day: dayMatch[1],
      startHour: parseInt(timeMatch24[1]),
      startMinute: parseInt(timeMatch24[2]),
      endHour: parseInt(timeMatch24[3]),
      endMinute: parseInt(timeMatch24[4])
    }
  }
  
  return null
}

/**
 * Check if two time ranges overlap
 */
export function doTimesOverlap(time1: TimeRange, time2: TimeRange): boolean {
  if (time1.day !== time2.day) return false
  
  const start1 = time1.startHour * 60 + time1.startMinute
  const end1 = time1.endHour * 60 + time1.endMinute
  const start2 = time2.startHour * 60 + time2.startMinute
  const end2 = time2.endHour * 60 + time2.endMinute
  
  return start1 < end2 && start2 < end1
}

/**
 * Detect conflicts among calendar events and return events with hasConflict flag
 */
export function detectConflicts(events: CalendarEvent[]): CalendarEvent[] {
  const visibleEvents = events.filter(event => event.isVisible)
  
  return events.map(event => {
    if (!event.isVisible) {
      return { ...event, hasConflict: false }
    }
    
    const eventTime = parseTimeRange(event.time)
    if (!eventTime) {
      return { ...event, hasConflict: false }
    }
    
    const hasConflict = visibleEvents.some(other => {
      if (other.id === event.id) return false
      
      const otherTime = parseTimeRange(other.time)
      if (!otherTime) return false
      
      return doTimesOverlap(eventTime, otherTime)
    })
    
    return { ...event, hasConflict }
  })
}

/**
 * Convert course enrollments to calendar events with day/time info
 */
export function enrollmentsToCalendarEvents(enrollments: CourseEnrollment[]): CalendarEvent[] {
  const events: CalendarEvent[] = []
  
  enrollments
    .filter(enrollment => enrollment.isVisible)
    .forEach(enrollment => {
      enrollment.selectedSections.forEach(section => {
        section.meetings.forEach(meeting => {
          const timeRange = parseTimeRange(meeting.time)
          const dayIndex = getDayIndex(meeting.time)
          
          events.push({
            id: `${enrollment.courseId}_${section.id}_${meeting.time}`,
            subject: enrollment.course.subject,
            courseCode: enrollment.course.courseCode,
            title: enrollment.course.title,
            sectionCode: section.sectionCode,
            sectionType: section.sectionType,
            time: meeting.time,
            location: meeting.location,
            instructor: meeting.instructor,
            credits: enrollment.course.credits,
            color: enrollment.color,
            isVisible: enrollment.isVisible,
            hasConflict: false, // Will be computed later
            enrollmentId: enrollment.courseId,
            day: dayIndex,
            startHour: timeRange?.startHour || 9,
            endHour: timeRange?.endHour || 10,
            startMinute: timeRange?.startMinute || 0,
            endMinute: timeRange?.endMinute || 0
          })
        })
      })
    })
  
  return events
}

/**
 * Get day index from time string (0=Monday, 1=Tuesday, etc.)
 */
export function getDayIndex(timeStr: string): number {
  if (timeStr.includes('Mo')) return 0
  if (timeStr.includes('Tu')) return 1
  if (timeStr.includes('We')) return 2
  if (timeStr.includes('Th')) return 3
  if (timeStr.includes('Fr')) return 4
  return 0
}

/**
 * Group overlapping calendar events for visual stacking
 */
export function groupOverlappingEvents(events: CalendarEvent[]): CalendarEvent[][] {
  const groups: CalendarEvent[][] = []
  const processed = new Set<string>()

  for (const event of events) {
    if (processed.has(event.id)) continue

    const group = [event]
    processed.add(event.id)

    // Find overlapping events
    for (const otherEvent of events) {
      if (processed.has(otherEvent.id)) continue

      if (eventsOverlap(event, otherEvent)) {
        group.push(otherEvent)
        processed.add(otherEvent.id)
      }
    }

    groups.push(group)
  }

  return groups
}

/**
 * Check if two calendar events overlap in time
 */
export function eventsOverlap(event1: CalendarEvent, event2: CalendarEvent): boolean {
  if (event1.day !== event2.day) return false
  
  const start1 = event1.startHour * 60 + event1.startMinute
  const end1 = event1.endHour * 60 + event1.endMinute
  const start2 = event2.startHour * 60 + event2.startMinute
  const end2 = event2.endHour * 60 + event2.endMinute

  return start1 < end2 && start2 < end1
}

/**
 * Calculate conflict zones for calendar background highlighting
 */
export function getConflictZones(events: CalendarEvent[]): ConflictZone[] {
  const zones: ConflictZone[] = []
  const eventGroups = groupOverlappingEvents(events)
  
  eventGroups.forEach(group => {
    if (group.length > 1) {
      // Find the time range that covers all conflicting events
      const minStart = Math.min(...group.map(e => e.startHour * 60 + e.startMinute))
      const maxEnd = Math.max(...group.map(e => e.endHour * 60 + e.endMinute))
      
      zones.push({
        startHour: Math.floor(minStart / 60),
        startMinute: minStart % 60,
        endHour: Math.floor(maxEnd / 60),
        endMinute: maxEnd % 60
      })
    }
  })
  
  return zones
}

// Section type grouping interface
export interface SectionTypeGroup {
  type: SectionType
  displayName: string
  icon: string
  sections: InternalSection[]
}

/**
 * Parse section types from course data for a specific term
 */
export function parseSectionTypes(course: InternalCourse, termName: string): SectionTypeGroup[] {
  const term = course.terms.find(t => t.termName === termName)
  if (!term?.sections) return []
  
  // Group sections by type
  const groups = new Map<SectionType, InternalSection[]>()
  
  term.sections.forEach(section => {
    const type = section.sectionType
    
    if (!groups.has(type)) {
      groups.set(type, [])
    }
    
    groups.get(type)!.push(section)
  })
  
  // Convert to SectionTypeGroup array
  return Array.from(groups.entries()).map(([type, sections]) => ({
    type,
    displayName: getSectionTypeName(type),
    icon: getSectionTypeIcon(type),
    sections
  }))
}

/**
 * Get display name for section type
 */
export function getSectionTypeName(type: SectionType): string {
  const names: Record<SectionType, string> = {
    'LEC': 'Lecture',
    'TUT': 'Tutorial',
    'LAB': 'Laboratory', 
    'EXR': 'Exercise',
    'SEM': 'Seminar',
    'PRJ': 'Project',
    'WKS': 'Workshop',
    'PRA': 'Practical',
    'FLD': 'Field Work',
    'OTHER': 'Other'
  }
  return names[type]
}

/**
 * Get icon for section type
 */
export function getSectionTypeIcon(type: SectionType): string {
  const icons: Record<SectionType, string> = {
    'LEC': '📚',
    'TUT': '📝',
    'LAB': '🧪',
    'EXR': '💪',
    'SEM': '🗣️',
    'PRJ': '🛠️',
    'WKS': '👥',
    'PRA': '⚙️',
    'FLD': '🌍',
    'OTHER': '📋'
  }
  return icons[type]
}

/**
 * Check if a course enrollment is complete (has all required section types selected)
 */
export function isCourseEnrollmentComplete(
  course: InternalCourse, 
  termName: string, 
  selectedSections: Map<string, string>
): boolean {
  const sectionTypes = parseSectionTypes(course, termName)
  const courseKey = `${course.subject}${course.courseCode}`
  
  // Check if we have a selection for each section type
  return sectionTypes.every(typeGroup => {
    const selectionKey = `${courseKey}_${typeGroup.type}`
    return selectedSections.has(selectionKey)
  })
}

/**
 * Get selected sections for a course enrollment
 */
export function getSelectedSectionsForCourse(
  course: InternalCourse,
  termName: string,
  selectedSections: Map<string, string>
): InternalSection[] {
  const sectionTypes = parseSectionTypes(course, termName)
  const courseKey = `${course.subject}${course.courseCode}`
  const result: InternalSection[] = []
  
  sectionTypes.forEach(typeGroup => {
    const selectionKey = `${courseKey}_${typeGroup.type}`
    const selectedSectionId = selectedSections.get(selectionKey)
    
    if (selectedSectionId) {
      const section = typeGroup.sections.find(s => s.id === selectedSectionId)
      if (section) {
        result.push(section)
      }
    }
  })
  
  return result
}

// 72-color palette for deterministic color assignment (excluding 400 shades for better contrast)
// Hardcoded to ensure all classes are included in Tailwind build
const DETERMINISTIC_COLORS = [
  // Blue family
  'bg-blue-500', 'bg-blue-600', 'bg-blue-700', 'bg-blue-800',
  // Sky family
  'bg-sky-500', 'bg-sky-600', 'bg-sky-700', 'bg-sky-800',
  // Cyan family
  'bg-cyan-500', 'bg-cyan-600', 'bg-cyan-700', 'bg-cyan-800',
  // Teal family
  'bg-teal-500', 'bg-teal-600', 'bg-teal-700', 'bg-teal-800',
  // Emerald family
  'bg-emerald-500', 'bg-emerald-600', 'bg-emerald-700', 'bg-emerald-800',
  // Green family
  'bg-green-500', 'bg-green-600', 'bg-green-700', 'bg-green-800',
  // Amber family
  'bg-amber-500', 'bg-amber-600', 'bg-amber-700', 'bg-amber-800',
  // Orange family
  'bg-orange-500', 'bg-orange-600', 'bg-orange-700', 'bg-orange-800',
  // Pink family
  'bg-pink-500', 'bg-pink-600', 'bg-pink-700', 'bg-pink-800',
  // Rose family
  'bg-rose-500', 'bg-rose-600', 'bg-rose-700', 'bg-rose-800',
  // Fuchsia family
  'bg-fuchsia-500', 'bg-fuchsia-600', 'bg-fuchsia-700', 'bg-fuchsia-800',
  // Purple family
  'bg-purple-500', 'bg-purple-600', 'bg-purple-700', 'bg-purple-800',
  // Violet family
  'bg-violet-500', 'bg-violet-600', 'bg-violet-700', 'bg-violet-800',
  // Indigo family
  'bg-indigo-500', 'bg-indigo-600', 'bg-indigo-700', 'bg-indigo-800',
  // Slate family
  'bg-slate-500', 'bg-slate-600', 'bg-slate-700', 'bg-slate-800',
  // Gray family
  'bg-gray-500', 'bg-gray-600', 'bg-gray-700', 'bg-gray-800',
  // Zinc family
  'bg-zinc-500', 'bg-zinc-600', 'bg-zinc-700', 'bg-zinc-800',
  // Stone family
  'bg-stone-500', 'bg-stone-600', 'bg-stone-700', 'bg-stone-800'
] as const

/**
 * Generate deterministic color for course based on course code
 */
export function getDeterministicColor(courseCode: string): string {
  // Using pre-generated color palette for server/client consistency
  
  // Improved hash function - polynomial rolling hash with proper mixing
  let hash = 0
  const prime = 31 // Well-known prime used in Java String.hashCode()
  
  // Compute polynomial hash without early modulo to avoid collisions
  for (let i = 0; i < courseCode.length; i++) {
    hash = hash * prime + courseCode.charCodeAt(i)
  }
  
  // MurmurHash3-style finalizer for better distribution
  hash = hash ^ (hash >>> 16)
  hash = (hash * 0x85ebca6b) >>> 0  // Multiply by well-researched constant
  hash = hash ^ (hash >>> 13)
  hash = (hash * 0xc2b2ae35) >>> 0  // Second mixing constant
  hash = hash ^ (hash >>> 16)
  
  return DETERMINISTIC_COLORS[Math.abs(hash) % DETERMINISTIC_COLORS.length]
}