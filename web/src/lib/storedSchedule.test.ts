import { describe, it, expect } from 'vitest'
import { SCHEDULE_DATA_VERSION } from './constants'
import { diffEnrollment, sectionSignature } from './courseUtils'
import { readStoredEnrollments, serializeStoredSchedule } from './storedSchedule'
import { transformExternalCourseData } from './validation'
import type { CourseEnrollment, InternalCourse, InternalSection, SectionSignature } from './types'

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
    enrollmentRequirement: '',
    ...overrides,
  }
}

function makeCourse(sections: InternalSection[], termName = 'Term 1'): InternalCourse {
  return {
    subject: 'CSCI',
    courseCode: '3100',
    title: 'Software Engineering',
    credits: { min: 3, max: 3 },
    terms: [{ termCode: '2510', termName, sections }],
  }
}

function makeEnrollment(overrides: Partial<CourseEnrollment> = {}): CourseEnrollment {
  return {
    courseId: 'CSCI3100',
    course: makeCourse([]),
    selectedSections: [],
    color: 'bg-blue-500',
    isVisible: true,
    ...overrides,
  }
}

function readEnrollments(parsed: unknown): CourseEnrollment[] | null {
  const result = readStoredEnrollments(parsed)
  return result?.status === 'ready' ? result.enrollments : null
}

