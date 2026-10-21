import { z } from 'zod'
import { ACADEMIC_CAREERS, SECTION_TYPE_CONFIG } from './types'
import { SCHEDULE_DATA_VERSION } from './constants'
import type { CourseEnrollment, Credits, InternalSection } from './types'

// Validate stored objects without stripping fields this build does not use.
const meetingSchema = z.looseObject({
  time: z.string(),
  location: z.string(),
  instructors: z.string(),
  dates: z.string(),
})
const sectionSchema = z.looseObject({
  id: z.string(),
  sectionCode: z.string(),
  sectionType: z.enum(
    Object.keys(SECTION_TYPE_CONFIG) as [
      keyof typeof SECTION_TYPE_CONFIG,
      ...(keyof typeof SECTION_TYPE_CONFIG)[],
    ]
  ),
  meetings: z.array(meetingSchema),
  availability: z.looseObject({
    capacity: z.number(),
    enrolled: z.number(),
    status: z.enum(['Open', 'Closed', 'Wait List', 'Unknown']),
    // JSON stores the legacy producer's unknown (NaN) seat count as null.
    availableSeats: z.union([z.number(), z.nan(), z.null()]).transform((value) => value ?? NaN),
    waitlistCapacity: z.number(),
    waitlistTotal: z.number(),
  }),
  classAttributes: z.string(),
  enrollmentRequirement: z.string().default(''), // Older saved sections predate this field.
})
const courseSchema = z.looseObject({
  subject: z.string().min(1),
  courseCode: z.string().min(1),
  title: z.string(),
  credits: z
    .looseObject({ min: z.number(), max: z.number() })
    .refine((value) => value.min <= value.max)
    .optional(),
  career: z.enum(ACADEMIC_CAREERS).optional(),
  description: z.string().optional(),
  enrollmentRequirement: z.string().optional(),
  courseAttributes: z.string().optional(),
  gradingBasis: z.string().optional(),
  terms: z.array(
    z.looseObject({ termCode: z.string(), termName: z.string(), sections: z.array(sectionSchema) })
  ),
  learningOutcomes: z.string().optional(),
  courseSyllabus: z.string().optional(),
  assessmentTypes: z.record(z.string(), z.string()).optional(),
  feedbackEvaluation: z.string().optional(),
  requiredReadings: z.string().optional(),
  recommendedReadings: z.string().optional(),
})
const signatureSchema = z.looseObject({
  meetings: z.array(
    z.looseObject({
      time: z.string(),
      location: z.string(),
      instructor: z.string(),
      dates: z.array(z.string()).optional(),
    })
  ),
  classAttributes: z.string(),
  requirement: z.string().optional(),
})
const enrollmentsSchema = z.array(
  z.looseObject({
    courseId: z.string().min(1),
    course: courseSchema,
    selectedSections: z.array(sectionSchema),
    removedSections: z.array(sectionSchema).optional(),
    color: z.string().default(''),
    isVisible: z.boolean().default(true),
    removedSectionsAcknowledged: z.boolean().optional(),
    isInvalid: z.boolean().optional(),
    invalidReason: z.string().optional(),
    lastSynced: z.date().optional(),
    lastSeenSections: z.record(z.string(), signatureSchema).optional(),
    lastSeenInvalidState: z.looseObject({ reason: z.string() }).optional(),
  })
)

export type StoredScheduleResult =
  | { status: 'ready'; enrollments: CourseEnrollment[]; envelope: Record<string, unknown> }
  | { status: 'blocked'; reason: 'invalid_data' | 'unsupported_version'; version?: number }

// JSON.stringify writes Dates as ISO strings; revive them here so the rest of the app
// only ever sees Date. Keep this in sync with any future Date field on CourseEnrollment.
function reviveEnrollmentDates(enrollments: CourseEnrollment[]): CourseEnrollment[] {
  return enrollments.map((enrollment) =>
    typeof enrollment.lastSynced === 'string'
      ? { ...enrollment, lastSynced: new Date(enrollment.lastSynced) }
      : enrollment
  )
}

function stripLegacySectionInvalid(section: InternalSection): InternalSection {
  const cleaned = { ...(section as InternalSection & { isInvalid?: boolean }) }
  delete cleaned.isInvalid
  return cleaned
}

function migrateLegacyPartialRemovals(enrollments: CourseEnrollment[]): CourseEnrollment[] {
  return enrollments.map((enrollment) => {
    if (!enrollment.isInvalid || enrollment.invalidReason !== 'Some sections no longer available') {
      return enrollment
    }

    const selectedSections: InternalSection[] = []
    const removedSections: InternalSection[] = []

    for (const section of enrollment.selectedSections) {
      const wasRemoved = (section as InternalSection & { isInvalid?: boolean }).isInvalid === true
      const cleaned = stripLegacySectionInvalid(section)
      if (wasRemoved) removedSections.push(cleaned)
      else selectedSections.push(cleaned)
    }

    return {
      ...enrollment,
      selectedSections,
      removedSections: removedSections.length > 0 ? removedSections : undefined,
      isInvalid: false,
      invalidReason: undefined,
      lastSeenInvalidState: undefined,
    }
  })
}

