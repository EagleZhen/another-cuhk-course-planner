import { SCHEDULE_DATA_VERSION } from './constants'
import type { CourseEnrollment, Credits, InternalSection } from './types'

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
// rebuild the reason-only shape so runtime objects match the current type.
function stripLegacyInvalidStateFields(enrollments: CourseEnrollment[]): CourseEnrollment[] {
  return enrollments.map((enrollment) =>
    enrollment.lastSeenInvalidState
      ? { ...enrollment, lastSeenInvalidState: { reason: enrollment.lastSeenInvalidState.reason } }
      : enrollment
  )
}

// Carts hold whole sections, so they carry the pre-catalog status too. Both lists have
// availability; both need rewriting.
function renameStoredWaitlistStatus(enrollments: CourseEnrollment[]): CourseEnrollment[] {
  const rename = (section: InternalSection): InternalSection =>
    (section.availability?.status as string) === 'Waitlisted'
      ? { ...section, availability: { ...section.availability, status: 'Wait List' } }
      : section

  // A hand-edited blob can be missing either list.
  return enrollments.map((enrollment) => ({
    ...enrollment,
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

// Normalize a persisted schedule blob; return null for unsupported input.
export function readStoredEnrollments(parsed: unknown): CourseEnrollment[] | null {
  if (Array.isArray(parsed)) {
    return normalizeStoredEnrollments(parsed as CourseEnrollment[])
  }
  if (parsed && typeof parsed === 'object') {
    const version = (parsed as { version?: unknown }).version
    if (typeof version === 'number' && version >= 1 && version <= SCHEDULE_DATA_VERSION) {
      return normalizeStoredEnrollments(
        ((parsed as { enrollments?: CourseEnrollment[] }).enrollments ?? []) as CourseEnrollment[]
      )
    }
  }
  return null
}
