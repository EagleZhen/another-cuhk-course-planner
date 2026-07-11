import { describe, it, expect } from 'vitest'
import { updateExistingEnrollment, sortSectionsByPriority } from './courseUtils'
import type { CourseEnrollment, InternalCourse, InternalSection } from './types'

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
