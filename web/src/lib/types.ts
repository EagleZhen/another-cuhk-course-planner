// Clean internal type definitions separated from external scraped data
// These types represent our application's domain model

export interface InternalCourse {
  subject: string
  courseCode: string
  title: string
  credits: number
  description?: string
  enrollmentRequirement?: string
  terms: InternalTerm[]
}

export interface InternalTerm {
  termCode: string
  termName: string
  sections: InternalSection[]
}

export interface InternalSection {
  id: string
  sectionCode: string
  sectionType: SectionType
  meetings: InternalMeeting[]
  availability: SectionAvailability
}

export interface InternalMeeting {
  time: string
  location: string
  instructor: string
  dates: string
}

export interface SectionAvailability {
  capacity: number
  enrolled: number
  status: 'Open' | 'Closed' | 'Waitlist' | 'Unknown'
  availableSeats: number
}

export type SectionType = 'LEC' | 'TUT' | 'LAB' | 'EXR' | 'SEM' | 'PRJ' | 'PRA' | 'OTHER'

// Course enrollment using clean internal types
export interface CourseEnrollment {
  courseId: string
  course: InternalCourse // ✅ Strong internal type
  selectedSections: InternalSection[]
  enrollmentDate: Date
  color: string
  isVisible: boolean
}

// Calendar event using clean internal types
export interface CalendarEvent {
  id: string
  subject: string
  courseCode: string
  title: string
  sectionCode: string
  sectionType: SectionType
  time: string
  location: string
  instructor: string
  credits: number
  color: string
  isVisible: boolean
  hasConflict: boolean
  enrollmentId?: string
  // Parsed time information
  day: number // 0=Monday, 1=Tuesday, etc.
  startHour: number
  endHour: number
  startMinute: number
  endMinute: number
}

// Section type display information
export interface SectionTypeInfo {
  type: SectionType
  displayName: string
  icon: string
  isRequired: boolean
}

// Time range for conflict detection
export interface TimeRange {
  day: string // 'Mo', 'Tu', 'We', 'Th', 'Fr'
  startHour: number
  startMinute: number
  endHour: number
  endMinute: number
}

// Conflict zone for visual representation
export interface ConflictZone {
  startHour: number
  endHour: number
  startMinute: number
  endMinute: number
}