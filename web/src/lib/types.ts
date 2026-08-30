// Clean internal type definitions separated from external scraped data
// These types represent our application's domain model

/** Academic career levels as scraped; a course belongs to exactly one. */
export const ACADEMIC_CAREERS = [
  'Undergraduate',
  'Postgraduate - Taught',
  'Postgraduate - PGDE',
  'Postgraduate - Research',
] as const
export type AcademicCareer = (typeof ACADEMIC_CAREERS)[number]

export interface InternalCourse {
  subject: string
  courseCode: string
  title: string
  credits: number
  career?: AcademicCareer // absent when the source value is missing or unrecognized
  description?: string
  enrollmentRequirement?: string
  courseAttributes?: string
  gradingBasis?: string
  terms: InternalTerm[]
  // Course Outcome fields
  learningOutcomes?: string
  courseSyllabus?: string
  assessmentTypes?: Record<string, string>
  feedbackEvaluation?: string
  requiredReadings?: string
  recommendedReadings?: string
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
  classAttributes: string // Language of instruction (e.g., "English only", "Putonghua and English", or "")
}

export interface InternalMeeting {
  time: string
  location: string
  instructors: string // Scraped form ("Professor CHAN"); display via formatInstructorsCompact
  dates: string
}

// A single meeting's comparable facts (normalized, no `dates`).
export interface SectionMeetingSignature {
  time: string
  location: string
  instructor: string // Scraped form, compared verbatim; display via formatInstructorsCompact
}

// A section's comparable facts: deduped meetings (source order) plus language of
// instruction. Pure data — MeetingRowCard formats it for display, so a future formatting
// change can't retroactively look like a data change.
export interface SectionSignature {
  meetings: SectionMeetingSignature[]
  language: string
}

// A section whose sectionSignature no longer matches what the user last saw.
export interface SectionChange {
  sectionId: string
  sectionCode: string
  before: SectionSignature
  after: SectionSignature
}

export type MeetingChangeStatus = 'unchanged' | 'added' | 'changed' | 'removed'

export interface MeetingRow {
  status: MeetingChangeStatus
  meeting: SectionMeetingSignature
  before?: SectionMeetingSignature
  fields?: { time: boolean; location: boolean; instructor: boolean }
}

export interface SectionDiffDetail {
  rows: MeetingRow[]
  languageChanged: boolean
}

export interface SectionAvailability {
  capacity: number
  enrolled: number
  status: 'Open' | 'Closed' | 'Waitlisted' | 'Unknown'
  availableSeats: number
  waitlistCapacity: number
  waitlistTotal: number
}

// Centralized section type configuration - SINGLE SOURCE OF TRUTH
export const SECTION_TYPE_CONFIG = {
  ASB: { displayName: 'Assembly', icon: '🦻', aliases: ['ASB'] },
  CLW: { displayName: 'Classwork', icon: '✍️', aliases: ['CLW'] },
  DIS: { displayName: 'Discussion', icon: '💬', aliases: ['DIS'] },
  EXR: { displayName: 'Exercise', icon: '✏️', aliases: ['EXR'] },
  FLD: { displayName: 'Field Study', icon: '🌍', aliases: ['FLD'] },
  IND: { displayName: 'Independent Study', icon: '🧑‍🎓', aliases: ['IND'] },
  LAB: { displayName: 'Laboratory', icon: '🧪', aliases: ['LAB'] },
  LEC: { displayName: 'Lecture', icon: '🧑‍🏫', aliases: ['LEC'] },
  OTH: { displayName: 'Other', icon: '?', aliases: ['OTH'] },
  PRA: { displayName: 'Practicum', icon: '💪', aliases: ['PRA'] },
  PRJ: { displayName: 'Project', icon: '🚀', aliases: ['PRJ'] },
  SEM: { displayName: 'Seminar', icon: '🗣️', aliases: ['SEM'] },
  STD: { displayName: 'Studio', icon: '🎨', aliases: ['STD'] },
  TMC: { displayName: 'Thesis Monitoring', icon: '📝', aliases: ['TMC'] },
  TUT: { displayName: 'Interactive Tutorial', icon: '🙌', aliases: ['TUT'] },
  VST: { displayName: 'Visit', icon: '👁️', aliases: ['VST'] },
  WBL: { displayName: 'Web-enhanced Teaching', icon: '💻', aliases: ['WBL'] },
  WKS: { displayName: 'Workshop', icon: '🔨', aliases: ['WKS'] },
  // Unrecognized section types
  UNK: { displayName: 'Unknown', icon: '❓', aliases: ['UNKNOWN'] },
} as const

// Derive the type from the config keys - automatically stays in sync
export type SectionType = keyof typeof SECTION_TYPE_CONFIG

// Reason-only: per-section removals track acknowledgment via removedSectionsAcknowledged,
// so the invalid state's identity is just its reason. (Persisted pre-tombstone blobs carried
// an extra sectionIds key; readStoredEnrollments strips it on load.)
export interface InvalidEnrollmentState {
  reason: string
}

// Course enrollment using clean internal types
// Acknowledgment is tracked by three separate mechanisms below: removedSectionsAcknowledged,
// lastSeenSections, and lastSeenInvalidState
// TODO(#215): unify them into one snapshot
export interface CourseEnrollment {
  courseId: string
  course: InternalCourse // ✅ Strong internal type
  selectedSections: InternalSection[]
  // Display-only tombstones for picked sections that vanished while the course still exists.
  removedSections?: InternalSection[]
  // Dismiss hides the banner without deleting tombstones or their replacement controls.
  removedSectionsAcknowledged?: boolean
  color: string
  isVisible: boolean
  // Sync status fields
  isInvalid?: boolean // True if the course or current term no longer exists
  invalidReason?: string // Human-readable reason for invalidity
  lastSynced?: Date // Persisted as an ISO string; revived to Date in readStoredEnrollments
  // Per-section sectionSignature the user last saw, keyed by section id. Not rendered
  // directly — only used to detect changes. Missing entry = adopt current section.
  lastSeenSections?: Record<string, SectionSignature>
  // Invalid status the user last acknowledged. Kept separate from isInvalid because
  // dismissing a notification must not make unavailable data appear valid.
  lastSeenInvalidState?: InvalidEnrollmentState
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
  instructors: string // Scraped form ("Professor CHAN"); display via formatInstructorsCompact
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

export interface SearchResults {
  courses: InternalCourse[]
  total: number
  isLimited: boolean
  isShuffled: boolean
}

export interface SectionTypeGroup {
  type: SectionType
  displayName: string
  icon: string
  sections: InternalSection[]
  priority: number // Lower number = higher priority (0 = highest)
}
