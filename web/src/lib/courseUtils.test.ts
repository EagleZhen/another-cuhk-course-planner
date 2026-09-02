import { describe, it, expect } from 'vitest'
import {
  updateExistingEnrollment,
  markCourseUnavailable,
  sortSectionsByPriority,
  readStoredEnrollments,
  sectionSignature,
  diffEnrollment,
  hasUnseenInvalidChange,
  recordSeenChanges,
  recordSeenSections,
  diffSectionDetail,
  getChangedCourseIds,
  formatSyncTimestamp,
  sectionsOverlapInTime,
  checkSectionConflict,
  hasConflictFreeEnrollment,
  pruneReplacedTombstones,
  syncCart,
  syncEnrollment,
  isEnrollmentOpen,
  splitInstructorsCompact,
  instructorSortKey,
  formatTimeCompact,
  formatInstructorsCompact,
  getAvailabilityBadges,
} from './courseUtils'
import { SCHEDULE_DATA_VERSION } from './constants'
import type {
  CourseEnrollment,
  InternalCourse,
  InternalSection,
  InternalMeeting,
  SectionAvailability,
  SectionSignature,
} from './types'

describe('formatSyncTimestamp', () => {
  // Absolute instants, so these assertions hold under any TZ the test runs in.
  it('formats in 24-hour time and falls back to Unknown for an invalid Date', () => {
    expect(formatSyncTimestamp(new Date('2026-07-14T13:27:00Z'))).toBe('Jul 14, 2026 21:27 HKT')
    expect(formatSyncTimestamp(new Date('corrupt'))).toBe('Unknown')
  })

  // Guards the hydration fix: the build machine prerenders this string and the
  // visitor's browser rehydrates it, so it must not depend on the ambient zone.
  // The instant lands on a different date in UTC than in Hong Kong.
  it('formats in Hong Kong time regardless of the ambient timezone', () => {
    const originalTimezone = process.env.TZ
    try {
      for (const timezone of ['UTC', 'America/New_York', 'Asia/Hong_Kong']) {
        process.env.TZ = timezone
        expect(formatSyncTimestamp(new Date('2026-07-17T16:05:00Z'))).toBe('Jul 18, 2026 00:05 HKT')
      }
    } finally {
      process.env.TZ = originalTimezone
    }
  })
})

function makeSection(overrides: Partial<InternalSection>): InternalSection {
  return {
    id: 'section',
    sectionCode: 'A-LEC',
    sectionType: 'LEC',
    meetings: [],
    availability: {
      capacity: 50,
      enrolled: 0,
      status: 'Open',
      availableSeats: 50,
      waitlistCapacity: 0,
      waitlistTotal: 0,
    },
    classAttributes: '',
    ...overrides,
  }
}

function makeCourse(sections: InternalSection[], termName = 'Term 1'): InternalCourse {
  return {
    subject: 'CSCI',
    courseCode: '3100',
    title: 'Software Engineering',
    credits: 3,
    terms: [{ termCode: '2510', termName, sections }],
  }
}

describe('sortSectionsByPriority', () => {
  it('orders sections by section-type priority regardless of input order', () => {
    const lec = makeSection({ id: 'lec', sectionCode: 'A-LEC', sectionType: 'LEC' })
    const tut = makeSection({ id: 'tut', sectionCode: 'AT01-TUT', sectionType: 'TUT' })

    // Course lists LEC before TUT, so LEC has higher priority (index 0).
    const course: InternalCourse = {
      subject: 'CSCI',
      courseCode: '1130',
      title: 'Intro',
      credits: 3,
      terms: [{ termCode: '2510', termName: 'Term 1', sections: [lec, tut] }],
    }

    // Input is swapped (TUT before LEC), as would happen if the user
    // clicked the tutorial before the lecture when adding the course.
    const result = sortSectionsByPriority([tut, lec], course, 'Term 1')

    expect(result.map((s) => s.sectionType)).toEqual(['LEC', 'TUT'])
  })
})

describe('updateExistingEnrollment', () => {
  it('clears invalid state when a course is re-added from search', () => {
    const staleSection: InternalSection = {
      id: 'old-section',
      sectionCode: 'A-LEC',
      sectionType: 'LEC',
      meetings: [],
      availability: {
        capacity: 50,
        enrolled: 50,
        status: 'Closed',
        availableSeats: 0,
        waitlistCapacity: 0,
        waitlistTotal: 0,
      },
      classAttributes: '',
    }

    const existing: CourseEnrollment = {
      courseId: 'CSCI3100',
      course: {
        subject: 'CSCI',
        courseCode: '3100',
        title: 'Software Engineering',
        credits: 3,
        terms: [],
      },
      selectedSections: [staleSection],
      color: 'bg-blue-500',
      isVisible: true,
      isInvalid: true,
      invalidReason: 'Course no longer available',
      lastSeenInvalidState: { reason: 'Course no longer available' },
      removedSections: [makeSection({ id: 'removed-tut', sectionType: 'TUT' })],
      removedSectionsAcknowledged: true,
      lastSynced: new Date('2026-01-01'),
    }

    const freshSection: InternalSection = {
      ...staleSection,
      id: 'new-section',
      availability: {
        ...staleSection.availability,
        status: 'Open',
        enrolled: 10,
        availableSeats: 40,
      },
    }

    const freshCourse: InternalCourse = {
      ...existing.course,
      title: 'Software Engineering (Updated)',
    }

    const result = updateExistingEnrollment(existing, freshCourse, [freshSection])

    expect(result.isInvalid).toBeFalsy()
    expect(result.invalidReason).toBeUndefined()
    expect(result.lastSeenInvalidState).toBeUndefined()
    expect(result.removedSections).toBeUndefined()
    expect(result.removedSectionsAcknowledged).toBeUndefined()
    expect(result.lastSynced).toBeInstanceOf(Date)
    expect(result.lastSynced).not.toEqual(existing.lastSynced)
    expect(result.course).toEqual(freshCourse)
    expect(result.selectedSections).toEqual([freshSection])
  })
})

