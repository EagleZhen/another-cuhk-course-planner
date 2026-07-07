import { describe, it, expect } from 'vitest'
import { transformExternalCourseData } from './validation'

describe('transformExternalCourseData', () => {
  it('accepts published course data with stripped fields absent', () => {
    // Publish removes fields the app never renders (STRIPPED_COURSE_FIELDS in
    // scripts/publish_course_data.py): course_syllabus, required_readings,
    // recommended_readings, feedback_evaluation. Published files must keep
    // passing validation without them.
    const publishedFile = {
      metadata: {
        subject: 'CSCI',
        total_courses: 1,
      },
      courses: [
        {
          subject: 'CSCI',
          course_code: '3100',
          title: 'Software Engineering',
          credits: '3.00',
          description: 'Software development methodologies.',
          enrollment_requirement: '',
          course_attributes: '',
          grading_basis: 'Graded',
          learning_outcomes: 'Design and build software systems.',
          assessment_types: { 'Final Exam': '50', Project: '50' },
          terms: [
            {
              term_code: '2380',
              term_name: '2025-26 Term 1',
              schedule: [
                {
                  section: '--LEC (1234)',
                  meetings: [
                    {
                      time: 'Mo 10:30 - 12:15',
                      location: 'Lady Shaw Bldg LT1',
                      instructor: 'Professor Chan',
                      dates: '1/9 - 1/12',
                    },
                  ],
                  availability: {
                    capacity: '100',
                    enrolled: '80',
                    status: 'Open',
                    available_seats: '20',
                    waitlist_capacity: '10',
                    waitlist_total: '0',
                  },
                  class_attributes: 'Taught in English',
                },
              ],
            },
          ],
        },
      ],
    }

    const result = transformExternalCourseData(publishedFile)

    expect(result.courses).toHaveLength(1)
    const course = result.courses[0]

    // Rendered fields survive the transform
    expect(course.title).toBe('Software Engineering')
    expect(course.learningOutcomes).toBe('Design and build software systems.')
    expect(course.assessmentTypes).toEqual({ 'Final Exam': '50', Project: '50' })
    expect(course.terms).toHaveLength(1)
    expect(course.terms[0].sections).toHaveLength(1)

    // Stripped fields come through as undefined, not as errors
    expect(course.courseSyllabus).toBeUndefined()
    expect(course.requiredReadings).toBeUndefined()
    expect(course.recommendedReadings).toBeUndefined()
    expect(course.feedbackEvaluation).toBeUndefined()
  })
})
