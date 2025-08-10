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
    .filter(enrollment => enrollment.isVisible)
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

// Section type grouping interface
export interface SectionTypeGroup {
  type: SectionType
  displayName: string
  icon: string
  sections: InternalSection[]
  priority: number  // Lower number = higher priority (0 = highest)
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
  const names: Record<SectionType, string> = {
    'LEC': 'Lecture',
    'TUT': 'Interactive Tutorial',
    'LAB': 'Laboratory',
    'EXR': 'Exercise',
    'SEM': 'Seminar',
    'PRJ': 'Project',
    'PRA': 'Practicum',
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
    'PRA': '⚙️',
    'OTHER': '📋'
  }
  return icons[type]
}

/**
 * Check if a course enrollment is complete (has all required section types selected)
 * Now considers compatibility constraints - allows enrollment with orphan sections
 */
export function isCourseEnrollmentComplete(
  course: InternalCourse, 
  termName: string, 
  selectedSections: Map<string, string>
): boolean {
  const sectionTypes = parseSectionTypes(course, termName)
  const courseKey = `${course.subject}${course.courseCode}`
  
  // Get currently selected sections
  const currentlySelected = getSelectedSectionsForCourse(course, termName, selectedSections)
  
  // If no selections, not complete
  if (currentlySelected.length === 0) return false
  
  // For each section type, check if:
  // 1. User has selected it, OR
  // 2. No compatible sections exist for this type given current selections
  return sectionTypes.every(typeGroup => {
    const selectionKey = `${courseKey}_${typeGroup.type}`
    const hasSelection = selectedSections.has(selectionKey)
    
    if (hasSelection) return true // User selected this type
    
    // Check if there are any compatible sections for this type
    // Only consider HIGHER priority selections as constraints (hierarchical)
    const higherPrioritySelections = currentlySelected.filter(s => {
      const sPriority = getSectionTypePriority(s.sectionType, sectionTypes)
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
    const key = `${meeting?.time || 'TBD'}-${meeting?.location || 'TBD'}-${meeting?.instructor || 'TBD'}`
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
  if (!timeStr || timeStr === 'TBD') return 'TBD'
  
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
  if (!instructor || instructor === 'TBD') return 'TBD'
  
  return instructor.replace('Professor ', 'Prof. ')
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
  const { availableSeats, capacity, status, waitlistTotal, waitlistCapacity } = availability
  
  const badges = []
  
  // Always show availability badge
  badges.push({
    type: 'availability' as const,
    text: `${availableSeats}/${capacity}`,
    style: getAvailabilityBadgeStyle(availability),
    priority: status === 'Closed' || availableSeats === 0 ? 'secondary' : 'primary'
  })
  
  // Show waitlist badge when relevant (has waitlist or is closed with waitlist capacity)
  if (waitlistTotal > 0 || (status === 'Waitlist' && waitlistCapacity > 0) || (status === 'Closed' && waitlistCapacity > 0)) {
    badges.push({
      type: 'waitlist' as const,
      text: `${waitlistTotal}/${waitlistCapacity}`,
      style: getWaitlistBadgeStyle(waitlistTotal),
      priority: status === 'Closed' || status === 'Waitlist' ? 'primary' : 'secondary'
    })
  }
  
  return badges
}

/**
 * Smart waitlist badge styling based on queue length
 * Returns appropriate variant and styling for waitlist badges
 */
export function getWaitlistBadgeStyle(waitlistTotal: number) {
  // Risky: >5 people waiting
  if (waitlistTotal > 5 && waitlistTotal <= 10) {
    return {
      variant: 'secondary' as const,
      className: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      urgency: 'risky' as const
    }
  }

  // Dangerous: >10 people waiting
  if (waitlistTotal > 10) {
    return {
      variant: 'secondary' as const,
      className: 'bg-red-100 text-red-800 border-red-300',
      urgency: 'dangerous' as const
    }
  }
  
  // Moderate: 1-5 people waiting
  return {
    variant: 'outline' as const,
    className: 'bg-green-100 text-green-700 border-green-300',
    urgency: 'good' as const
  }
}

/**
 * Smart availability badge styling based on quota levels
 * Returns appropriate variant and styling for availability badges
 */
export function getAvailabilityBadgeStyle(availability: SectionAvailability) {
  const { availableSeats, capacity, status } = availability
  
  // Closed/Full status takes precedence
  if (status === 'Closed' || availableSeats === 0) {
    return {
      variant: 'destructive' as const,
      className: 'bg-red-100 text-red-800 border-red-300',
      urgency: 'critical' as const
    }
  }
  
  if (status === 'Waitlist') {
    return {
      variant: 'secondary' as const, 
      className: 'bg-orange-100 text-orange-800 border-orange-300',
      urgency: 'warning' as const
    }
  }
  
  // Calculate availability percentage
  const availabilityRatio = capacity > 0 ? availableSeats / capacity : 0
  
  // Low availability (≤10 seats or ≤20% capacity)
  if (availableSeats <= 10 || availabilityRatio <= 0.2) {
    return {
      variant: 'secondary' as const,
      className: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      urgency: 'low' as const
    }
  }
  
  // Good availability 
  return {
    variant: 'default' as const,
    className: 'bg-green-100 text-green-800 border-green-300',
    urgency: 'none' as const
  }
}