describe('pruneReplacedTombstones', () => {
  it('drops removed sections whose type now has a live selection', () => {
    const removedTut = makeSection({ id: 'old-tut', sectionType: 'TUT' })
    const removedLab = makeSection({ id: 'old-lab', sectionType: 'LAB' })
    const selected = [
      makeSection({ id: 'lec', sectionType: 'LEC' }),
      makeSection({ id: 'new-tut', sectionType: 'TUT' }),
    ]

    expect(pruneReplacedTombstones([removedTut, removedLab], selected)).toEqual([removedLab])
    expect(pruneReplacedTombstones([removedTut], selected)).toBeUndefined()
  })
})

describe('syncEnrollment', () => {
  const syncedAt = new Date('2026-07-18T12:00:00.000Z')

  it('keeps surviving sections live and moves a missing selection to removedSections', () => {
    const staleLec = makeSection({ id: 'lec', sectionType: 'LEC' })
    const staleTut = makeSection({ id: 'tut-old', sectionType: 'TUT' })
    const freshLec = makeSection({
      id: 'lec',
      sectionType: 'LEC',
      availability: { ...staleLec.availability, enrolled: 20, availableSeats: 30 },
    })
    const alternativeTut = makeSection({ id: 'tut-new', sectionType: 'TUT' })
    const oldCourse = makeCourse([staleLec, staleTut])
    const freshCourse = makeCourse([freshLec, alternativeTut])
    const enrollment: CourseEnrollment = {
      courseId: 'CSCI3100',
      course: oldCourse,
      selectedSections: [staleTut, staleLec],
      color: 'bg-blue-500',
      isVisible: true,
      isInvalid: true,
      invalidReason: 'Some sections no longer available',
      removedSectionsAcknowledged: true,
      lastSeenInvalidState: { reason: 'Some sections no longer available' },
    }

    const result = syncEnrollment(enrollment, [freshCourse], 'Term 1', syncedAt)

    expect(result.selectedSections).toEqual([freshLec])
    expect(result.removedSections).toEqual([staleTut])
    expect(result.removedSectionsAcknowledged).toBeUndefined()
    expect(result.isInvalid).toBe(false)
    expect(result.invalidReason).toBeUndefined()
    expect(result.lastSeenInvalidState).toBeUndefined()
    expect(result.lastSynced).toBe(syncedAt)
    expect(result.course).toBe(freshCourse)
  })

  it('flags meeting changes on a section that vanished and later returned', () => {
    const lec = makeSection({ id: 'lec' })
    const tut = makeSection({
      id: 'tut',
      sectionType: 'TUT',
      meetings: [mkMeeting({ time: 'Mo 9:30AM - 10:15AM' })],
    })
    const seeded = recordSeenSections(
      { ...mkEnrollment([lec, tut]), course: makeCourse([lec, tut]) },
      { onlyMissing: false }
    )

    // Scrape 1: the TUT disappears — its snapshot must survive tombstoning.
    const tombstoned = syncEnrollment(seeded, [makeCourse([lec])], 'Term 1', syncedAt)
    expect(tombstoned.removedSections).toEqual([tut])
    expect(tombstoned.lastSeenSections?.['tut']).toBeDefined()

    // Scrape 2: it returns at a new time — the change must diff against the old snapshot.
    const movedTut = { ...tut, meetings: [mkMeeting({ time: 'Fr 2:30PM - 4:15PM' })] }
    const restored = syncEnrollment(tombstoned, [makeCourse([lec, movedTut])], 'Term 1', syncedAt)
    expect(restored.removedSections).toBeUndefined()
    expect(diffEnrollment(restored)).toMatchObject([
      { sectionId: 'tut', before: { meetings: [{ time: 'Mo 9:30AM - 10:15AM' }] } },
    ])
  })

  it('restores a tombstone to the live selection when its section reappears', () => {
    const lec = makeSection({ id: 'lec', sectionType: 'LEC' })
    const removedTut = makeSection({ id: 'tut', sectionType: 'TUT' })
    const freshTut = makeSection({
      id: 'tut',
      sectionType: 'TUT',
      availability: { ...removedTut.availability, status: 'Wait List' },
    })
    const freshCourse = makeCourse([lec, freshTut])
    const enrollment: CourseEnrollment = {
      courseId: 'CSCI3100',
      course: makeCourse([lec]),
      selectedSections: [lec],
      removedSections: [removedTut],
      removedSectionsAcknowledged: true,
      color: 'bg-blue-500',
      isVisible: true,
    }

    const result = syncEnrollment(enrollment, [freshCourse], 'Term 1', syncedAt)

    expect(result.selectedSections).toEqual([lec, freshTut])
    expect(result.removedSections).toBeUndefined()
    expect(result.removedSectionsAcknowledged).toBeUndefined()
  })

  it('keeps an all-tombstones enrollment valid and interactive', () => {
    const lec = makeSection({ id: 'lec', sectionType: 'LEC' })
    const tut = makeSection({ id: 'tut', sectionType: 'TUT' })
    const enrollment: CourseEnrollment = {
      courseId: 'CSCI3100',
      course: makeCourse([lec, tut]),
      selectedSections: [lec, tut],
      color: 'bg-blue-500',
      isVisible: true,
    }

    const result = syncEnrollment(enrollment, [makeCourse([])], 'Term 1', syncedAt)

    expect(result.selectedSections).toEqual([])
    expect(result.removedSections).toEqual([lec, tut])
    expect(result.isInvalid).toBe(false)
  })

  it.each([
    ['course', []],
    ['term', [{ ...makeCourse([]), terms: [] }]],
  ])('marks the whole enrollment unavailable when the %s disappears', (_kind, freshCourses) => {
    const section = makeSection({ id: 'lec' })
    const enrollment: CourseEnrollment = {
      courseId: 'CSCI3100',
      course: makeCourse([section]),
      selectedSections: [section],
      color: 'bg-blue-500',
      isVisible: true,
    }

    expect(syncEnrollment(enrollment, freshCourses, 'Term 1', syncedAt)).toMatchObject({
      isInvalid: true,
      invalidReason: 'Course no longer available',
      lastSynced: syncedAt,
    })
  })
})

