import { describe, it, expect } from 'vitest'
import { updateExistingEnrollment } from './courseUtils'
import type { CourseEnrollment, InternalCourse, InternalSection } from './types'

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
