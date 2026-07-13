import { describe, it, expect } from 'vitest'
import {
  filterCourses,
  filterCoursesExceptDays,
  hasActiveFilters,
  courseMatchesKeyword,
  type CourseFilterCriteria,
} from './courseFilters'
import type { InternalCourse, InternalSection, InternalMeeting } from './types'

const TERM = 'Term 1'

function makeMeeting(overrides: Partial<InternalMeeting> = {}): InternalMeeting {
  return { time: 'Mo 10:30AM - 12:15PM', location: 'LSB', instructors: '', dates: '', ...overrides }
}

function makeSection(overrides: Partial<InternalSection> = {}): InternalSection {
  return {
    id: 'sec',
    sectionCode: 'A-LEC',
    sectionType: 'LEC',
    meetings: [makeMeeting()],
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

function makeCourse(overrides: Partial<InternalCourse> = {}): InternalCourse {
  return {
    subject: 'CSCI',
    courseCode: '1130',
    title: 'Intro to Computing',
    credits: 3,
    terms: [{ termCode: '2510', termName: TERM, sections: [makeSection()] }],
    ...overrides,
  }
}

const noFilters: CourseFilterCriteria = {
  searchTerm: '',
  subjects: new Set(),
  days: new Set(),
}
const ctx = { term: TERM }

describe('filterCourses', () => {
  it('keeps only courses offered in the term', () => {
    const inTerm = makeCourse({ courseCode: '1130' })
    const otherTerm = makeCourse({
      courseCode: '2100',
      terms: [{ termCode: '2520', termName: 'Term 2', sections: [makeSection()] }],
    })
    const result = filterCourses([inTerm, otherTerm], noFilters, ctx)
    expect(result).toEqual([inTerm])
  })

  it('filters by subject when subjects are selected', () => {
    const csci = makeCourse({ subject: 'CSCI' })
    const engg = makeCourse({ subject: 'ENGG' })
    const result = filterCourses([csci, engg], { ...noFilters, subjects: new Set(['CSCI']) }, ctx)
    expect(result).toEqual([csci])
  })

  it('filters by day, ignoring TBA meetings', () => {
    const monday = makeCourse({
      courseCode: '1000',
      terms: [
        {
          termCode: '2510',
          termName: TERM,
          sections: [makeSection({ meetings: [makeMeeting({ time: 'Mo 10:30AM - 12:15PM' })] })],
        },
      ],
    })
    const friday = makeCourse({
      courseCode: '2000',
      terms: [
        {
          termCode: '2510',
          termName: TERM,
          sections: [makeSection({ meetings: [makeMeeting({ time: 'Fr 2:30PM - 4:15PM' })] })],
        },
      ],
    })
    // Mon=0, Fr=4
    const result = filterCourses([monday, friday], { ...noFilters, days: new Set([0]) }, ctx)
    expect(result).toEqual([monday])
  })

  it('composes multiple active dimensions (AND)', () => {
    const match = makeCourse({ subject: 'CSCI', title: 'Algorithms' })
    const wrongSubject = makeCourse({ subject: 'ENGG', title: 'Algorithms' })
    const wrongKeyword = makeCourse({ subject: 'CSCI', title: 'Databases' })
    const result = filterCourses(
      [match, wrongSubject, wrongKeyword],
      { ...noFilters, subjects: new Set(['CSCI']), searchTerm: 'algo' },
      ctx
    )
    expect(result).toEqual([match])
  })

  it('returns all in-term courses when no filters are active', () => {
    const a = makeCourse({ courseCode: '1000' })
    const b = makeCourse({ courseCode: '2000' })
    expect(filterCourses([a, b], noFilters, ctx)).toEqual([a, b])
  })
})

describe('courseMatchesKeyword', () => {
  const course = makeCourse({
    subject: 'CSCI',
    courseCode: '1130',
    title: 'Intro to Computing',
    description: 'A gentle introduction to programming.',
    terms: [
      {
        termCode: '2510',
        termName: TERM,
        sections: [makeSection({ meetings: [makeMeeting({ instructors: 'Prof. Chan' })] })],
      },
    ],
  })

  it.each([
    ['full code', 'csci1130'],
    ['bare code', '1130'],
    ['title', 'computing'],
    ['description', 'programming'],
    ['instructor', 'chan'],
  ])('matches on %s', (_label, query) => {
    expect(courseMatchesKeyword(course, query, TERM)).toBe(true)
  })

  it('returns false when nothing matches', () => {
    expect(courseMatchesKeyword(course, 'biology', TERM)).toBe(false)
  })
})

describe('filterCoursesExceptDays', () => {
  it('ignores the day filter but still applies subject/keyword', () => {
    const friday = makeCourse({
      subject: 'CSCI',
      terms: [
        {
          termCode: '2510',
          termName: TERM,
          sections: [makeSection({ meetings: [makeMeeting({ time: 'Fr 2:30PM - 4:15PM' })] })],
        },
      ],
    })
    // A Monday-only day filter would drop this course in filterCourses, but not here.
    const criteria = { ...noFilters, subjects: new Set(['CSCI']), days: new Set([0]) }
    expect(filterCoursesExceptDays([friday], criteria, ctx)).toEqual([friday])
    expect(filterCourses([friday], criteria, ctx)).toEqual([])
  })
})

describe('hasActiveFilters', () => {
  it('is false with no search, subjects, or days', () => {
    expect(hasActiveFilters(noFilters)).toBe(false)
  })

  it.each([
    ['search', { ...noFilters, searchTerm: '  algo ' }],
    ['subjects', { ...noFilters, subjects: new Set(['CSCI']) }],
    ['days', { ...noFilters, days: new Set([0]) }],
  ])('is true when %s is set', (_label, criteria) => {
    expect(hasActiveFilters(criteria)).toBe(true)
  })

  it('ignores blank whitespace search', () => {
    expect(hasActiveFilters({ ...noFilters, searchTerm: '   ' })).toBe(false)
  })
})
