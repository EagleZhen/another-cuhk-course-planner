import { describe, it, expect } from 'vitest'
import {
  filterCourses,
  filterCoursesExcept,
  availableValues,
  dayDimension,
  creditsDimension,
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
  credits: new Set(),
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

  it('filters by day, excluding wrong days and undated (TBA) meetings', () => {
    const dayCourse = (code: string, time: string) =>
      makeCourse({
        courseCode: code,
        terms: [
          {
            termCode: '2510',
            termName: TERM,
            sections: [makeSection({ meetings: [makeMeeting({ time })] })],
          },
        ],
      })
    const monday = dayCourse('1000', 'Mo 10:30AM - 12:15PM')
    const friday = dayCourse('2000', 'Fr 2:30PM - 4:15PM')
    const tba = dayCourse('3000', 'TBA') // getDayIndex -> -1, must not match any day
    // Mon=0, Fr=4
    const result = filterCourses([monday, friday, tba], { ...noFilters, days: new Set([0]) }, ctx)
    expect(result).toEqual([monday])
  })

  it('filters by credits when credit values are selected', () => {
    const three = makeCourse({ courseCode: '1000', credits: 3 })
    const one = makeCourse({ courseCode: '2000', credits: 1 })
    const result = filterCourses([three, one], { ...noFilters, credits: new Set([3]) }, ctx)
    expect(result).toEqual([three])
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

describe('filterCoursesExcept', () => {
  it('skips the excluded dimension but still applies the others', () => {
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
    // A Monday-only day filter would drop this course in filterCourses, but not when days are excluded.
    const criteria = { ...noFilters, subjects: new Set(['CSCI']), days: new Set([0]) }
    expect(filterCoursesExcept([friday], criteria, ctx, 'day')).toEqual([friday])
    expect(filterCourses([friday], criteria, ctx)).toEqual([])
  })
})

describe('availableValues (dayDimension)', () => {
  const dayCourse = (subject: string, time: string) =>
    makeCourse({
      subject,
      terms: [
        {
          termCode: '2510',
          termName: TERM,
          sections: [makeSection({ meetings: [makeMeeting({ time })] })],
        },
      ],
    })
  const mon = dayCourse('CSCI', 'Mo 10:30AM - 12:15PM')
  const fri = dayCourse('ENGG', 'Fr 2:30PM - 4:15PM')

  it('collects the distinct days present', () => {
    expect(availableValues(dayDimension, [mon, fri], noFilters, ctx).sort()).toEqual([0, 4])
  })

  it('reacts to the other active filters', () => {
    const criteria = { ...noFilters, subjects: new Set(['CSCI']) }
    expect(availableValues(dayDimension, [mon, fri], criteria, ctx)).toEqual([0])
  })

  it('keeps a selected value even when no course still has it', () => {
    // Only a Monday course exists, but Friday (4) is selected — it must stay visible.
    const selected = new Set([4])
    expect(availableValues(dayDimension, [mon], noFilters, ctx, selected).sort()).toEqual([0, 4])
  })
})

describe('availableValues (creditsDimension)', () => {
  it('collects the distinct credit values present, reacting to other filters', () => {
    const three = makeCourse({ subject: 'CSCI', courseCode: '1000', credits: 3 })
    const one = makeCourse({ subject: 'CSCI', courseCode: '2000', credits: 1 })
    const engg = makeCourse({ subject: 'ENGG', courseCode: '3000', credits: 6 })
    expect(availableValues(creditsDimension, [three, one, engg], noFilters, ctx).sort()).toEqual([
      1, 3, 6,
    ])
    const criteria = { ...noFilters, subjects: new Set(['CSCI']) }
    expect(availableValues(creditsDimension, [three, one, engg], criteria, ctx).sort()).toEqual([
      1, 3,
    ])
  })

  it('keeps a selected credit value even when no course still has it', () => {
    const three = makeCourse({ credits: 3 })
    const selected = new Set([1])
    expect(availableValues(creditsDimension, [three], noFilters, ctx, selected).sort()).toEqual([
      1, 3,
    ])
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