// Blobs written before the tombstone model carried sectionIds on lastSeenInvalidState;
// remove that obsolete key while retaining fields this build does not recognize.
function stripLegacyInvalidStateFields(enrollments: CourseEnrollment[]): CourseEnrollment[] {
  return enrollments.map((enrollment) => {
    if (!enrollment.lastSeenInvalidState) return enrollment
    const state = {
      ...enrollment.lastSeenInvalidState,
    } as typeof enrollment.lastSeenInvalidState & { sectionIds?: unknown }
    delete state.sectionIds
    return { ...enrollment, lastSeenInvalidState: state }
  })
}

// Saved courses include alternative sections as well as picked and removed sections.
// Normalize their old availability labels together.
function renameStoredWaitlistStatus(enrollments: CourseEnrollment[]): CourseEnrollment[] {
  const rename = (section: InternalSection): InternalSection =>
    (section.availability?.status as string) === 'Waitlisted'
      ? { ...section, availability: { ...section.availability, status: 'Wait List' } }
      : section

  // A hand-edited blob can be missing either list.
  return enrollments.map((enrollment) => ({
    ...enrollment,
    course: {
      ...enrollment.course,
      terms: enrollment.course.terms.map((term) => ({
        ...term,
        sections: term.sections.map(rename),
      })),
    },
    selectedSections: enrollment.selectedSections?.map(rename),
    removedSections: enrollment.removedSections?.map(rename),
  }))
}

// `language` was this field's old name. Renaming the stored key, rather than tolerating its
// absence, keeps a carted section reporting the change when publishing corrects it (#323).
function renameStoredClassAttributes(enrollments: CourseEnrollment[]): CourseEnrollment[] {
  return enrollments.map((enrollment) => {
    const snaps = enrollment.lastSeenSections
    if (!snaps) return enrollment

    return {
      ...enrollment,
      lastSeenSections: Object.fromEntries(
        Object.entries(snaps).map(([id, snap]) => [
          id,
          {
            ...snap,
            classAttributes: snap.classAttributes ?? (snap as { language?: string }).language ?? '',
          },
        ])
      ),
    }
  })
}

// Shape only: a pre-#331 blob holds the truncated number, so a range course stays wrong
// ({1.5, 1.5}) until the next sync replaces the course wholesale.
function normalizeStoredCredits(enrollments: CourseEnrollment[]): CourseEnrollment[] {
  return enrollments.map((enrollment) => {
    const credits = enrollment.course?.credits as Credits | number | undefined
    if (typeof credits !== 'number') return enrollment

    return {
      ...enrollment,
      course: { ...enrollment.course, credits: { min: credits, max: credits } },
    }
  })
}

// Every step is idempotent, so re-normalizing current-version data is a no-op.
function normalizeStoredEnrollments(enrollments: CourseEnrollment[]): CourseEnrollment[] {
  return reviveEnrollmentDates(
    stripLegacyInvalidStateFields(
      renameStoredClassAttributes(
        renameStoredWaitlistStatus(
          normalizeStoredCredits(migrateLegacyPartialRemovals(enrollments))
        )
      )
    )
  )
}

// A rejected record stays intact at the caller; decoding never grants write authority.
export function readStoredEnrollments(parsed: unknown): StoredScheduleResult {
  const invalid: StoredScheduleResult = { status: 'blocked', reason: 'invalid_data' }
  let enrollments: unknown
  let envelope: Record<string, unknown> = {}
  if (Array.isArray(parsed)) {
    enrollments = parsed
  } else if (parsed && typeof parsed === 'object') {
    envelope = parsed as Record<string, unknown>
    const version = envelope.version
    if (typeof version !== 'number') return invalid
    if (!Number.isInteger(version) || version < 1 || version > SCHEDULE_DATA_VERSION) {
      return { status: 'blocked', reason: 'unsupported_version', version }
    }
    invalid.version = version
    enrollments = envelope.enrollments
  }
  if (!Array.isArray(enrollments)) return invalid

  try {
    const normalized = normalizeStoredEnrollments(enrollments as CourseEnrollment[])
    const result = enrollmentsSchema.safeParse(normalized)
    if (!result.success) return invalid
    const identities = result.data.map((enrollment) =>
      enrollment.courseId.includes('_')
        ? enrollment.course.subject + enrollment.course.courseCode
        : enrollment.courseId
    )
    if (new Set(identities).size !== identities.length) return invalid
    return { status: 'ready', enrollments: result.data, envelope }
  } catch {
    // Legacy normalization can encounter malformed nested data before validation.
    return invalid
  }
}

// The same producer serves persistence and pending-data export.
export function serializeStoredSchedule(
  enrollments: CourseEnrollment[],
  envelope: Record<string, unknown> = {}
): string {
  return JSON.stringify({
    ...envelope,
    version: SCHEDULE_DATA_VERSION,
    enrollments,
    savedAt: new Date().toISOString(),
  })
}