describe('syncCart', () => {
  const syncedAt = new Date('2026-07-18T12:00:00.000Z')
  const section = makeSection({ id: 'lec' })
  const enrollment: CourseEnrollment = {
    courseId: 'CSCI3100',
    course: makeCourse([section]),
    selectedSections: [section],
    color: 'bg-blue-500',
    isVisible: true,
  }

  it('leaves an empty cart untouched', () => {
    const enrollments: CourseEnrollment[] = []

    expect(syncCart(enrollments, [makeCourse([section])], 'Term 1', syncedAt)).toBe(enrollments)
  })

  it('leaves the cart untouched when the catalog has no courses for the term', () => {
    const enrollments = [enrollment]
    const otherTermCourse = makeCourse([section], 'Term 2')

    expect(syncCart(enrollments, [otherTermCourse], 'Term 1', syncedAt)).toBe(enrollments)
  })

  it('marks a course unavailable in this term when the catalog covers the term', () => {
    const enrolledCourseInAnotherTerm = makeCourse([section], 'Term 2')
    const termCoverageCourse: InternalCourse = {
      ...makeCourse([], 'Term 1'),
      subject: 'MATH',
      courseCode: '1010',
    }

    expect(
      syncCart(
        [enrollment],
        [enrolledCourseInAnotherTerm, termCoverageCourse],
        'Term 1',
        syncedAt
      )[0]
    ).toMatchObject({
      isInvalid: true,
      invalidReason: 'Course no longer available',
      lastSynced: syncedAt,
    })
  })

  it('is idempotent across repeated syncs', () => {
    const freshCourse = makeCourse([section])
    const first = syncCart([enrollment], [freshCourse], 'Term 1', syncedAt)
    const second = syncCart(first, [freshCourse], 'Term 1', syncedAt)

    expect(second).toEqual(first)
  })
})

describe('markCourseUnavailable', () => {
  it('records when the unavailable course was synced', () => {
    const enrollment: CourseEnrollment = {
      courseId: 'CSCI3150',
      course: {
        subject: 'CSCI',
        courseCode: '3150',
        title: 'Introduction to Operating Systems',
        credits: 3,
        terms: [],
      },
      selectedSections: [makeSection({})],
      color: 'bg-blue-500',
      isVisible: true,
    }
    const syncedAt = new Date('2026-07-14T13:27:10.392Z')

    const result = markCourseUnavailable(enrollment, syncedAt)

    expect(result).toMatchObject({
      isInvalid: true,
      invalidReason: 'Course no longer available',
      lastSynced: syncedAt,
    })
    expect(result.course).toBe(enrollment.course)
    expect(result.selectedSections).toBe(enrollment.selectedSections)
  })
})

describe('readStoredEnrollments', () => {
  const enrollments = [{ courseId: 'COMM1180' }] as unknown as CourseEnrollment[]

  it('loads the legacy pre-version array format', () => {
    expect(readStoredEnrollments(enrollments)).toEqual(enrollments)
  })

  it('loads a known version (1..current) and returns its enrollments', () => {
    expect(readStoredEnrollments({ version: 1, enrollments })).toEqual(enrollments)
    expect(readStoredEnrollments({ version: SCHEDULE_DATA_VERSION, enrollments })).toEqual(
      enrollments
    )
  })

  it('revives lastSynced from its persisted ISO string to a Date', () => {
    const stored = [
      { courseId: 'COMM1180', lastSynced: '2026-07-14T13:27:10.392Z' },
    ] as unknown as CourseEnrollment[]

    const loaded = readStoredEnrollments({ version: SCHEDULE_DATA_VERSION, enrollments: stored })

    expect(loaded?.[0].lastSynced).toEqual(new Date('2026-07-14T13:27:10.392Z'))
  })

  it('renames the derived wait list status in selected and removed sections', () => {
    const stored = [
      {
        courseId: 'CSCI3100',
        selectedSections: [
          {
            ...makeSection({ id: 'lec' }),
            availability: { ...makeSection({}).availability, status: 'Waitlisted' },
          },
        ],
        removedSections: [
          {
            ...makeSection({ id: 'tut', sectionType: 'TUT' }),
            availability: { ...makeSection({}).availability, status: 'Waitlisted' },
          },
        ],
      },
    ] as unknown as CourseEnrollment[]

    const loaded = readStoredEnrollments({ version: SCHEDULE_DATA_VERSION, enrollments: stored })

    expect(loaded?.[0].selectedSections[0].availability.status).toBe('Wait List')
    expect(loaded?.[0].removedSections?.[0].availability.status).toBe('Wait List')

    // Idempotent: a second load must not change it.
    expect(readStoredEnrollments({ version: SCHEDULE_DATA_VERSION, enrollments: loaded! })).toEqual(
      loaded
    )
  })

  it('migrates v2 partial removals without changing whole-course removals', () => {
    const liveSection = { ...makeSection({ id: 'live' }), isInvalid: false }
    const removedSection = {
      ...makeSection({ id: 'removed', sectionType: 'TUT' }),
      isInvalid: true,
    }
    const partialRemoval = {
      courseId: 'CSCI3100',
      course: makeCourse([liveSection, removedSection]),
      selectedSections: [liveSection, removedSection],
      color: 'bg-blue-500',
      isVisible: true,
      isInvalid: true,
      invalidReason: 'Some sections no longer available',
      lastSeenInvalidState: { reason: 'Some sections no longer available' },
    }
    const wholeCourseRemoval = {
      ...partialRemoval,
      courseId: 'CSCI3150',
      invalidReason: 'Course no longer available',
    }

    const loaded = readStoredEnrollments({
      version: 2,
      enrollments: [partialRemoval, wholeCourseRemoval],
    })

    expect(loaded?.[0]).toMatchObject({
      selectedSections: [{ id: 'live' }],
      removedSections: [{ id: 'removed' }],
      isInvalid: false,
      invalidReason: undefined,
      lastSeenInvalidState: undefined,
    })
    expect(loaded?.[0].selectedSections[0]).not.toHaveProperty('isInvalid')
    expect(loaded?.[0].removedSections?.[0]).not.toHaveProperty('isInvalid')
    expect(loaded?.[1]).toEqual(wholeCourseRemoval)
  })

  it('strips the legacy sectionIds key from a persisted lastSeenInvalidState', () => {
    const stored = [
      {
        ...mkEnrollment([]),
        isInvalid: true,
        invalidReason: 'Course no longer available',
        lastSeenInvalidState: { reason: 'Course no longer available', sectionIds: ['tut-old'] },
      },
    ] as unknown as CourseEnrollment[]

    const loaded = readStoredEnrollments({ version: 2, enrollments: stored })

    expect(loaded?.[0].lastSeenInvalidState).toEqual({ reason: 'Course no longer available' })
  })

  it('wipes (null) for an unknown/newer version', () => {
    expect(readStoredEnrollments({ version: SCHEDULE_DATA_VERSION + 1, enrollments })).toBeNull()
    expect(readStoredEnrollments({ version: 0, enrollments })).toBeNull()
  })

  it('wipes (null) for malformed data', () => {
    expect(readStoredEnrollments(null)).toBeNull()
    expect(readStoredEnrollments({ foo: 'bar' })).toBeNull()
  })
})

