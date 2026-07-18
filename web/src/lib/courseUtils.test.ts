import { describe, it, expect } from 'vitest'
import {
  updateExistingEnrollment,
  sortSectionsByPriority,
  readStoredEnrollments,
  sectionSignature,
  diffEnrollment,
  recordSeenSections,
  diffSectionDetail,
  matchChangedMeeting,
  sectionsOverlapInTime,
  checkSectionConflict,
  hasConflictFreeEnrollment,
} from './courseUtils'
import { SCHEDULE_DATA_VERSION } from './constants'
import type {
  CourseEnrollment,
  InternalCourse,
  InternalSection,
  InternalMeeting,
  SectionSignature,
} from './types'

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

describe('matchChangedMeeting', () => {
  const changed = [
    {
      current: { time: 'We 9AM - 10AM', location: 'Hum 314', instructor: 'Staff' },
      before: { time: 'Mo 9AM - 10AM', location: 'Hum 314', instructor: 'Staff' },
      fields: { time: true, location: false, instructor: false },
    },
  ]

  it('matches a raw meeting to its change entry after normalization', () => {
    const meeting = mkMeeting({ time: 'We 9AM - 10AM', location: 'Hum  314' }) // double space
    expect(matchChangedMeeting(meeting, changed)).toBe(changed[0])
  })

  it('returns undefined for a meeting not in the changed list', () => {
    expect(matchChangedMeeting(mkMeeting({ time: 'Mo 9AM - 10AM' }), changed)).toBeUndefined()
  })

  it('returns undefined for an empty changed list', () => {
    expect(matchChangedMeeting(mkMeeting({}), [])).toBeUndefined()
  })
})
