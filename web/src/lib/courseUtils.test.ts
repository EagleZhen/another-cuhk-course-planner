import { describe, it, expect } from 'vitest'
import {
  updateExistingEnrollment,
  sortSectionsByPriority,
  readStoredEnrollments,
  sectionSignature,
  diffEnrollment,
  recordSeenSections,
  diffSectionDetail,
} from './courseUtils'
import { SCHEDULE_DATA_VERSION } from './constants'
import type { CourseEnrollment, InternalCourse, InternalSection, InternalMeeting } from './types'

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
    expect(result.lastSynced).toBeInstanceOf(Date)
    expect(result.lastSynced).not.toEqual(existing.lastSynced)
    expect(result.course).toEqual(freshCourse)
    expect(result.selectedSections).toEqual([freshSection])
  })
})

describe('readStoredEnrollments', () => {
  const enrollments = [{ courseId: 'COMM1180' }] as unknown as CourseEnrollment[]

  it('loads the legacy pre-version array format', () => {
    expect(readStoredEnrollments(enrollments)).toBe(enrollments)
  })

  it('loads a known version (1..current) and returns its enrollments', () => {
    expect(readStoredEnrollments({ version: 1, enrollments })).toBe(enrollments)
    expect(readStoredEnrollments({ version: SCHEDULE_DATA_VERSION, enrollments })).toBe(enrollments)
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
  snaps?: Record<string, string>
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

describe('sectionSignature', () => {
  it('is deterministic and independent of meeting order', () => {
    const a = mkSection('1', [
      mkMeeting({ time: 'We 9AM - 10AM' }),
      mkMeeting({ time: 'Mo 9AM - 10AM' }),
    ])
    const b = mkSection('1', [
      mkMeeting({ time: 'Mo 9AM - 10AM' }),
      mkMeeting({ time: 'We 9AM - 10AM' }),
    ])
    expect(sig(a)).toBe(sig(b))
  })
  it('dedups identical rows and collapses whitespace', () => {
    const a = mkSection('1', [
      mkMeeting({ location: 'Hum  314' }),
      mkMeeting({ location: 'Hum 314' }),
    ])
    expect(sig(a)).toBe(sig(mkSection('1', [mkMeeting({ location: 'Hum 314' })])))
  })
  it('ignores the dates field (no false positives)', () => {
    const a = mkSection('1', [mkMeeting({ dates: '7/1, 14/1' })])
    expect(sig(a)).toBe(sig(mkSection('1', [mkMeeting({ dates: '21/1, 28/1' })])))
  })
  it('reflects time, location, instructor and language', () => {
    const base = mkSection('1', [mkMeeting({})], 'English only')
    expect(sig(base)).not.toBe(
      sig(mkSection('1', [mkMeeting({ time: 'Mo 2:30PM - 5:15PM' })], 'English only'))
    )
    expect(sig(base)).not.toBe(
      sig(mkSection('1', [mkMeeting({ location: 'T.C. Cheng 208' })], 'English only'))
    )
    expect(sig(base)).not.toBe(
      sig(mkSection('1', [mkMeeting({ instructors: 'Prof Chen' })], 'English only'))
    )
    expect(sig(base)).not.toBe(sig(mkSection('1', [mkMeeting({})], 'Putonghua and English')))
  })
  it('keeps distinct time slots for irregular (non-weekly) schedules', () => {
    const s = mkSection('1', [
      mkMeeting({ time: 'Sa 9:30AM - 12:15PM' }),
      mkMeeting({ time: 'Su 2:00PM - 5:00PM' }),
    ])
    expect(sig(s)).toContain('Sa 9:30AM - 12:15PM')
    expect(sig(s)).toContain('Su 2:00PM - 5:00PM')
  })
})

describe('diffEnrollment', () => {
  it('flags a section whose current signature differs from its snapshot', () => {
    const now = mkSection('8818', [
      mkMeeting({ time: 'Mo 2:30PM - 5:15PM', location: 'T.C. Cheng 208' }),
    ])
    const changes = diffEnrollment(mkEnrollment([now], { '8818': 'stale-signature' }))
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      sectionId: '8818',
      before: 'stale-signature',
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
    const e = mkEnrollment([s1, s2], { '1': sig(s1), '2': 'stale' })
    const before = JSON.stringify(e)
    expect(diffEnrollment(e).map((c) => c.sectionId)).toEqual(['2'])
    expect(JSON.stringify(e)).toBe(before)
  })
})

describe('recordSeenSections', () => {
  it('onlyMissing seeds missing, keeps existing, prunes de-selected ids', () => {
    const now = mkSection('8818', [mkMeeting({ time: 'Mo 9AM - 10AM' })])
    const seeded = recordSeenSections(mkEnrollment([now], { '8818': 'kept', '9999': 'gone' }), {
      onlyMissing: true,
    })
    expect(seeded.lastSeenSections!['8818']).toBe('kept')
    expect(seeded.lastSeenSections!['9999']).toBeUndefined()
  })
  it('seeds a section with no snapshot to its current signature', () => {
    const now = mkSection('8818', [mkMeeting({})])
    expect(
      recordSeenSections(mkEnrollment([now]), { onlyMissing: true }).lastSeenSections!['8818']
    ).toBe(sig(now))
  })
  it('acknowledge (onlyMissing:false) overwrites all so diff clears', () => {
    const now = mkSection('8818', [mkMeeting({ time: 'Mo 2:30PM - 5:15PM' })])
    expect(
      diffEnrollment(
        recordSeenSections(mkEnrollment([now], { '8818': 'stale' }), { onlyMissing: false })
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
  it('flags no changed lines and no language change when before matches current', () => {
    const now = mkSection('1', [mkMeeting({})], 'English only')
    const detail = diffSectionDetail(now, sig(now))
    expect(detail.changedMeetingLines.size).toBe(0)
    expect(detail.languageChanged).toBe(false)
  })

  it('flags the current meeting line when its time differs from before', () => {
    const before = mkSection('1', [mkMeeting({ time: 'Mo 9AM - 10AM' })])
    const now = mkSection('1', [mkMeeting({ time: 'We 9AM - 10AM' })])
    const detail = diffSectionDetail(now, sig(before))
    expect(Array.from(detail.changedMeetingLines)).toEqual(['We 9AM - 10AM · Hum 314 · Staff'])
  })

  it('flags only the meeting line that actually changed, among several', () => {
    const before = mkSection('1', [
      mkMeeting({ time: 'Mo 9AM - 10AM' }),
      mkMeeting({ time: 'We 9AM - 10AM' }),
    ])
    const now = mkSection('1', [
      mkMeeting({ time: 'Mo 9AM - 10AM' }),
      mkMeeting({ time: 'Th 9AM - 10AM' }),
    ])
    const detail = diffSectionDetail(now, sig(before))
    expect(Array.from(detail.changedMeetingLines)).toEqual(['Th 9AM - 10AM · Hum 314 · Staff'])
  })

  it('flags a language-only change without flagging any meeting line', () => {
    const before = mkSection('1', [mkMeeting({})], 'English only')
    const now = mkSection('1', [mkMeeting({})], 'Putonghua and English')
    const detail = diffSectionDetail(now, sig(before))
    expect(detail.changedMeetingLines.size).toBe(0)
    expect(detail.languageChanged).toBe(true)
  })

  it('flags both independently when meeting and language change together', () => {
    const before = mkSection('1', [mkMeeting({ time: 'Mo 9AM - 10AM' })], 'English only')
    const now = mkSection('1', [mkMeeting({ time: 'We 9AM - 10AM' })], 'Putonghua and English')
    const detail = diffSectionDetail(now, sig(before))
    expect(detail.changedMeetingLines.size).toBe(1)
    expect(detail.languageChanged).toBe(true)
  })

  it('does not mistake the last meeting line for a language segment when there is no language', () => {
    const before = mkSection('1', [mkMeeting({ time: 'Mo 9AM - 10AM' })], '')
    const now = mkSection('1', [mkMeeting({ time: 'We 9AM - 10AM' })], '')
    const detail = diffSectionDetail(now, sig(before))
    expect(Array.from(detail.changedMeetingLines)).toEqual(['We 9AM - 10AM · Hum 314 · Staff'])
    expect(detail.languageChanged).toBe(false)
  })
})