function mkMeeting(p: Partial<InternalMeeting>): InternalMeeting {
  return { time: 'We 2:30PM - 5:15PM', location: 'Hum 314', instructors: 'Staff', dates: '', ...p }
}
function mkSection(id: string, meetings: InternalMeeting[], classAttributes = ''): InternalSection {
  return {
    id,
    sectionCode: `--LEC (${id})`,
    sectionType: 'LEC',
    meetings,
    classAttributes,
    availability: {
      capacity: 1,
      enrolled: 0,
      status: 'Open',
      availableSeats: 1,
      waitlistCapacity: 0,
      waitlistTotal: 0,
    },
  }
}
function mkEnrollment(
  sections: InternalSection[],
  snaps?: Record<string, SectionSignature>
): CourseEnrollment {
  return {
    courseId: 'COMM1180',
    color: '#000',
    isVisible: true,
    course: { subject: 'COMM', courseCode: '1180', title: 'x', credits: 3, terms: [] },
    selectedSections: sections,
    ...(snaps ? { lastSeenSections: snaps } : {}),
  }
}
const sig = (s: InternalSection) => sectionSignature(s)

describe('getChangedCourseIds', () => {
  it('includes invalid, tombstoned, and section-changed courses once in cart order', () => {
    const enrollments = [
      { ...mkEnrollment([]), courseId: 'invalid', isInvalid: true },
      {
        ...mkEnrollment([]),
        courseId: 'removed',
        removedSections: [makeSection({ id: 'removed' })],
      },
      { ...mkEnrollment([]), courseId: 'changed' },
      { ...mkEnrollment([]), courseId: 'both', isInvalid: true },
    ]
    const sectionChanges = new Map<string, []>([
      ['changed', []],
      ['both', []],
    ])

    expect(getChangedCourseIds(enrollments, sectionChanges)).toEqual([
      'invalid',
      'removed',
      'changed',
      'both',
    ])
  })

  it('acknowledges section and invalid changes without making the course valid', () => {
    const section = mkSection('8818', [mkMeeting({ time: 'Mo 2:30PM - 5:15PM' })])
    const enrollment = {
      ...mkEnrollment([section], {
        '8818': {
          meetings: [{ time: 'stale', location: 'stale', instructor: 'stale' }],
          language: '',
        },
      }),
      isInvalid: true,
      invalidReason: 'Course no longer available',
    }

    expect(diffEnrollment(enrollment)).toHaveLength(1)
    expect(hasUnseenInvalidChange(enrollment)).toBe(true)

    const acknowledged = recordSeenChanges(enrollment)

    expect(diffEnrollment(acknowledged)).toHaveLength(0)
    expect(hasUnseenInvalidChange(acknowledged)).toBe(false)
    expect(acknowledged.isInvalid).toBe(true)
  })

  it('reports a changed whole-course invalid reason after it was acknowledged', () => {
    const acknowledged = recordSeenChanges({
      ...mkEnrollment([]),
      isInvalid: true,
      invalidReason: 'Course data is outdated',
    })
    const changedReason = { ...acknowledged, invalidReason: 'Course no longer available' }

    expect(getChangedCourseIds([acknowledged])).toEqual([])
    expect(getChangedCourseIds([changedReason])).toEqual(['COMM1180'])
  })

  it('dismisses the banner while preserving tombstones and their replacement path', () => {
    const removed = makeSection({ id: 'removed-tut', sectionType: 'TUT' })
    const enrollment = { ...mkEnrollment([]), removedSections: [removed] }

    const acknowledged = recordSeenChanges(enrollment)

    expect(acknowledged.removedSections).toEqual([removed])
    expect(acknowledged.removedSectionsAcknowledged).toBe(true)
    expect(acknowledged.selectedSections).toEqual([])
    expect(getChangedCourseIds([acknowledged])).toEqual([])

    const alternative = makeSection({ id: 'alternative-tut', sectionType: 'TUT' })
    const freshCourse = {
      ...acknowledged.course,
      terms: [{ termCode: '2510', termName: 'Term 1', sections: [alternative] }],
    }
    const resynced = syncEnrollment(
      acknowledged,
      [freshCourse],
      'Term 1',
      new Date('2026-07-18T12:00:00.000Z')
    )

    expect(resynced.removedSections).toEqual([removed])
    expect(resynced.removedSectionsAcknowledged).toBe(true)
    expect(getChangedCourseIds([resynced])).toEqual([])
  })

  it('does not acknowledge tombstones hidden behind an invalid card on dismiss', () => {
    const removed = makeSection({ id: 'removed-tut', sectionType: 'TUT' })
    const invalid = {
      ...mkEnrollment([]),
      isInvalid: true,
      invalidReason: 'Course no longer available',
      removedSections: [removed],
    }

    // Dismiss acknowledges the invalid state, but the tombstones stay unseen.
    const dismissed = recordSeenChanges(invalid)
    expect(dismissed.removedSectionsAcknowledged).toBeUndefined()
    expect(getChangedCourseIds([dismissed])).toEqual([])

    // The course returns with the section still missing: the now-visible
    // tombstone re-enters the review queue instead of staying acknowledged.
    const alternative = makeSection({ id: 'alternative-tut', sectionType: 'TUT' })
    const freshCourse = {
      ...invalid.course,
      terms: [{ termCode: '2510', termName: 'Term 1', sections: [alternative] }],
    }
    const resynced = syncEnrollment(
      dismissed,
      [freshCourse],
      'Term 1',
      new Date('2026-07-18T12:00:00.000Z')
    )
    expect(resynced.isInvalid).toBe(false)
    expect(resynced.removedSections).toEqual([removed])
    expect(getChangedCourseIds([resynced])).toEqual(['COMM1180'])
  })

  it('keeps a previously seen tombstone acknowledged across invalid and back', () => {
    const removed = makeSection({ id: 'removed-tut', sectionType: 'TUT' })
    const seen = recordSeenChanges({ ...mkEnrollment([]), removedSections: [removed] })
    expect(seen.removedSectionsAcknowledged).toBe(true)

    // Course disappears, user dismisses the invalid card, course returns unchanged:
    // nothing new happened, so the banner stays quiet.
    const invalid = { ...seen, isInvalid: true, invalidReason: 'Course no longer available' }
    const dismissed = recordSeenChanges(invalid)
    expect(dismissed.removedSectionsAcknowledged).toBe(true)

    const freshCourse = {
      ...seen.course,
      terms: [{ termCode: '2510', termName: 'Term 1', sections: [] }],
    }
    const resynced = syncEnrollment(
      dismissed,
      [freshCourse],
      'Term 1',
      new Date('2026-07-18T12:00:00.000Z')
    )
    expect(resynced.removedSectionsAcknowledged).toBe(true)
    expect(getChangedCourseIds([resynced])).toEqual([])
  })
})

