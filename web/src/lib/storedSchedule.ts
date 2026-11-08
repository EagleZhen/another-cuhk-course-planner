import { z } from 'zod'
import { ACADEMIC_CAREERS, SECTION_TYPE_CONFIG } from './types'
import { SCHEDULE_DATA_VERSION } from './constants'
import type { CourseEnrollment, Credits, InternalMeeting, InternalSection } from './types'

const storedCountSchema = z
  .union([z.number(), z.nan(), z.null()])
  .transform((value) => value ?? NaN)

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
    availableSeats: storedCountSchema,
    waitlistCapacity: storedCountSchema,
    waitlistTotal: storedCountSchema,
  }),
  classAttributes: z.string(),
  enrollmentRequirement: z.string(),
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
const enrollmentsSchema = z
  .array(
    z.looseObject({
      courseId: z.string().min(1),
      course: courseSchema,
      selectedSections: z.array(sectionSchema),
      removedSections: z.array(sectionSchema).optional(),
      color: z.string(),
      isVisible: z.boolean(),
      removedSectionsAcknowledged: z.boolean().optional(),
      isInvalid: z.boolean().optional(),
      invalidReason: z.string().optional(),
      lastSynced: z.date().optional(),
      lastSeenSections: z.record(z.string(), signatureSchema).optional(),
      lastSeenInvalidState: z.looseObject({ reason: z.string() }).optional(),
    })
  )
  .refine(
    (enrollments) =>
      new Set(enrollments.map(({ courseId }) => courseId)).size === enrollments.length
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

// Old writers carried earlier shapes forward, so migrate all section snapshots together.
function normalizeLegacyShapes(enrollments: CourseEnrollment[]): CourseEnrollment[] {
  const normalize = (section: InternalSection): InternalSection => {
    const availability = section.availability
    const status = availability.status as string
    return {
      ...section,
      sectionType: (section.sectionType as string) === 'OTHER' ? 'UNK' : section.sectionType,
      classAttributes: section.classAttributes === undefined ? '' : section.classAttributes,
      enrollmentRequirement:
        section.enrollmentRequirement === undefined ? '' : section.enrollmentRequirement,
      meetings: section.meetings.map((meeting) => {
        const { instructor, ...fields } = meeting as InternalMeeting & { instructor?: string }
        return (
          fields.instructors === undefined ? { ...fields, instructors: instructor } : fields
        ) as InternalMeeting
      }),
      availability: {
        ...availability,
        status:
          status === 'Waitlist' || status === 'Waitlisted' ? 'Wait List' : availability.status,
        waitlistCapacity:
          availability.waitlistCapacity === undefined ? NaN : availability.waitlistCapacity,
        waitlistTotal: availability.waitlistTotal === undefined ? NaN : availability.waitlistTotal,
      },
    }
  }

  return enrollments.map((enrollment) => ({
    ...enrollment,
    courseId: enrollment.courseId.includes('_')
      ? enrollment.course.subject + enrollment.course.courseCode
      : enrollment.courseId,
    color: enrollment.color === undefined ? '' : enrollment.color,
    isVisible: enrollment.isVisible === undefined ? true : enrollment.isVisible,
    course: {
      ...enrollment.course,
      terms: enrollment.course.terms.map((term) => ({
        ...term,
        sections: term.sections.map(normalize),
      })),
    },
    selectedSections: enrollment.selectedSections?.map(normalize),
    removedSections: enrollment.removedSections?.map(normalize),
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

function migrateLegacyEnrollments(enrollments: CourseEnrollment[]): CourseEnrollment[] {
  return stripLegacyInvalidStateFields(
    renameStoredClassAttributes(
      normalizeLegacyShapes(normalizeStoredCredits(migrateLegacyPartialRemovals(enrollments)))
    )
  )
}

// A rejected record stays intact at the caller; decoding never grants write authority.
export function readStoredEnrollments(parsed: unknown): StoredScheduleResult {
  const invalid: StoredScheduleResult = { status: 'blocked', reason: 'invalid_data' }
  let enrollments: unknown
  let envelope: Record<string, unknown> = {}
  let version: number | undefined
  if (Array.isArray(parsed)) {
    enrollments = parsed
  } else if (parsed && typeof parsed === 'object') {
    envelope = parsed as Record<string, unknown>
    if (typeof envelope.version !== 'number') return invalid
    version = envelope.version
    if (!Number.isInteger(version) || version < 1 || version > SCHEDULE_DATA_VERSION) {
      return { status: 'blocked', reason: 'unsupported_version', version }
    }
    invalid.version = version
    enrollments = envelope.enrollments
  }
  if (!Array.isArray(enrollments)) return invalid

  try {
    const revived = reviveEnrollmentDates(enrollments as CourseEnrollment[])
    const result = enrollmentsSchema.safeParse(
      version === undefined || version < 4 ? migrateLegacyEnrollments(revived) : revived
    )
    if (!result.success) return invalid
    return { status: 'ready', enrollments: result.data, envelope }
  } catch {
    // Legacy normalization can encounter malformed nested data before validation.
    return invalid
  }
}

export function serializeScheduleDraft(
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

export function serializeStoredSchedule(
  enrollments: CourseEnrollment[],
  envelope?: Record<string, unknown>
): string {
  const raw = serializeScheduleDraft(enrollments, envelope)
  if (readStoredEnrollments(JSON.parse(raw)).status !== 'ready') {
    throw new Error('The schedule writer produced an invalid payload')
  }
  return raw
}
