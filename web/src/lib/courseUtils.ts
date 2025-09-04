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
  SectionAvailability,
  SectionType,
  SectionTypeGroup
} from './types'
import { SECTION_TYPE_CONFIG } from './types'

/**
 * Extract section type from section code using centralized config
 */
export function extractSectionType(sectionCode: string): string {
  const sectionTypes = Object.keys(SECTION_TYPE_CONFIG)
  const foundType = sectionTypes.find(type => 
    sectionCode.includes(type) || 
    SECTION_TYPE_CONFIG[type as keyof typeof SECTION_TYPE_CONFIG].aliases.some(alias => 
      sectionCode.includes(alias)
    )
  )
  return foundType || '?'
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
    
    const startMinute = parseInt(timeMatch12[2])
    const endMinute = parseInt(timeMatch12[5])
    
    // Check for 0-duration events (e.g., "Fr 12:00AM - 12:00AM") - treat as unscheduled
    if (startHour === endHour && startMinute === endMinute) {
      return null
    }
    
    return {
      day: dayMatch[1],
      startHour,
      startMinute,
      endHour,
      endMinute
    }
  }
  
  // Fallback to 24-hour format (e.g., "14:30 - 15:15")
  const timeMatch24 = timeStr.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/)
  if (timeMatch24) {
    const startHour = parseInt(timeMatch24[1])
    const startMinute = parseInt(timeMatch24[2])
    const endHour = parseInt(timeMatch24[3])
    const endMinute = parseInt(timeMatch24[4])
    
    // Check for 0-duration events (e.g., "Mo 14:30 - 14:30") - treat as unscheduled
    if (startHour === endHour && startMinute === endMinute) {
      return null
    }
    
    return {
      day: dayMatch[1],
      startHour,
      startMinute,
      endHour,
      endMinute
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
    .filter(enrollment => enrollment.isVisible && !enrollment.isInvalid)
    .forEach(enrollment => {
      enrollment.selectedSections.forEach(section => {
        section.meetings.forEach(meeting => {
          const timeRange = parseTimeRange(meeting.time)
          const dayIndex = getDayIndex(meeting.time)
          
          // Skip meetings without scheduled times (TBA, etc.)
          if (!timeRange || dayIndex === -1) {
            return
          }
          
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
 * Get unscheduled course sections (TBA meetings) from enrollments
 */
export function getUnscheduledSections(enrollments: CourseEnrollment[]): Array<{
  enrollment: CourseEnrollment
  section: InternalSection
  meeting: InternalMeeting
}> {
  const unscheduledSections: Array<{
    enrollment: CourseEnrollment
    section: InternalSection
    meeting: InternalMeeting
  }> = []
  
  enrollments
    .filter(enrollment => enrollment.isVisible && !enrollment.isInvalid)
    .forEach(enrollment => {
      enrollment.selectedSections.forEach(section => {
        section.meetings.forEach(meeting => {
          const timeRange = parseTimeRange(meeting.time)
          const dayIndex = getDayIndex(meeting.time)
          
          // Include meetings without scheduled times (TBA, etc.)
          if (!timeRange || dayIndex === -1) {
            unscheduledSections.push({
              enrollment,
              section,
              meeting
            })
          }
        })
      })
    })
  
  return unscheduledSections
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
  return -1 // Return -1 for times without valid day info (TBA, etc.)
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

/**
 * Parse section types from course data for a specific term
 * Uses data-driven ordering based on scraped JSON order (reflects official catalog)
 */
export function parseSectionTypes(course: InternalCourse, termName: string): SectionTypeGroup[] {
  const term = course.terms.find(t => t.termName === termName)
  if (!term?.sections) return []
  
  // Track first occurrence index for natural ordering + group sections by type
  const typeOrder = new Map<SectionType, number>()
  const groups = new Map<SectionType, InternalSection[]>()
  
  term.sections.forEach((section, index) => {
    const type = section.sectionType
    
    // Record first occurrence for data-driven ordering
    if (!typeOrder.has(type)) {
      typeOrder.set(type, index)
    }
    
    if (!groups.has(type)) {
      groups.set(type, [])
    }
    groups.get(type)!.push(section)
  })
  
  // Sort by natural data order (preserves official catalog sequence)
  return Array.from(groups.entries())
    .sort(([typeA], [typeB]) => typeOrder.get(typeA)! - typeOrder.get(typeB)!)
    .map(([type, sections], index) => ({
      type,
      displayName: getSectionTypeName(type),
      icon: getSectionTypeIcon(type),
      sections,
      priority: index  // First in data order = highest priority (0)
    }))
}

/**
 * Get display name for section type
 */
export function getSectionTypeName(type: SectionType): string {
  return SECTION_TYPE_CONFIG[type].displayName
}

/**
 * Get icon for section type
 */
export function getSectionTypeIcon(type: SectionType): string {
  return SECTION_TYPE_CONFIG[type].icon
}

/**
 * Check if a course enrollment is complete (has all required section types selected)
 * Now considers compatibility constraints - allows enrollment with orphan sections
 */
// Clean, simple version - no legacy code!
export function isCourseEnrollmentComplete(
  course: InternalCourse, 
  termName: string, 
  localSelections: Map<string, string>
): boolean {
  const sectionTypes = parseSectionTypes(course, termName)
  
  // If no selections, not complete
  if (localSelections.size === 0) return false
  
  // Get currently selected sections (actual InternalSection objects)
  const currentlySelected: InternalSection[] = []
  for (const [sectionType, sectionId] of localSelections) {
    const typeGroup = sectionTypes.find(t => t.type === sectionType)
    if (typeGroup) {
      const section = typeGroup.sections.find(s => s.id === sectionId)
      if (section) {
        currentlySelected.push(section)
      }
    }
  }
  
  // For each section type, check if:
  // 1. User has selected it, OR
  // 2. No compatible sections exist for this type given current selections
  return sectionTypes.every(typeGroup => {
    const hasSelection = localSelections.has(typeGroup.type)
    
    if (hasSelection) return true // User selected this type
    
    // Check if there are any compatible sections for this type
    // Only consider HIGHER priority selections as constraints (hierarchical)
    const higherPrioritySelections = currentlySelected.filter(s => {
      const sPriority = getSectionTypePriority(s.sectionType as SectionType, sectionTypes)
      return sPriority < typeGroup.priority
    })
    
    const { compatible } = categorizeCompatibleSections(
      typeGroup.sections,
      higherPrioritySelections
    )
    
    // If no compatible sections exist, this type is not required
    return compatible.length === 0
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
 * Convert Tailwind background colors to CSS color values
 */
export function getComputedBorderColor(bgColor: string): string {
  const colorMap: Record<string, string> = {
    'bg-blue-500': '#3b82f6', 'bg-blue-600': '#2563eb', 'bg-blue-700': '#1d4ed8', 'bg-blue-800': '#1e40af',
    'bg-sky-500': '#0ea5e9', 'bg-sky-600': '#0284c7', 'bg-sky-700': '#0369a1', 'bg-sky-800': '#075985',
    'bg-cyan-500': '#06b6d4', 'bg-cyan-600': '#0891b2', 'bg-cyan-700': '#0e7490', 'bg-cyan-800': '#155e75',
    'bg-teal-500': '#14b8a6', 'bg-teal-600': '#0d9488', 'bg-teal-700': '#0f766e', 'bg-teal-800': '#115e59',
    'bg-emerald-500': '#10b981', 'bg-emerald-600': '#059669', 'bg-emerald-700': '#047857', 'bg-emerald-800': '#065f46',
    'bg-green-500': '#22c55e', 'bg-green-600': '#16a34a', 'bg-green-700': '#15803d', 'bg-green-800': '#166534',
    'bg-amber-500': '#f59e0b', 'bg-amber-600': '#d97706', 'bg-amber-700': '#b45309', 'bg-amber-800': '#92400e',
    'bg-orange-500': '#f97316', 'bg-orange-600': '#ea580c', 'bg-orange-700': '#c2410c', 'bg-orange-800': '#9a3412',
    'bg-pink-500': '#ec4899', 'bg-pink-600': '#db2777', 'bg-pink-700': '#be185d', 'bg-pink-800': '#9d174d',
    'bg-rose-500': '#f43f5e', 'bg-rose-600': '#e11d48', 'bg-rose-700': '#be123c', 'bg-rose-800': '#9f1239',
    'bg-fuchsia-500': '#d946ef', 'bg-fuchsia-600': '#c026d3', 'bg-fuchsia-700': '#a21caf', 'bg-fuchsia-800': '#86198f',
    'bg-purple-500': '#a855f7', 'bg-purple-600': '#9333ea', 'bg-purple-700': '#7c3aed', 'bg-purple-800': '#6b21a8',
    'bg-violet-500': '#8b5cf6', 'bg-violet-600': '#7c3aed', 'bg-violet-700': '#6d28d9', 'bg-violet-800': '#5b21b6',
    'bg-indigo-500': '#6366f1', 'bg-indigo-600': '#4f46e5', 'bg-indigo-700': '#4338ca', 'bg-indigo-800': '#3730a3',
    'bg-slate-500': '#64748b', 'bg-slate-600': '#475569', 'bg-slate-700': '#334155', 'bg-slate-800': '#1e293b',
    'bg-gray-500': '#6b7280', 'bg-gray-600': '#4b5563', 'bg-gray-700': '#374151', 'bg-gray-800': '#1f2937',
    'bg-zinc-500': '#71717a', 'bg-zinc-600': '#52525b', 'bg-zinc-700': '#3f3f46', 'bg-zinc-800': '#27272a',
    'bg-stone-500': '#78716c', 'bg-stone-600': '#57534e', 'bg-stone-700': '#44403c', 'bg-stone-800': '#292524'
  }
  return colorMap[bgColor] || '#6366f1' // fallback to indigo-500
}

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

/**
 * Group meetings by time + location + instructor to show unique meetings
 * This consolidates duplicate meetings that occur at the same time/place with same instructor
 */
export function getUniqueMeetings(meetings: InternalMeeting[]): InternalMeeting[] {
  const meetingGroups = new Map<string, InternalMeeting[]>()
  
  meetings.forEach((meeting) => {
    const key = `${meeting?.time || 'TBA'}-${meeting?.location || 'TBA'}-${meeting?.instructor || 'TBA'}`
    if (!meetingGroups.has(key)) {
      meetingGroups.set(key, [])
    }
    meetingGroups.get(key)!.push(meeting)
  })
  
  // Return first meeting from each group (they're identical for display purposes)
  return Array.from(meetingGroups.values()).map(group => group[0])
}

/**
 * Format time string for compact display: "Tu 12:30PM - 2:15PM" → "Tu 12:30-14:15"
 */
export function formatTimeCompact(timeStr: string): string {
  if (!timeStr || timeStr === 'TBA') return 'TBA'
  
  return timeStr
    .replace(/(\d{1,2}):(\d{2})PM/g, (_match: string, h: string, m: string) => {
      const hour = parseInt(h) === 12 ? 12 : parseInt(h) + 12
      return `${hour}:${m}`
    })
    .replace(/(\d{1,2}):(\d{2})AM/g, (_match: string, h: string, m: string) => {
      const hour = parseInt(h) === 12 ? 0 : parseInt(h)
      return `${hour.toString().padStart(2, '0')}:${m}`
    })
    .replace(' - ', '-')
}

/**
 * Format instructor name for compact display: "Professor" → "Prof.", "Dr." stays "Dr."
 */
export function formatInstructorCompact(instructor: string): string {
  if (!instructor || instructor === 'TBA') return 'TBA'
  
  return instructor.replace('Professor ', 'Prof. ')
}

/**
 * Remove titles from instructor name for consistent operations (sorting, searching)
 * Used for alphabetical sorting and search optimization across the app
 */
export function removeInstructorTitle(instructor: string): string {
  if (!instructor || instructor === 'TBA') return 'TBA'
  
  return formatInstructorCompact(instructor)
    .replace(/^(Prof|Dr|Mr|Ms|Mrs)\.?\s+/i, '')
}

// ========================================
// Section Compatibility & Selection Logic
// ========================================

/**
 * Extract section prefix for compatibility matching
 * Examples: 
 *   A-LEC → "A"        (letter prefix - specific cohort)
 *   AE01-EXR → "A"     (letter prefix - specific cohort) 
 *   AT01-TUT → "A"     (letter prefix - specific cohort)
 *   --LEC → null       (dash prefix - universal wildcard)
 *   -E01-EXR → null    (dash prefix - universal wildcard)
 */
export function getSectionPrefix(sectionCode: string): string | null {
  // Check if starts with letter (not dash) - indicates specific cohort
  const match = sectionCode.match(/^([A-Z])/)
  return match ? match[1] : null // null = universal wildcard section
}

/**
 * Check if two sections are compatible for pairing based on CUHK cohort rules
 * Rules:
 * - Letter-prefixed sections (A-LEC, AE01-EXR, AT01-TUT) must match same letter
 * - Dash-prefixed sections (--LEC, -E01-EXR) are wildcards, match anything
 * - Universal sections can pair with any specific cohort
 * - Specific cohorts can only pair with same cohort or universal sections
 */
export function areSectionsCompatible(section1: InternalSection, section2: InternalSection): boolean {
  const prefix1 = getSectionPrefix(section1.sectionCode)
  const prefix2 = getSectionPrefix(section2.sectionCode)
  
  // Universal sections (null prefix) can pair with anything
  if (prefix1 === null || prefix2 === null) return true
  
  // Same letter prefix sections can pair together
  return prefix1 === prefix2
}

/**
 * Get compatible and incompatible sections for UI state management
 * Used for enabling/disabling section options based on prior selections
 */
export function categorizeCompatibleSections(
  availableSections: InternalSection[],
  selectedSections: InternalSection[]
): {
  compatible: InternalSection[]
  incompatible: InternalSection[]
  hasNoCompatible: boolean
} {
  // If no sections selected yet, all are compatible
  if (selectedSections.length === 0) {
    return {
      compatible: availableSections,
      incompatible: [],
      hasNoCompatible: false
    }
  }
  
  // Check compatibility with all currently selected sections
  const compatible = availableSections.filter(candidate =>
    selectedSections.every(selected => areSectionsCompatible(candidate, selected))
  )
  
  const incompatible = availableSections.filter(candidate =>
    !selectedSections.every(selected => areSectionsCompatible(candidate, selected))
  )
  
  return {
    compatible,           // Shorthand property: equivalent to compatible: compatible
    incompatible,         // Shorthand property: equivalent to incompatible: incompatible
    hasNoCompatible: compatible.length === 0  // Computed property with boolean expression
  }
}

/**
 * Get compatible alternative sections for cycling in shopping cart
 * Only returns sections of same type that work with current enrollment
 */
export function getCompatibleAlternatives(
  selectedSection: InternalSection,
  enrollment: CourseEnrollment,
  termName: string
): InternalSection[] {
  const currentTerm = enrollment.course.terms.find(t => t.termName === termName)
  if (!currentTerm) return []
  
  // Get sections of same type (LEC → LEC alternatives only)
  const sameTypeSections = currentTerm.sections.filter(s => 
    s.sectionType === selectedSection.sectionType && 
    s.id !== selectedSection.id
  )
  
  // Filter by compatibility with OTHER selected sections (different types)
  const otherSelectedSections = enrollment.selectedSections
    .filter(s => s.sectionType !== selectedSection.sectionType)
  
  return sameTypeSections.filter(candidateSection =>
    otherSelectedSections.every(otherSection => 
      areSectionsCompatible(candidateSection, otherSection)
    )
  )
}

/**
 * Get the priority index of a section type within course section types
 */
export function getSectionTypePriority(
  sectionType: SectionType, 
  sectionTypes: SectionTypeGroup[]
): number {
  const typeGroup = sectionTypes.find(group => group.type === sectionType)
  return typeGroup?.priority ?? 999 // High number = low priority if not found
}

/**
 * Clear lower-priority section selections that become incompatible
 * This implements the cascade reset behavior
 */
export function clearIncompatibleLowerSelections(
  selectedSections: Map<string, string>,
  courseKey: string,
  changedSectionType: SectionType,
  newSectionId: string,
  sectionTypes: SectionTypeGroup[],
  course: InternalCourse,
  termName: string
): Map<string, string> {
  const newMap = new Map(selectedSections)
  const changedPriority = getSectionTypePriority(changedSectionType, sectionTypes)
  
  // Get the new section object
  const termData = course.terms.find(t => t.termName === termName)
  const newSection = termData?.sections.find(s => s.id === newSectionId)
  if (!newSection) return newMap
  
  // Check all lower-priority section types
  sectionTypes
    .filter(typeGroup => typeGroup.priority > changedPriority) // Lower priority (higher number)
    .forEach(lowerTypeGroup => {
      const lowerSelectionKey = `${courseKey}_${lowerTypeGroup.type}`
      const currentLowerSelectionId = newMap.get(lowerSelectionKey)
      
      if (currentLowerSelectionId) {
        // Find the currently selected lower section
        const currentLowerSection = lowerTypeGroup.sections.find(s => s.id === currentLowerSelectionId)
        
        // Check if it's still compatible with the new higher-priority selection
        if (currentLowerSection && !areSectionsCompatible(newSection, currentLowerSection)) {
          // Clear the incompatible selection
          newMap.delete(lowerSelectionKey)
          console.log(`🔄 Cascade cleared ${lowerTypeGroup.type} selection: ${currentLowerSection.sectionCode} (incompatible with ${newSection.sectionCode})`)
        }
      }
    })
  
  return newMap
}

/**
 * Check if a section type can be freely changed (is high priority or has no lower dependent selections)
 */
export function canFreelySectionType(
  sectionType: SectionType,
  sectionTypes: SectionTypeGroup[]
): boolean {
  const priority = getSectionTypePriority(sectionType, sectionTypes)
  // Higher priority sections (lower numbers) can always be changed freely
  return priority <= 1 // Allow top 2 priority levels to be changed freely
}

/**
 * Validate course enrollment for section compatibility
 * Returns validation result with detailed conflict information for debugging
 */
export function validateSectionCompatibility(enrollment: CourseEnrollment): {
  isValid: boolean
  conflicts: string[]
} {
  const conflicts: string[] = []
  const sections = enrollment.selectedSections
  
  // Check all pairs of sections for compatibility
  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      if (!areSectionsCompatible(sections[i], sections[j])) {
        const prefix1 = getSectionPrefix(sections[i].sectionCode) || 'universal'
        const prefix2 = getSectionPrefix(sections[j].sectionCode) || 'universal'
        conflicts.push(
          `${sections[i].sectionCode} (${prefix1}-cohort) and ${sections[j].sectionCode} (${prefix2}-cohort) are incompatible`
        )
      }
    }
  }
  
  return { isValid: conflicts.length === 0, conflicts }
}

/**
 * Smart auto-completion: Updates enrollment sections when cycling creates new compatibility opportunities
 * This implements the hierarchical auto-completion logic for shopping cart section cycling
 */
export function autoCompleteEnrollmentSections(
  enrollment: CourseEnrollment,
  changedSectionType: SectionType,
  newSectionId: string,
  course: InternalCourse,
  termName: string
): InternalSection[] {
  const sectionTypes = parseSectionTypes(course, termName)
  const changedPriority = getSectionTypePriority(changedSectionType, sectionTypes)
  
  // Get the new section object
  const termData = course.terms.find(t => t.termName === termName)
  const newSection = termData?.sections.find(s => s.id === newSectionId)
  if (!newSection) return enrollment.selectedSections
  
  // Start with current sections, replacing the changed one
  let updatedSections = enrollment.selectedSections.map(section => 
    section.sectionType === changedSectionType ? newSection : section
  )
  
  // If we didn't have this section type before, add it
  if (!enrollment.selectedSections.some(s => s.sectionType === changedSectionType)) {
    updatedSections.push(newSection)
  }
  
  // Clear incompatible lower-priority sections
  updatedSections = updatedSections.filter(section => {
    if (section.sectionType === changedSectionType) return true // Keep the new section
    
    const sectionPriority = getSectionTypePriority(section.sectionType, sectionTypes)
    if (sectionPriority <= changedPriority) return true // Keep higher/equal priority sections
    
    // Check if this lower-priority section is still compatible with the new section
    const isCompatible = areSectionsCompatible(newSection, section)
    if (!isCompatible) {
      console.log(`🔄 Auto-removing incompatible ${section.sectionType}: ${section.sectionCode} (incompatible with ${newSection.sectionCode})`)
    }
    return isCompatible
  })
  
  // Auto-add compatible sections for missing lower-priority types
  sectionTypes
    .filter(typeGroup => typeGroup.priority > changedPriority) // Lower priority (higher number)
    .forEach(lowerTypeGroup => {
      // Check if we already have a section of this type
      const hasTypeSelected = updatedSections.some(s => s.sectionType === lowerTypeGroup.type)
      
      if (!hasTypeSelected) {
        // Get currently selected sections to check compatibility
        const currentlySelected = updatedSections
        const { compatible } = categorizeCompatibleSections(lowerTypeGroup.sections, currentlySelected)
        
        // Auto-add the first compatible section if available
        if (compatible.length > 0) {
          const firstCompatible = compatible[0]
          updatedSections.push(firstCompatible)
          console.log(`🔄 Auto-adding compatible ${lowerTypeGroup.type}: ${firstCompatible.sectionCode} (compatible with ${newSection.sectionCode})`)
        }
      }
    })
  
  return updatedSections
}

/**
 * Determine which badges to show based on course status and availability
 */
export function getAvailabilityBadges(availability: SectionAvailability) {
  const { availableSeats, status, waitlistTotal, waitlistCapacity, capacity } = availability
  
  const badges = []
  
  // 1. Course Status Badge (leftmost, most important)
  badges.push({
    type: 'status' as const,
    text: status,
    style: getCourseStatusStyle(status)
  })
  
  // 2. Availability Badge (show available/total seats when capacity > 0)
  if (capacity > 0) {
    badges.push({
      type: 'availability' as const,
      text: `${availableSeats}/${capacity} Available`,
      style: getAvailabilityBadgeStyle(availability)
    })
  }
  
  // 3. Waitlist Badge (only show if waitlist exists)
  if (waitlistTotal > 0 || (status === 'Waitlisted' && waitlistCapacity > 0)) {
    badges.push({
      type: 'waitlist' as const,
      text: `${waitlistTotal} on Waitlist`,
      style: getWaitlistBadgeStyle(waitlistTotal)
    })
  }
  
  return badges
}

/**
 * Get course status badge styling based on status - intuitive warning system
 */
function getCourseStatusStyle(status: string) {
  switch (status) {
    case 'Open':
      return {
        className: 'bg-green-700 text-white border-green-600 font-medium'
      }
    case 'Waitlisted':
      return {
        className: 'bg-yellow-600 text-white border-yellow-500 font-medium'
      }
    case 'Closed':
      return {
        className: 'bg-red-700 text-white border-red-600 font-medium'
      }
    default:
      // Unknown status - gray
      return {
        className: 'bg-gray-700 text-white border-gray-600 font-medium'
      }
  }
}

/**
 * Smart waitlist badge styling based on queue length
 * Returns appropriate variant and styling for waitlist badges
 */
export function getWaitlistBadgeStyle(waitlistTotal: number) {
  // Risky: >5 people waiting
  if (waitlistTotal > 5 && waitlistTotal <= 10) {
    return {
      className: 'bg-yellow-100 text-yellow-800 border-yellow-300'
    }
  }

  // Dangerous: >10 people waiting
  if (waitlistTotal > 10) {
    return {
      className: 'bg-red-100 text-red-800 border-red-300'
    }
  }
  
  // Moderate: 1-5 people waiting
  return {
    className: 'bg-green-100 text-green-700 border-green-300'
  }
}

/**
 * Smart availability badge styling based on quota levels
 * Returns appropriate variant and styling for availability badges
 */
export function getAvailabilityBadgeStyle(availability: SectionAvailability) {
  const { availableSeats, status } = availability
  
  // Closed/Full status takes precedence
  if (status === 'Closed' || availableSeats === 0) {
    return {
      className: 'bg-red-100 text-red-800 border-red-300'
    }
  }

  if (status === 'Waitlisted') {
    return {
      className: 'bg-orange-100 text-orange-800 border-orange-300'
    }
  }
  
  // Low availability (≤10 seats)
  if (availableSeats <= 10) {
    return {
      className: 'bg-yellow-100 text-yellow-800 border-yellow-300'
    }
  }
  
  // Good availability 
  return {
    className: 'bg-green-100 text-green-800 border-green-300'
  }
}

/**
 * Captures a calendar screenshot with term name header and website attribution
 * Now supports compositing calendar and unscheduled sections together
 */
export async function captureCalendarScreenshot(
  calendarElement: HTMLElement,
  unscheduledElement: HTMLElement | null,
  termName: string,
  websiteUrl: string = typeof window !== 'undefined' ? window.location.origin : ''
): Promise<void> {
  const { toPng } = await import('html-to-image')
  
  // Store original state for restoration
  const originalStates: Array<{
    element: HTMLElement
    originalStyle: string
    originalContent?: { element: HTMLElement; originalText: string }[]
    originalClasses?: { element: HTMLElement; originalClass: string }[]
  }> = []

  // Helper to restore all elements to original state
  const restoreAllElements = () => {
    try {
      originalStates.forEach(state => {
        // Restore main element style
        state.element.style.cssText = state.originalStyle
        
        // Restore text content
        state.originalContent?.forEach(({ element, originalText }) => {
          element.textContent = originalText
        })
        
        // Restore class names
        state.originalClasses?.forEach(({ element, originalClass }) => {
          element.setAttribute('class', originalClass)
        })
      })
    } catch (restoreError) {
      console.warn('⚠️ Element restoration had issues:', restoreError)
    }
  }

  try {
    console.log('📸 Starting calendar screenshot...')
    
    // Helper to prepare element for screenshot capture
    const prepareElementForCapture = async (element: HTMLElement, isUnscheduled = false) => {
      const originalStyle = element.style.cssText
      const originalContent: Array<{ element: HTMLElement; originalText: string }> = []
      const originalClasses: Array<{ element: HTMLElement; originalClass: string }> = []
      
      // Store state for restoration
      originalStates.push({
        element,
        originalStyle,
        originalContent,
        originalClasses
      })
      
      // Expand element for capture
      element.style.maxHeight = 'none'
      element.style.height = 'auto'
      element.style.overflow = 'visible'
      element.style.overflowY = 'visible'
      
      if (isUnscheduled) {
        // Ensure parent container has enough padding for borders
        element.style.paddingRight = '24px' // Increased padding
        element.style.paddingBottom = '24px' // Increased padding
        element.style.width = 'auto' // Allow container to expand
        element.style.minWidth = '100%' // Ensure full width
      }
      
      if (isUnscheduled) {
        // Apply screenshot-optimized styling for calendar consistency
        const cardContainer = element.querySelector('.border.border-gray-200.rounded-lg.shadow-sm') as HTMLElement
        if (cardContainer) {
          const originalClass = cardContainer.getAttribute('class') || ''
          const originalStyle = cardContainer.style.cssText
          originalClasses.push({ element: cardContainer, originalClass })
          
          // Transform from card to distinct section with proper borders
          cardContainer.setAttribute('class', 'border border-gray-200 bg-white')
          
          // Align left border with time column's right border (30px from left)
          cardContainer.style.marginLeft = '30px'
          cardContainer.style.marginRight = '16px' // Increased margin to prevent right border clipping
          cardContainer.style.marginBottom = '16px' // Increased margin to prevent bottom border clipping
          cardContainer.style.boxSizing = 'border-box' // Include borders in width calculation
          
          // Constrain container width to prevent overflow beyond screenshot bounds
          const availableWidth = calendarInfo.actualWidth - 30 - 16 // Calendar width minus left and right margins
          cardContainer.style.width = `${availableWidth}px`
          
          // Store original style for restoration
          originalStates.push({
            element: cardContainer,
            originalStyle: originalStyle,
            originalContent: [],
            originalClasses: []
          })
        }
        
        // Adjust course card widths for better screenshot proportions
        const courseCards = element.querySelectorAll('.flex.flex-wrap.gap-2 > div')
        courseCards.forEach(card => {
          const cardElement = card as HTMLElement
          const originalStyle = cardElement.style.cssText
          originalStates.push({
            element: cardElement,
            originalStyle,
            originalContent: [],
            originalClasses: []
          })
          
          // Make cards slightly narrower to prevent right border clipping
          cardElement.style.maxWidth = '160px' // Slightly reduced from 180px
          cardElement.style.minWidth = '140px' // Slightly reduced from 150px
        })
        
        // Hide interactive elements for professional look
        const chevron = element.querySelector('[class*="w-4 h-4 text-gray-400"]') as HTMLElement
        if (chevron) {
          const originalClass = chevron.getAttribute('class') || ''
          originalClasses.push({ element: chevron, originalClass })
          chevron.setAttribute('class', originalClass + ' hidden')
        }
        
        // Hide small preview cards in header
        const previewCards = element.querySelectorAll('.flex.gap-2.flex-wrap > span')
        previewCards.forEach(card => {
          const cardElement = card as HTMLElement
          const originalClass = cardElement.getAttribute('class') || ''
          originalClasses.push({ element: cardElement, originalClass })
          cardElement.setAttribute('class', originalClass + ' hidden')
        })
        
        // Force expand the main content
        const expandableContent = element.querySelector('.px-3.pb-3.pt-0') as HTMLElement
        if (expandableContent && getComputedStyle(expandableContent).display === 'none') {
          const originalClass = expandableContent.getAttribute('class') || ''
          originalClasses.push({ element: expandableContent, originalClass })
          expandableContent.style.display = 'block'
        }
      }
      
      // Force layout recalculation
      element.offsetHeight
      await new Promise(resolve => setTimeout(resolve, 50))
      
      const rect = element.getBoundingClientRect()
      return {
        element,
        actualWidth: Math.max(rect.width, 800),
        actualHeight: rect.height
      }
    }
    
    // Step 1: Prepare calendar
    console.log('📏 Preparing calendar...')
    const calendarInfo = await prepareElementForCapture(calendarElement, false)
    
    // Step 2: Prepare unscheduled (if it exists)
    let unscheduledInfo: any = null
    if (unscheduledElement) {
      console.log('📏 Preparing unscheduled...')
      unscheduledInfo = await prepareElementForCapture(unscheduledElement, true)
      // Match width to calendar for perfect alignment
      unscheduledInfo.actualWidth = calendarInfo.actualWidth
    }
    
    // Step 3: Capture images with proper error handling
    console.log('📷 Capturing images...')
    const calendarDataUrl = await toPng(calendarInfo.element, {
      quality: 1.0,
      backgroundColor: '#ffffff',
      pixelRatio: 3.0, // Reduced from 5.0 for better performance
      width: calendarInfo.actualWidth,
      height: calendarInfo.actualHeight,
      style: {
        transform: 'scale(1)',
        transformOrigin: 'top left',
      },
      skipAutoScale: true,
    })
    
    let unscheduledDataUrl: string | null = null
    if (unscheduledElement && unscheduledInfo) {
      unscheduledDataUrl = await toPng(unscheduledInfo.element, {
        quality: 1.0,
        backgroundColor: '#ffffff',
        pixelRatio: 3.0, // Reduced from 5.0 for better performance
        width: unscheduledInfo.actualWidth,
        height: unscheduledInfo.actualHeight,
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left',
        },
        skipAutoScale: true,
      })
    }
    
    // Restore elements immediately after capture
    restoreAllElements()
    console.log('🔄 Elements restored to original state')
    
    console.log(`📏 Calendar: ${calendarInfo.actualWidth}x${calendarInfo.actualHeight}`)
    if (unscheduledInfo) {
      console.log(`📏 Unscheduled: ${unscheduledInfo.actualWidth}x${unscheduledInfo.actualHeight}`)
    }
    
    // Step 3: Calculate final layout dimensions  
    const padding = 50
    const headerHeight = 40
    const sectionSpacing = 10 // Space between calendar and unscheduled section
    const footerSpacing = -30 // Smaller spacing between unscheduled and footer
    const bottomMargin = 40 // More space below footer for better balance
    
    // Calculate total content dimensions
    const maxWidth = Math.max(
      calendarInfo.actualWidth, 
      unscheduledInfo ? unscheduledInfo.actualWidth : 0
    )
    const totalContentHeight = calendarInfo.actualHeight + 
      (unscheduledInfo ? unscheduledInfo.actualHeight + sectionSpacing : 0)
    
    const finalWidth = Math.max(maxWidth + (padding * 2), 1000)
    const finalHeight = totalContentHeight + headerHeight + footerSpacing + bottomMargin + padding // Top padding + header + content + footer spacing + bottom margin
    
    const canvas = document.createElement('canvas')
    const scale = 2 // High DPI scaling for crisp text
    canvas.width = finalWidth * scale
    canvas.height = finalHeight * scale
    const ctx = canvas.getContext('2d')
    
    if (!ctx) throw new Error('Failed to get canvas context')
    
    // Scale the context for high-DPI rendering
    ctx.scale(scale, scale)
    
    // White background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, finalWidth, finalHeight)
    
    // Header with your app's Geist font (exactly matching Next.js)
    ctx.fillStyle = '#111827'
    ctx.font = 'bold 30px Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(termName, finalWidth / 2, padding + 10)
    
    console.log(`📏 Final dimensions: ${finalWidth}x${finalHeight}`)
    
    // Load and composite images
    const calendarImage = new Image()
    const unscheduledImage = unscheduledDataUrl ? new Image() : null
    
    return new Promise<void>((resolve, reject) => {
      let imagesLoaded = 0
      const totalImages = unscheduledImage ? 2 : 1
      
      const checkImagesLoaded = () => {
        imagesLoaded++
        if (imagesLoaded === totalImages) {
          try {
            // Draw calendar centered
            const calendarX = (finalWidth - calendarInfo.actualWidth) / 2
            const calendarY = padding + headerHeight
            ctx.drawImage(calendarImage, calendarX, calendarY, calendarInfo.actualWidth, calendarInfo.actualHeight)
            
            // Draw unscheduled section below calendar (if exists)
            if (unscheduledImage && unscheduledInfo) {
              const unscheduledX = (finalWidth - unscheduledInfo.actualWidth) / 2
              const unscheduledY = calendarY + calendarInfo.actualHeight + sectionSpacing
              ctx.drawImage(unscheduledImage, unscheduledX, unscheduledY, unscheduledInfo.actualWidth, unscheduledInfo.actualHeight)
            }
            
            // Modern footer with proper spacing
            const footerStartY = totalContentHeight + headerHeight + padding + footerSpacing
            
            // Single line footer with subtle URL emphasis
            const footerTextY = footerStartY + 20
            
            // Measure text widths for positioning
            ctx.font = '16px Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'
            const prefixText = 'Generated from '
            const prefixWidth = ctx.measureText(prefixText).width
            const urlWidth = ctx.measureText(websiteUrl).width
            const totalWidth = prefixWidth + urlWidth
            
            // Starting position for centered text
            const startX = (finalWidth - totalWidth) / 2
            
            // "Generated from" in regular gray
            ctx.fillStyle = '#6b7280'
            ctx.textAlign = 'left'
            ctx.fillText(prefixText, startX, footerTextY)
            
            // URL in slightly darker gray with medium font weight
            ctx.fillStyle = '#4b5563'
            ctx.font = '500 16px Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'
            ctx.fillText(websiteUrl, startX + prefixWidth, footerTextY)
            
            // Download
            canvas.toBlob((blob) => {
              if (!blob) {
                reject(new Error('Failed to create image'))
                return
              }
              
              const url = URL.createObjectURL(blob)
              const link = document.createElement('a')
              link.href = url
              link.download = `${termName.replace(/\s+/g, '-')}-schedule-${new Date().toISOString().split('T')[0]}.png`
              
              document.body.appendChild(link)
              link.click()
              document.body.removeChild(link)
              URL.revokeObjectURL(url)
              
              console.log('✅ Calendar screenshot with unscheduled sections saved successfully!')
              resolve()
            }, 'image/png', 0.95)
          } catch (drawError) {
            console.error('❌ Drawing error:', drawError)
            reject(drawError)
          }
        }
      }
      
      // Load calendar image
      calendarImage.onload = checkImagesLoaded
      calendarImage.onerror = () => reject(new Error('Failed to load calendar image'))
      calendarImage.src = calendarDataUrl
      
      // Load unscheduled image if it exists
      if (unscheduledImage && unscheduledDataUrl) {
        unscheduledImage.onload = checkImagesLoaded
        unscheduledImage.onerror = () => reject(new Error('Failed to load unscheduled image'))
        unscheduledImage.src = unscheduledDataUrl
      }
    })
    
  } catch (error) {
    // Always restore elements on error
    restoreAllElements()
    console.error('❌ Screenshot failed:', error)
    throw error
  }
}

/**
 * Check if a section conflicts with current visible enrollments
 * Used for showing conflict warnings in course search
 */
export function checkSectionConflict(
  candidateSection: InternalSection,
  currentEnrollments: CourseEnrollment[]
): {
  hasConflict: boolean
  conflictingSections: string[]
} {
  const conflictingSections: string[] = []

  // Get all meetings from the candidate section
  for (const candidateMeeting of candidateSection.meetings) {
    const candidateTime = parseTimeRange(candidateMeeting.time)
    if (!candidateTime) continue // Skip TBA meetings
    
    // Check against all visible enrolled sections
    for (const enrollment of currentEnrollments) {
      if (!enrollment.isVisible || enrollment.isInvalid) continue
      
      for (const enrolledSection of enrollment.selectedSections) {
        for (const enrolledMeeting of enrolledSection.meetings) {
          const enrolledTime = parseTimeRange(enrolledMeeting.time)
          // Skip itself from checking
          if (!enrolledTime || enrolledSection.id === candidateSection.id) continue

          // Check for time overlap
          if (doTimesOverlap(candidateTime, enrolledTime)) {
            const courseWithSection = `${enrollment.course.subject}${enrollment.course.courseCode} ${enrolledSection.sectionType}`
            if (!conflictingSections.includes(courseWithSection)) {
              conflictingSections.push(courseWithSection)
            }
          }
        }
      }
    }
  }
  
  return {
    hasConflict: conflictingSections.length > 0,
    conflictingSections: conflictingSections
  }
}

// === SEARCH UTILITIES ===

/**
 * Performs a Google search with the given query and opens in new tab
 * @param query Search query string
 */
export const googleSearchAndOpen = (query: string): void => {
  const params = new URLSearchParams({ q: query })
  const url = `https://www.google.com/search?${params.toString()}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * Opens Google Maps search for the given location and opens in new tab
 * @param location Location string to search for
 */
export const googleMapsSearchAndOpen = (location: string): void => {
  const encodedLocation = encodeURIComponent(location)
  const url = `https://www.google.com/maps/search/${encodedLocation}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * Opens CUHK Library search for past papers of the given course and opens in new tab
 * @param courseCode Course code string (e.g., "CSCI3100")
 */
export const cuhkLibrarySearchAndOpen = (courseCode: string): void => {
  const params = new URLSearchParams({
    query: `any,contains,${courseCode}`,
    tab: 'default_tab',
    search_scope: 'All',
    vid: '852JULAC_CUHK:CUHK',
    offset: '0'
  })
  const url = `https://julac-cuhk.primo.exlibrisgroup.com/discovery/search?${params.toString()}`
  window.open(url, '_blank', 'noopener,noreferrer')
}