describe('isEnrollmentOpen', () => {
  const open = makeSection({ id: 'open' })
  const closed = makeSection({
    id: 'closed',
    availability: { ...open.availability, status: 'Closed' },
  })

  it('is open only when every selected section is open', () => {
    expect(isEnrollmentOpen(mkEnrollment([open]))).toBe(true)
    expect(isEnrollmentOpen(mkEnrollment([open, closed]))).toBe(false)
  })

  it('is not open with zero live sections (all tombstoned), despite vacuous every()', () => {
    const allTombstoned = {
      ...mkEnrollment([]),
      removedSections: [makeSection({ id: 'removed-lec' })],
    }
    expect(isEnrollmentOpen(allTombstoned)).toBe(false)
  })
})

describe('sectionsOverlapInTime', () => {
  it('reports only real meeting overlaps', () => {
    const scheduled = mkSection('scheduled', [mkMeeting({ time: 'Mo 9:00AM - 10:00AM' })])
    const overlapping = mkSection('overlapping', [mkMeeting({ time: 'Mo 9:30AM - 10:30AM' })])
    const unscheduled = mkSection('unscheduled', [mkMeeting({ time: 'TBA' })])

    expect(sectionsOverlapInTime(scheduled, overlapping)).toBe(true)
    expect(sectionsOverlapInTime(scheduled, unscheduled)).toBe(false)
  })
})

describe('checkSectionConflict', () => {
  it('reports the enrolled course and section type for an overlap', () => {
    const candidate = mkSection('candidate', [mkMeeting({ time: 'Mo 9:00AM - 10:00AM' })])
    const enrolled = mkSection('enrolled', [mkMeeting({ time: 'Mo 9:30AM - 10:30AM' })])

    expect(checkSectionConflict(candidate, [mkEnrollment([enrolled])])).toEqual({
      hasConflict: true,
      conflictingSections: ['COMM1180 LEC'],
    })
  })
})

describe('hasConflictFreeEnrollment', () => {
  const courseWithSections = (sections: InternalSection[]): InternalCourse => ({
    subject: 'TEST',
    courseCode: '1000',
    title: 'Test Course',
    credits: 3,
    terms: [{ termCode: '2510', termName: 'Term 1', sections }],
  })

  const timedSection = (
    id: string,
    sectionType: InternalSection['sectionType'],
    sectionCode: string,
    time: string
  ): InternalSection =>
    makeSection({
      id,
      sectionType,
      sectionCode,
      meetings: [mkMeeting({ time })],
    })

  it('rejects a required section that overlaps the baseline', () => {
    const course = courseWithSections([timedSection('lec', 'LEC', 'A-LEC', 'Mo 9:00AM - 10:00AM')])
    const baseline = [timedSection('busy', 'LEC', '--LEC', 'Mo 9:30AM - 10:30AM')]

    expect(hasConflictFreeEnrollment(course, baseline, 'Term 1')).toBe(false)
  })

  it('backtracks until it finds a jointly compatible, non-overlapping combination', () => {
    const course = courseWithSections([
      timedSection('lec-a', 'LEC', 'A-LEC', 'Mo 9:00AM - 10:00AM'),
      timedSection('lec-b', 'LEC', 'B-LEC', 'Tu 9:00AM - 10:00AM'),
      timedSection('tut-a', 'TUT', 'AT01-TUT', 'Mo 9:30AM - 10:30AM'),
      timedSection('tut-b', 'TUT', 'BT01-TUT', 'We 9:00AM - 10:00AM'),
    ])

    expect(hasConflictFreeEnrollment(course, [], 'Term 1')).toBe(true)
  })

  it('rejects courses whose individually free sections cannot form one valid combination', () => {
    const course = courseWithSections([
      timedSection('lec-a', 'LEC', 'A-LEC', 'Mo 9:00AM - 10:00AM'),
      timedSection('lec-b', 'LEC', 'B-LEC', 'Tu 9:00AM - 10:00AM'),
      timedSection('tut-a', 'TUT', 'AT01-TUT', 'Mo 9:30AM - 10:30AM'),
      timedSection('tut-b', 'TUT', 'BT01-TUT', 'Tu 9:30AM - 10:30AM'),
    ])

    expect(hasConflictFreeEnrollment(course, [], 'Term 1')).toBe(false)
  })

  it('skips a lower-priority type when no section is cohort-compatible', () => {
    const course = courseWithSections([
      timedSection('lec-a', 'LEC', 'A-LEC', 'Mo 9:00AM - 10:00AM'),
      timedSection('tut-b', 'TUT', 'BT01-TUT', 'Tu 9:00AM - 10:00AM'),
    ])

    expect(hasConflictFreeEnrollment(course, [], 'Term 1')).toBe(true)
  })

  it('treats unscheduled meetings as conflict-free', () => {
    const course = courseWithSections([timedSection('lec', 'LEC', 'A-LEC', 'TBA')])
    const baseline = [timedSection('busy', 'LEC', '--LEC', 'Mo 9:00AM - 10:00AM')]

    expect(hasConflictFreeEnrollment(course, baseline, 'Term 1')).toBe(true)
  })
})