describe('readStoredEnrollments', () => {
  const enrollments = [makeEnrollment()]

  it('loads the legacy pre-version array format', () => {
    expect(readEnrollments(enrollments)).toEqual(enrollments)
  })

  it('loads a known version (1..current) and returns its enrollments', () => {
    expect(readEnrollments({ version: 1, enrollments })).toEqual(enrollments)
    expect(readEnrollments({ version: SCHEDULE_DATA_VERSION, enrollments })).toEqual(enrollments)
  })

  it('revives lastSynced from its persisted ISO string to a Date', () => {
    const stored = [
      { ...makeEnrollment(), lastSynced: '2026-07-14T13:27:10.392Z' },
    ] as unknown as CourseEnrollment[]

    const loaded = readEnrollments({ version: SCHEDULE_DATA_VERSION, enrollments: stored })

    expect(loaded?.[0].lastSynced).toEqual(new Date('2026-07-14T13:27:10.392Z'))
  })

  it("renames a snapshot's language to classAttributes, so it still reports a change", () => {
    // MUSC3530 was published blank and now states a language: the snapshot must carry the old
    // value over, or the change re-baselines silently.
    const stored = [
      { ...makeEnrollment(), lastSeenSections: { lec: { meetings: [], language: '' } } },
    ] as unknown as CourseEnrollment[]

    const loaded = readEnrollments({ version: SCHEDULE_DATA_VERSION, enrollments: stored })
    const now = makeSection({ id: 'lec', classAttributes: 'Cantonese and English' })

    expect(loaded?.[0].lastSeenSections!['lec'].classAttributes).toBe('')
    expect(
      diffEnrollment({ ...loaded![0], selectedSections: [now] } as CourseEnrollment)
    ).toHaveLength(1)

    // Idempotent: a second load must not change it.
    expect(readEnrollments({ version: SCHEDULE_DATA_VERSION, enrollments: loaded! })).toEqual(
      loaded
    )
  })

  it('renames the derived wait list status in selected and removed sections', () => {
    const stored = [
      {
        ...makeEnrollment(),
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

    const loaded = readEnrollments({ version: SCHEDULE_DATA_VERSION, enrollments: stored })

    expect(loaded?.[0].selectedSections[0].availability.status).toBe('Wait List')
    expect(loaded?.[0].removedSections?.[0].availability.status).toBe('Wait List')

    // Idempotent: a second load must not change it.
    expect(readEnrollments({ version: SCHEDULE_DATA_VERSION, enrollments: loaded! })).toEqual(
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

    const loaded = readEnrollments({
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
        ...makeEnrollment(),
        courseId: 'COMM1180',
        isInvalid: true,
        invalidReason: 'Course no longer available',
        lastSeenInvalidState: { reason: 'Course no longer available', sectionIds: ['tut-old'] },
      },
    ] as unknown as CourseEnrollment[]

    const loaded = readEnrollments({ version: 2, enrollments: stored })

    expect(loaded?.[0].lastSeenInvalidState).toEqual({ reason: 'Course no longer available' })
  })

  it('returns null for an unknown/newer version', () => {
    expect(readEnrollments({ version: SCHEDULE_DATA_VERSION + 1, enrollments })).toBeNull()
    expect(readEnrollments({ version: 0, enrollments })).toBeNull()
  })

  it('returns null for malformed data', () => {
    expect(readEnrollments(null)).toBeNull()
    expect(readEnrollments({ foo: 'bar' })).toBeNull()
  })
})

describe('stored carts across the credits reshape (#331)', () => {
  const saved = makeSection({ id: 'PGDE5101_A', classAttributes: 'Cantonese only' })

  const storedWithCredits = (credits: unknown) =>
    [
      {
        ...makeEnrollment(),
        courseId: 'PGDE5101',
        course: { subject: 'PGDE', courseCode: '5101', title: 'x', credits, terms: [] },
        selectedSections: [],
        color: 'bg-blue-500',
        isVisible: true,
      },
    ] as unknown as CourseEnrollment[]

  it('reshapes the bare number a pre-#331 blob stored', () => {
    const loaded = readEnrollments(storedWithCredits(3))

    expect(loaded?.[0].course.credits).toEqual({ min: 3, max: 3 })
  })

  it('leaves an already-current blob alone, so re-normalizing is a no-op', () => {
    const loaded = readEnrollments(storedWithCredits({ min: 1.5, max: 2 }))

    expect(loaded?.[0].course.credits).toEqual({ min: 1.5, max: 2 })
  })

  const storedWithSnapshot = (snapshot: SectionSignature) =>
    [
      {
        ...makeEnrollment(),
        courseId: 'PGDE5101',
        course: { subject: 'PGDE', courseCode: '5101', title: 'x', credits: 3, terms: [] },
        selectedSections: [saved],
        lastSeenSections: { [saved.id]: snapshot },
        color: 'bg-blue-500',
        isVisible: true,
      },
    ] as unknown as CourseEnrollment[]

  it('does not report a section change, since credits are not in the signature', () => {
    // The reshape must not make the cart claim CUHK changed something the user saved.
    const loaded = readEnrollments(storedWithSnapshot(sectionSignature(saved)))

    expect(loaded?.[0].course.credits).toEqual({ min: 3, max: 3 })
    expect(diffEnrollment(loaded![0])).toEqual([])
  })

  it('still reports a section CUHK did change, so the check above could have failed', () => {
    const wasEnglish = { ...sectionSignature(saved), classAttributes: 'English only' }
    const loaded = readEnrollments(storedWithSnapshot(wasEnglish))

    expect(diffEnrollment(loaded![0])).toHaveLength(1)
  })
})

// Reject the whole record: partial success would silently discard saved choices.
describe('saved schedule validation', () => {
  it.each([
    { version: 3 },
    { version: 3, enrollments: {} },
    { version: 3, enrollments: [makeEnrollment(), { courseId: 'broken' }] },
    { version: 3, enrollments: [makeEnrollment({ selectedSections: [{}] as InternalSection[] })] },
    {
      version: 3,
      enrollments: [
        makeEnrollment({ course: { ...makeCourse([]), credits: { min: 3 } } as InternalCourse }),
      ],
    },
    {
      version: 3,
      enrollments: [
        makeEnrollment({
          lastSeenSections: { lec: { meetings: 'bad' } } as unknown as Record<
            string,
            SectionSignature
          >,
        }),
      ],
    },
    { version: 3, enrollments: [makeEnrollment({ lastSynced: new Date('invalid') })] },
  ])('blocks malformed data without mutating the original: %#', (input) => {
    const original = structuredClone(input)
    expect(readStoredEnrollments(input)).toMatchObject({
      status: 'blocked',
      reason: 'invalid_data',
    })
    expect(input).toEqual(original)
  })

  it.each([0, 1.5, SCHEDULE_DATA_VERSION + 1])('blocks unsupported version %s', (version) => {
    expect(readStoredEnrollments({ version, enrollments: [] })).toMatchObject({
      status: 'blocked',
      reason: 'unsupported_version',
      version,
    })
  })

  it('accepts intentional emptiness', () => {
    expect(readStoredEnrollments({ version: 3, enrollments: [] })).toMatchObject({
      status: 'ready',
      enrollments: [],
    })
  })

  it('keeps unknown envelope, enrollment, section, and acknowledgment fields', () => {
    const section = { ...makeSection({}), futureSection: 'keep' }
    const enrollment = {
      ...makeEnrollment({ selectedSections: [section] }),
      futureChoice: 'keep',
      lastSeenInvalidState: { reason: 'gone', sectionIds: [], futureAcknowledgment: 'keep' },
    }
    const result = readStoredEnrollments({
      version: 3,
      enrollments: [enrollment],
      futureEnvelope: 'keep',
    })
    expect(result).toMatchObject({
      status: 'ready',
      envelope: { futureEnvelope: 'keep' },
      enrollments: [
        {
          futureChoice: 'keep',
          selectedSections: [{ futureSection: 'keep' }],
          lastSeenInvalidState: { futureAcknowledgment: 'keep' },
        },
      ],
    })
  })
})

it('blocks ambiguous enrollment identities instead of making one action affect two choices', () => {
  const one = makeEnrollment()
  expect(readStoredEnrollments({ version: 3, enrollments: [one, one] })).toMatchObject({
    status: 'blocked',
    reason: 'invalid_data',
  })
  const firstLegacy = { ...one, courseId: 'CSCI3100_old_1' }
  const secondLegacy = { ...one, courseId: 'CSCI3100_old_2' }
  expect(
    readStoredEnrollments({ version: 3, enrollments: [firstLegacy, secondLegacy] })
  ).toMatchObject({ status: 'blocked', reason: 'invalid_data' })
})

it('normalizes legacy waitlist labels in stored course alternatives too', () => {
  const section = makeSection({
    availability: { ...makeSection({}).availability, status: 'Waitlisted' as 'Wait List' },
  })
  const result = readStoredEnrollments({
    version: 3,
    enrollments: [makeEnrollment({ course: makeCourse([section]), selectedSections: [section] })],
  })
  expect(result).toMatchObject({
    status: 'ready',
    enrollments: [
      {
        course: { terms: [{ sections: [{ availability: { status: 'Wait List' } }] }] },
        selectedSections: [{ availability: { status: 'Wait List' } }],
      },
    ],
  })
})

it('preserves the unknown seat count that the catalog producer serializes as null', () => {
  const course = transformExternalCourseData({
    metadata: { subject: 'ACCT', total_courses: 1 },
    courses: [
      {
        subject: 'ACCT',
        course_code: '1111',
        title: 'Accounting',
        terms: [
          {
            term_code: '2610',
            term_name: '2026-27 Term 1',
            schedule: [{ section: 'A-LEC (1)', availability: { available_seats: 'TBA' } }],
          },
        ],
      },
    ],
  }).courses[0]
  const raw = serializeStoredSchedule([
    makeEnrollment({ course, selectedSections: course.terms[0].sections }),
  ])
  expect(JSON.parse(raw).enrollments[0].selectedSections[0].availability.availableSeats).toBeNull()
  const result = readStoredEnrollments(JSON.parse(raw))
  expect(result.status).toBe('ready')
  if (result.status !== 'ready') throw Error('expected readable legacy data')
  expect(result.enrollments[0].selectedSections[0].availability.availableSeats).toBeNaN()
  expect(result.enrollments[0].course.terms[0].sections[0].availability.availableSeats).toBeNaN()
  expect(readStoredEnrollments({ version: 3, enrollments: result.enrollments }).status).toBe(
    'ready'
  )
})
