'use client'

import { useState, useEffect, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface Course {
  subject: string
  course_code: string
  title: string
  credits: string
  terms: Array<{
    term_code: string
    term_name: string
    schedule: Array<{
      section: string
      meetings: Array<{
        time: string
        location: string
        instructor: string
        dates: string
      }>
      availability: {
        capacity: string
        enrolled: string
        status: string
        available_seats: string
      }
    }>
  }>
  description?: string
  enrollment_requirement?: string
}

interface CourseData {
  metadata: {
    subject: string
    total_courses: number
  }
  courses: Course[]
}

interface SelectedCourse {
  id: string
  subject: string
  courseCode: string
  title: string
  section: string
  time: string
  location: string
  instructor: string
  credits: string
  color: string
  isVisible: boolean
  hasConflict: boolean
}

interface CourseSearchProps {
  onAddCourse: (course: Course) => void
  selectedCourses: SelectedCourse[]
}

export default function CourseSearch({ onAddCourse, selectedCourses }: CourseSearchProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(false)
  const [allCourses, setAllCourses] = useState<Course[]>([])

  // Helper function to check if course is already added
  const isCourseAdded = (course: Course) => {
    return selectedCourses.some(selected => 
      selected.subject === course.subject && selected.courseCode === course.course_code
    )
  }

  // Load course data on component mount
  useEffect(() => {
    const loadCourseData = async () => {
      setLoading(true)
      try {
        const subjects = ['CSCI', 'AIST', 'PHYS', 'FINA']
        const allCoursesData: Course[] = []

        for (const subject of subjects) {
          try {
            const response = await fetch(`/data/${subject}_20250804_002506.json`)
            if (response.ok) {
              const data: CourseData = await response.json()
              allCoursesData.push(...data.courses)
            }
          } catch (error) {
            console.warn(`Failed to load ${subject} data:`, error)
          }
        }

        setAllCourses(allCoursesData)
      } catch (error) {
        console.error('Failed to load course data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadCourseData()
  }, [])

  // Real-time search with useMemo for performance
  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) {
      return allCourses.slice(0, 10) // Show first 10 by default
    }

    const searchLower = searchTerm.toLowerCase()
    const filtered = allCourses.filter(course => {
      // Create full course code without space for searching
      const fullCourseCode = `${course.subject}${course.course_code}`.toLowerCase()
      
      return (
        fullCourseCode.includes(searchLower) ||
        course.course_code.toLowerCase().includes(searchLower) ||
        course.title.toLowerCase().includes(searchLower) ||
        course.subject.toLowerCase().includes(searchLower) ||
        course.terms.some(term =>
          term.schedule.some(schedule =>
            schedule.meetings.some(meeting =>
              meeting.instructor.toLowerCase().includes(searchLower)
            )
          )
        )
      )
    })

    return filtered.slice(0, 20) // Limit to 20 results
  }, [searchTerm, allCourses])

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="w-full">
        <Input
          type="text"
          placeholder="Search courses (e.g., CSCI3100, Software Engineering, CHEONG Chi Hong)"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full"
        />
      </div>

      {/* Search Results */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-8 text-gray-500">
            Loading course data...
          </div>
        ) : searchResults.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {searchTerm ? 'No courses found' : 'No courses available'}
          </div>
        ) : (
          <>
            <div className="text-sm text-gray-600 mb-3">
              Showing {searchResults.length} course{searchResults.length !== 1 ? 's' : ''}
              {searchTerm && ` matching "${searchTerm}"`}
            </div>
            {searchResults.map((course, index) => (
              <CourseCard 
                key={`${course.subject}-${course.course_code}-${index}`} 
                course={course}
                onAddCourse={onAddCourse}
                isAdded={isCourseAdded(course)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function CourseCard({ course, onAddCourse, isAdded }: { 
  course: Course
  onAddCourse: (course: Course) => void
  isAdded: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  // Get unique instructors from all terms
  const instructors = Array.from(new Set(
    course.terms.flatMap(term =>
      term.schedule.flatMap(section =>
        section.meetings.map(meeting => meeting.instructor)
      )
    )
  )).filter(Boolean)

  // Get available terms
  const termNames = course.terms.map(term => term.term_name)

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">
              {course.subject}{course.course_code}
            </CardTitle>
            <CardDescription className="text-base font-medium text-gray-700 mt-1">
              {course.title}
            </CardDescription>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary">{course.credits} credits</Badge>
              {termNames.map(term => (
                <Badge key={term} variant="outline" className="text-xs">
                  {term}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-2">
            <Button
              variant={isAdded ? "secondary" : "default"}
              size="sm"
              onClick={() => onAddCourse(course)}
              disabled={isAdded}
              className="min-w-[80px]"
            >
              {isAdded ? "Added ✓" : "Add"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Hide' : 'Show'} Details
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <div className="space-y-4">
            {/* Description */}
            {course.description && (
              <div>
                <h4 className="font-semibold text-sm text-gray-700 mb-1">Description</h4>
                <p className="text-sm text-gray-600">{course.description}</p>
              </div>
            )}

            {/* Instructors */}
            {instructors.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm text-gray-700 mb-1">Instructors</h4>
                <div className="flex flex-wrap gap-1">
                  {instructors.map(instructor => (
                    <Badge key={instructor} variant="outline" className="text-xs">
                      {instructor}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Schedule Preview */}
            <div>
              <h4 className="font-semibold text-sm text-gray-700 mb-2">Schedule Preview</h4>
              {course.terms.slice(0, 1).map(term => (
                <div key={term.term_code} className="space-y-2">
                  <div className="text-sm font-medium text-blue-600">{term.term_name}</div>
                  {term.schedule.slice(0, 2).map((section, idx) => (
                    <div key={idx} className="text-sm bg-gray-50 p-2 rounded">
                      <div className="font-medium">{section.section}</div>
                      {section.meetings.slice(0, 1).map((meeting, midx) => (
                        <div key={midx} className="text-xs text-gray-600 mt-1">
                          {meeting.time} • {meeting.location}
                        </div>
                      ))}
                      <div className="text-xs mt-1">
                        <Badge
                          variant={section.availability.status === 'Open' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {section.availability.status} ({section.availability.available_seats} seats)
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {term.schedule.length > 2 && (
                    <div className="text-xs text-gray-500">
                      ... and {term.schedule.length - 2} more section{term.schedule.length - 2 !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Enrollment Requirements */}
            {course.enrollment_requirement && (
              <div>
                <h4 className="font-semibold text-sm text-gray-700 mb-1">Prerequisites</h4>
                <p className="text-sm text-gray-600">{course.enrollment_requirement}</p>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}