describe('sectionSignature', () => {
  it('preserves meeting appearance order (so display and pairing match the source)', () => {
    const s = mkSection('1', [
      mkMeeting({ time: 'We 9AM - 10AM' }),
      mkMeeting({ time: 'Mo 9AM - 10AM' }),
    ])
    expect(sig(s).meetings.map((m) => m.time)).toEqual(['We 9AM - 10AM', 'Mo 9AM - 10AM'])
  })
  it('dedups identical rows and collapses whitespace', () => {
    const a = mkSection('1', [
      mkMeeting({ location: 'Hum  314' }),
      mkMeeting({ location: 'Hum 314' }),
    ])
    expect(sig(a)).toEqual(sig(mkSection('1', [mkMeeting({ location: 'Hum 314' })])))
  })
  it('ignores the dates field (no false positives)', () => {
    const a = mkSection('1', [mkMeeting({ dates: '7/1, 14/1' })])
    expect(sig(a)).toEqual(sig(mkSection('1', [mkMeeting({ dates: '21/1, 28/1' })])))
  })
  it('reflects time, location, instructor and language', () => {
    const base = mkSection('1', [mkMeeting({})], 'English only')
    expect(sig(base)).not.toEqual(
      sig(mkSection('1', [mkMeeting({ time: 'Mo 2:30PM - 5:15PM' })], 'English only'))
    )
    expect(sig(base)).not.toEqual(
      sig(mkSection('1', [mkMeeting({ location: 'T.C. Cheng 208' })], 'English only'))
    )
    expect(sig(base)).not.toEqual(
      sig(mkSection('1', [mkMeeting({ instructors: 'Prof Chen' })], 'English only'))
    )
    expect(sig(base)).not.toEqual(sig(mkSection('1', [mkMeeting({})], 'Putonghua and English')))
  })
  it('keeps distinct time slots for irregular (non-weekly) schedules', () => {
    const s = mkSection('1', [
      mkMeeting({ time: 'Sa 9:30AM - 12:15PM' }),
      mkMeeting({ time: 'Su 2:00PM - 5:00PM' }),
    ])
    expect(sig(s).meetings).toContainEqual({
      time: 'Sa 9:30AM - 12:15PM',
      location: 'Hum 314',
      instructor: 'Staff',
    })
    expect(sig(s).meetings).toContainEqual({
      time: 'Su 2:00PM - 5:00PM',
      location: 'Hum 314',
      instructor: 'Staff',
    })
  })
})

describe('diffEnrollment', () => {
  it('flags a section whose current signature differs from its snapshot', () => {
    const now = mkSection('8818', [
      mkMeeting({ time: 'Mo 2:30PM - 5:15PM', location: 'T.C. Cheng 208' }),
    ])
    const stale: SectionSignature = {
      meetings: [{ time: 'stale', location: 'stale', instructor: 'stale' }],
      language: '',
    }
    const changes = diffEnrollment(mkEnrollment([now], { '8818': stale }))
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      sectionId: '8818',
      before: stale,
      after: sig(now),
    })
  })
  it('returns nothing with no snapshot (adopt), and when current matches', () => {
    const now = mkSection('8818', [mkMeeting({})])
    expect(diffEnrollment(mkEnrollment([now]))).toHaveLength(0)
    expect(diffEnrollment(mkEnrollment([now], { '8818': sig(now) }))).toHaveLength(0)
  })
  it('isolates the changed section among several and does not mutate input', () => {
    const s1 = mkSection('1', [mkMeeting({})])
    const s2 = mkSection('2', [mkMeeting({ time: 'Mo 9AM - 10AM' })])
    const e = mkEnrollment([s1, s2], {
      '1': sig(s1),
      '2': { meetings: [{ time: 'stale', location: 'stale', instructor: 'stale' }], language: '' },
    })
    const before = JSON.stringify(e)
    expect(diffEnrollment(e).map((c) => c.sectionId)).toEqual(['2'])
    expect(JSON.stringify(e)).toBe(before)
  })
})

describe('recordSeenSections', () => {
  it('onlyMissing seeds missing, keeps existing, prunes de-selected ids', () => {
    const now = mkSection('8818', [mkMeeting({ time: 'Mo 9AM - 10AM' })])
    const kept: SectionSignature = { meetings: [], language: 'kept' }
    const gone: SectionSignature = { meetings: [], language: 'gone' }
    const seeded = recordSeenSections(mkEnrollment([now], { '8818': kept, '9999': gone }), {
      onlyMissing: true,
    })
    expect(seeded.lastSeenSections!['8818']).toBe(kept)
    expect(seeded.lastSeenSections!['9999']).toBeUndefined()
  })
  it('seeds a section with no snapshot to its current signature', () => {
    const now = mkSection('8818', [mkMeeting({})])
    expect(
      recordSeenSections(mkEnrollment([now]), { onlyMissing: true }).lastSeenSections!['8818']
    ).toEqual(sig(now))
  })
  it('acknowledge (onlyMissing:false) overwrites all so diff clears', () => {
    const now = mkSection('8818', [mkMeeting({ time: 'Mo 2:30PM - 5:15PM' })])
    const stale: SectionSignature = {
      meetings: [{ time: 'stale', location: 'stale', instructor: 'stale' }],
      language: '',
    }
    expect(
      diffEnrollment(
        recordSeenSections(mkEnrollment([now], { '8818': stale }), { onlyMissing: false })
      )
    ).toHaveLength(0)
  })
  it('preserves every other enrollment field (regression guard for sync/add wrapping)', () => {
    const e = {
      ...mkEnrollment([mkSection('1', [mkMeeting({})])]),
      isInvalid: true,
      invalidReason: 'x',
      color: '#abc',
    }
    const out = recordSeenSections(e, { onlyMissing: true })
    expect(out).toMatchObject({
      courseId: e.courseId,
      color: '#abc',
      isInvalid: true,
      invalidReason: 'x',
    })
    expect(out.course).toBe(e.course)
    expect(out.selectedSections).toBe(e.selectedSections)
  })
})

