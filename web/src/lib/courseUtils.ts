// Unified course utilities for conflict detection and data transformation
// Should contain pure functions without side effects

export interface TimeRange {
  day: string // 'Mo', 'Tu', 'We', 'Th', 'Fr'
  startHour: number
  startMinute: number
  endHour: number
  endMinute: number
}

export interface Course {
  id: string
  subject: string
  courseCode: string
  title: string
  section: string
  time: string
  location: string
  instructor: string
  credits: string
  color: string
  isVisible: boolean
  hasConflict: boolean
  enrollmentId?: string // Optional enrollment ID for toggle functionality
}

export interface CalendarEvent extends Course {
  day: number // 0=Monday, 1=Tuesday, etc.
  startHour: number
  endHour: number
  startMinute: number
  endMinute: number
}

// Complete course enrollment interface
export interface CourseEnrollment {
  courseId: string
  course: any // Use flexible type for scraped course data
  selectedSections: Section[]
  enrollmentDate: Date
  color: string
  isVisible: boolean
}

export interface ConflictZone {
  startHour: number
  endHour: number
  startMinute: number
  endMinute: number
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
 * Detect conflicts among courses and return courses with hasConflict flag
 */
export function detectConflicts(courses: Course[]): Course[] {
  const visibleCourses = courses.filter(course => course.isVisible)
  
  return courses.map(course => {
    if (!course.isVisible) {
      return { ...course, hasConflict: false }
    }
    
    const courseTime = parseTimeRange(course.time)
    if (!courseTime) {
      return { ...course, hasConflict: false }
    }
    
    const hasConflict = visibleCourses.some(other => {
      if (other.id === course.id) return false
      
      const otherTime = parseTimeRange(other.time)
      if (!otherTime) return false
      
      return doTimesOverlap(courseTime, otherTime)
    })
    
    return { ...course, hasConflict }
  })
}

/**
 * Convert courses to calendar events with day/time info
 */
export function coursesToCalendarEvents(courses: Course[]): CalendarEvent[] {
  return courses
    .filter(course => course.isVisible)
    .map(course => {
      const timeRange = parseTimeRange(course.time)
      const dayIndex = getDayIndex(course.time)
      
      return {
        ...course,
        day: dayIndex,
        startHour: timeRange?.startHour || 9,
        endHour: timeRange?.endHour || 10,
        startMinute: timeRange?.startMinute || 0,
        endMinute: timeRange?.endMinute || 0
      }
    })
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

// Interface for scraped course data
export interface ScrapedCourse {
  subject: string
  course_code: string
  title: string
  credits?: string
  terms?: Array<{
    schedule?: Array<{
      section?: string
      meetings?: Array<{
        time?: string
        location?: string
        instructor?: string
      }>
    }>
  }>
}

// Interface for section type grouping
export interface SectionTypeGroup {
  type: string // 'LEC', 'TUT', 'LAB', etc.
  displayName: string // 'Lecture', 'Tutorial', 'Laboratory'
  icon: string // '📚', '📝', '🧪'
  sections: Section[]
}

export interface Section {
  id: string
  section: string
  meetings: Meeting[]
  availability: {
    capacity: string
    enrolled: string
    status: string
    available_seats: string
  }
}

export interface Meeting {
  time: string
  location: string
  instructor: string
  dates: string
}

/**
 * Parse section types from course data for a specific term
 */
export function parseSectionTypes(course: any, termName: string): SectionTypeGroup[] {
  const term = course.terms?.find((t: any) => t.term_name === termName)
  if (!term?.schedule) return []
  
  // Group sections by type prefix
  const groups = new Map<string, Section[]>()
  
  term.schedule.forEach((section: any) => {
    // Parse section type from various formats:
    // --LEC (6161) -> LEC
    // -L01-LAB (8040) -> LAB  
    // -T01-TUT (5455) -> TUT
    // LEC A -> LEC
    let type = 'OTHER'
    
    const sectionStr = section.section
    
    // Pattern 1: --TYPE or -XXX-TYPE
    const dashTypeMatch = sectionStr.match(/-+(?:[A-Z]\d+-)?(LEC|TUT|LAB|EXR|SEM|PRJ|WKS|PRA|FLD)/)
    if (dashTypeMatch) {
      type = dashTypeMatch[1]
    } 
    // Pattern 2: TYPE at start (like "LEC A", "TUT 1")
    else {
      const startTypeMatch = sectionStr.match(/^(LEC|TUT|LAB|EXR|SEM|PRJ|WKS|PRA|FLD)/)
      if (startTypeMatch) {
        type = startTypeMatch[1]
      }
    }
    
    if (!groups.has(type)) {
      groups.set(type, [])
    }
    
    groups.get(type)!.push({
      id: `${course.subject}${course.course_code}_${section.section}`,
      section: section.section,
      meetings: section.meetings || [],
      availability: section.availability || {
        capacity: '0',
        enrolled: '0', 
        status: 'Unknown',
        available_seats: '0'
      }
    })
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
export function getSectionTypeName(type: string): string {
  const names: Record<string, string> = {
    'LEC': 'Lecture',
    'TUT': 'Tutorial',
    'LAB': 'Laboratory', 
    'EXR': 'Exercise',
    'SEM': 'Seminar',
    'PRJ': 'Project',
    'WKS': 'Workshop',
    'PRA': 'Practical',
    'FLD': 'Field Work'
  }
  return names[type] || type
}

/**
 * Get icon for section type
 */
export function getSectionTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    'LEC': '📚',
    'TUT': '📝',
    'LAB': '🧪',
    'EXR': '💪',
    'SEM': '🗣️',
    'PRJ': '🛠️',
    'WKS': '👥',
    'PRA': '⚙️',
    'FLD': '🌍'
  }
  return icons[type] || '📋'
}

/**
 * Check if a course enrollment is complete (has all required section types selected)
 */
export function isCourseEnrollmentComplete(
  course: any, 
  termName: string, 
  selectedSections: Map<string, string>
): boolean {
  const sectionTypes = parseSectionTypes(course, termName)
  const courseKey = `${course.subject}${course.course_code}`
  
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
  course: any,
  termName: string,
  selectedSections: Map<string, string>
): Section[] {
  const sectionTypes = parseSectionTypes(course, termName)
  const courseKey = `${course.subject}${course.course_code}`
  const result: Section[] = []
  
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

/**
 * Transform course data from scraper format to internal format
 */
export function transformScrapedCourse(scrapedCourse: ScrapedCourse): Course {
  // Get the first available term and section
  const firstTerm = scrapedCourse.terms?.[0]
  const firstSection = firstTerm?.schedule?.[0]
  const firstMeeting = firstSection?.meetings?.[0]
  
  // Generate random color
  const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-red-500', 'bg-yellow-500', 'bg-indigo-500', 'bg-pink-500', 'bg-teal-500']
  const randomColor = colors[Math.floor(Math.random() * colors.length)]
  
  return {
    id: `${scrapedCourse.subject}${scrapedCourse.course_code}_${Date.now()}`,
    subject: scrapedCourse.subject,
    courseCode: scrapedCourse.course_code,
    title: scrapedCourse.title,
    section: firstSection?.section || '--LEC',
    time: firstMeeting?.time || 'TBD',
    location: firstMeeting?.location || 'TBD',
    instructor: firstMeeting?.instructor || 'TBD',
    credits: scrapedCourse.credits || '3.0',
    color: randomColor,
    isVisible: true,
    hasConflict: false
  }
}