describe('diffSectionDetail', () => {
  it('returns unchanged live rows and no language change when before matches current', () => {
    const now = mkSection('1', [mkMeeting({})], 'English only')
    const detail = diffSectionDetail(now, sig(now))
    expect(detail.rows).toEqual([
      {
        status: 'unchanged',
        meeting: { time: 'We 2:30PM - 5:15PM', location: 'Hum 314', instructor: 'Staff' },
      },
    ])
    expect(detail.languageChanged).toBe(false)
  })

  it('pairs an equal-count change without also returning a removed row', () => {
    const before = mkSection('1', [mkMeeting({ time: 'Mo 9AM - 10AM' })])
    const now = mkSection('1', [mkMeeting({ time: 'We 9AM - 10AM' })])
    const detail = diffSectionDetail(now, sig(before))
    expect(detail.rows).toEqual([
      {
        status: 'changed',
        meeting: { time: 'We 9AM - 10AM', location: 'Hum 314', instructor: 'Staff' },
        before: { time: 'Mo 9AM - 10AM', location: 'Hum 314', instructor: 'Staff' },
        fields: { time: true, location: false, instructor: false },
      },
    ])
  })

  it('flags every differing field on a single changed meeting', () => {
    const before = mkSection('1', [
      mkMeeting({ time: 'Mo 9AM - 10AM', location: 'Hum 314', instructors: 'Staff' }),
    ])
    const now = mkSection('1', [
      mkMeeting({ time: 'We 9AM - 10AM', location: 'T.C. Cheng 208', instructors: 'Prof Chen' }),
    ])
    const detail = diffSectionDetail(now, sig(before))
    expect(detail.rows[0].fields).toEqual({
      time: true,
      location: true,
      instructor: true,
    })
  })

  it('flags only the meeting that changed, among several, leaving the rest alone', () => {
    const before = mkSection('1', [
      mkMeeting({ time: 'Mo 9AM - 10AM' }),
      mkMeeting({ time: 'We 9AM - 10AM' }),
    ])
    const now = mkSection('1', [
      mkMeeting({ time: 'Mo 9AM - 10AM' }),
      mkMeeting({ time: 'Th 9AM - 10AM' }),
    ])
    const detail = diffSectionDetail(now, sig(before))
    expect(detail.rows).toEqual([
      {
        status: 'unchanged',
        meeting: { time: 'Mo 9AM - 10AM', location: 'Hum 314', instructor: 'Staff' },
      },
      {
        status: 'changed',
        meeting: { time: 'Th 9AM - 10AM', location: 'Hum 314', instructor: 'Staff' },
        before: { time: 'We 9AM - 10AM', location: 'Hum 314', instructor: 'Staff' },
        fields: { time: true, location: false, instructor: false },
      },
    ])
  })

  it('pairs by appearance order when several meetings change at once (same count)', () => {
    const before = mkSection('1', [
      mkMeeting({ time: 'Mo 9AM - 10AM' }),
      mkMeeting({ time: 'We 9AM - 10AM' }),
    ])
    const now = mkSection('1', [
      mkMeeting({ time: 'Tu 9AM - 10AM' }),
      mkMeeting({ time: 'Th 9AM - 10AM' }),
    ])
    const detail = diffSectionDetail(now, sig(before))
    expect(detail.rows.map((row) => [row.meeting.time, row.before!.time])).toEqual([
      ['Tu 9AM - 10AM', 'Mo 9AM - 10AM'],
      ['Th 9AM - 10AM', 'We 9AM - 10AM'],
    ])
    expect(detail.rows.every((row) => row.status === 'changed')).toBe(true)
  })

  it('tags an unpaired new meeting as added', () => {
    const before = mkSection('1', [mkMeeting({ time: 'Mo 9AM - 10AM' })])
    const now = mkSection('1', [
      mkMeeting({ time: 'Mo 9AM - 10AM' }),
      mkMeeting({ time: 'We 9AM - 10AM' }),
    ])
    const detail = diffSectionDetail(now, sig(before))
    expect(detail.rows).toEqual([
      {
        status: 'unchanged',
        meeting: { time: 'Mo 9AM - 10AM', location: 'Hum 314', instructor: 'Staff' },
      },
      {
        status: 'added',
        meeting: { time: 'We 9AM - 10AM', location: 'Hum 314', instructor: 'Staff' },
      },
    ])
  })

  it('appends a removed meeting after the remaining live rows', () => {
    const before = mkSection('1', [
      mkMeeting({ time: 'Mo 9AM - 10AM', location: 'Science Centre 327' }),
      mkMeeting({ time: 'We 9AM - 10AM' }),
      mkMeeting({ time: 'Fr 9AM - 10AM' }),
    ])
    const now = mkSection('1', [
      mkMeeting({ time: 'We 9AM - 10AM' }),
      mkMeeting({ time: 'Fr 9AM - 10AM' }),
    ])

    expect(diffSectionDetail(now, sig(before)).rows).toEqual([
      {
        status: 'unchanged',
        meeting: { time: 'We 9AM - 10AM', location: 'Hum 314', instructor: 'Staff' },
      },
      {
        status: 'unchanged',
        meeting: { time: 'Fr 9AM - 10AM', location: 'Hum 314', instructor: 'Staff' },
      },
      {
        status: 'removed',
        meeting: {
          time: 'Mo 9AM - 10AM',
          location: 'Science Centre 327',
          instructor: 'Staff',
        },
      },
    ])
  })

  it('does not fabricate pairings when added and removed counts differ', () => {
    const before = mkSection('1', [
      mkMeeting({ time: 'Mo 9AM - 10AM' }),
      mkMeeting({ time: 'We 9AM - 10AM' }),
    ])
    const now = mkSection('1', [
      mkMeeting({ time: 'We 9AM - 10AM' }),
      mkMeeting({ time: 'Th 9AM - 10AM' }),
      mkMeeting({ time: 'Fr 9AM - 10AM' }),
    ])

    expect(diffSectionDetail(now, sig(before)).rows).toEqual([
      {
        status: 'unchanged',
        meeting: { time: 'We 9AM - 10AM', location: 'Hum 314', instructor: 'Staff' },
      },
      {
        status: 'added',
        meeting: { time: 'Th 9AM - 10AM', location: 'Hum 314', instructor: 'Staff' },
      },
      {
        status: 'added',
        meeting: { time: 'Fr 9AM - 10AM', location: 'Hum 314', instructor: 'Staff' },
      },
      {
        status: 'removed',
        meeting: { time: 'Mo 9AM - 10AM', location: 'Hum 314', instructor: 'Staff' },
      },
    ])
  })

  it('reports a language-only change with unchanged meeting rows', () => {
    const before = mkSection('1', [mkMeeting({})], 'English only')
    const now = mkSection('1', [mkMeeting({})], 'Putonghua and English')
    const detail = diffSectionDetail(now, sig(before))
    expect(detail.rows).toHaveLength(1)
    expect(detail.rows[0].status).toBe('unchanged')
    expect(detail.languageChanged).toBe(true)
  })
})

describe('splitInstructorsCompact', () => {
  it.each([
    ['abbreviates Professor', 'Professor Noam NOKED', ['Prof. Noam NOKED']],
    ['leaves other titles alone', 'Dr. CHEONG Chi Hong', ['Dr. CHEONG Chi Hong']],
    [
      'splits and compacts each name',
      'Professor Noam NOKED, Dr. CHEONG Chi Hong',
      ['Prof. Noam NOKED', 'Dr. CHEONG Chi Hong'],
    ],
    ['drops blanks left by trailing commas', 'Professor CHAN Tai Man, ', ['Prof. CHAN Tai Man']],
    ['treats TBA as no instructor', 'TBA', []],
    ['treats empty as no instructor', '', []],
  ])('%s', (_label, raw, expected) => {
    expect(splitInstructorsCompact(raw)).toEqual(expected)
  })

  it('is the list formatInstructorsCompact joins', () => {
    const raw = 'Professor Noam NOKED, Dr. CHEONG Chi Hong'
    expect(splitInstructorsCompact(raw).join(', ')).toBe(formatInstructorsCompact(raw))
  })

  it('is idempotent, so a name may be compacted twice', () => {
    expect(splitInstructorsCompact('Prof. Noam NOKED')).toEqual(['Prof. Noam NOKED'])
  })
})

describe('instructorSortKey', () => {
  // Every title form the scraped data uses, dotted and undotted.
  it.each([
    ['Prof. CHAN Tai Man', 'CHAN Tai Man'],
    ['Dr. CHEONG Chi Hong', 'CHEONG Chi Hong'],
    ['Dr LEE Siu', 'LEE Siu'],
    ['Mr. WONG Ka Fai', 'WONG Ka Fai'],
    ['Mrs. LAM Siu Ling', 'LAM Siu Ling'],
    ['Mrs LAM Siu Ling', 'LAM Siu Ling'],
    ['Ms HO Wai Yin', 'HO Wai Yin'],
    ['Miss AU Wai Yin', 'AU Wai Yin'],
    ['Rev. YIU Chi Ho', 'YIU Chi Ho'],
  ])('strips the title from %s', (name, expected) => {
    expect(instructorSortKey(name)).toBe(expected)
  })

  // Not titles: leave them alone rather than guess at what they mean.
  it.each([['Staff'], ['*** CHOI Pak Tat Frankie']])('leaves %s untouched', (name) => {
    expect(instructorSortKey(name)).toBe(name)
  })

  it('sorts the names splitInstructorsCompact actually produces', () => {
    expect(splitInstructorsCompact('Professor CHAN Tai Man').map(instructorSortKey)).toEqual([
      'CHAN Tai Man',
    ])
  })
})

// MeetingRowCard renders these directly, with no `|| 'TBA'` guard of its own.
describe('empty-value fallbacks', () => {
  it('renders TBA for a missing time or instructor', () => {
    expect(formatTimeCompact('')).toBe('TBA')
    expect(formatInstructorsCompact('')).toBe('TBA')
  })
})

describe('getAvailabilityBadges', () => {
  // CHLT 1001 CD-LEC: full, nobody queued yet, but the queue is open — joining puts a
  // student first in line. Reading the seat counts alone hides that entirely.
  const fullWithOpenQueue = {
    capacity: 25,
    enrolled: 25,
    status: 'Wait List' as const,
    availableSeats: 0,
    waitlistCapacity: 999,
    waitlistTotal: 0,
  }

  it('shows the queue on a full class whose wait list is open but empty', () => {
    expect(getAvailabilityBadges(fullWithOpenQueue).map((badge) => badge.text)).toEqual([
      'Wait List',
      '0/25 Available',
      '0 Waiting',
    ])
  })

  it('colours the seat count by seats alone, not by the catalog status', () => {
    // UGFN 1000 C is real: CUHK says Open with 11 seats and 6 people queued, so its word
    // does not track the seat counts. If it ever says Wait List with seats left, the seat
    // badge still answers "can I take one now?" — and the answer is yes.
    const seats = {
      capacity: 136,
      enrolled: 125,
      availableSeats: 11,
      waitlistCapacity: 999,
      waitlistTotal: 6,
    }
    // Picked by type, not position: a conditional status badge would shift both
    // destructures together and quietly compare two of the same badge.
    const seatStyle = (availability: SectionAvailability) =>
      getAvailabilityBadges(availability).find((badge) => badge.type === 'availability')?.style
        .className

    const waitList = seatStyle({ ...seats, status: 'Wait List' })

    expect(waitList).toBeDefined()
    expect(waitList).toEqual(seatStyle({ ...seats, status: 'Open' }))
  })

  it('shows no queue on a full class with no wait list', () => {
    const badges = getAvailabilityBadges({
      ...fullWithOpenQueue,
      status: 'Closed',
      waitlistCapacity: 0,
    })
    expect(badges.map((badge) => badge.text)).toEqual(['Closed', '0/25 Available'])
  })
})
