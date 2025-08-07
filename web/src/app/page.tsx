'use client'

import { useState, useMemo, useEffect } from 'react'
import CourseSearch from '@/components/CourseSearch'
import WeeklyCalendar from '@/components/WeeklyCalendar'
import ShoppingCart from '@/components/ShoppingCart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { detectConflicts, enrollmentsToCalendarEvents, getSelectedSectionsForCourse, getDeterministicColor, type InternalCourse, type CourseEnrollment } from '@/lib/courseUtils'

// Color assignment is now handled in courseUtils.ts

export default function Home() {
  // Available terms
  const availableTerms = [
    "2025-26 Term 1",
    "2025-26 Term 2", 
    "2025-26 Term 3",
    "2025-26 Term 4",
    "2025-26 Summer Session"
  ]
  
  // Current term state
  const [currentTerm, setCurrentTerm] = useState("2025-26 Term 1")
  
  const [courseEnrollments, setCourseEnrollments] = useState<CourseEnrollment[]>([])
  const [selectedSections, setSelectedSections] = useState<Map<string, string>>(new Map())
  const [selectedEnrollment, setSelectedEnrollment] = useState<string | null>(null)

  // Auto-restore schedule from localStorage when term changes
  useEffect(() => {
    try {
      const savedSchedule = localStorage.getItem(`schedule_${currentTerm}`)
      if (savedSchedule) {
        const parsedSchedule: CourseEnrollment[] = JSON.parse(savedSchedule)
        // Restore Date objects and regenerate colors for consistency
        const restoredSchedule = parsedSchedule.map((enrollment) => {
          const courseKey = `${enrollment.course.subject}${enrollment.course.courseCode}`
          return {
            ...enrollment,
            enrollmentDate: new Date(enrollment.enrollmentDate),
            color: getDeterministicColor(courseKey) // Regenerate color to ensure consistency
          }
        })
        setCourseEnrollments(restoredSchedule)
      } else {
        // No saved schedule for this term, start fresh
        setCourseEnrollments([])
      }
      // Clear section selections when switching terms
      setSelectedSections(new Map())
    } catch (error) {
      console.error('Failed to restore schedule:', error)
      setCourseEnrollments([])
    }
  }, [currentTerm])

  // Auto-save schedule to localStorage whenever courseEnrollments changes
  useEffect(() => {
    try {
      if (courseEnrollments.length > 0) {
        localStorage.setItem(`schedule_${currentTerm}`, JSON.stringify(courseEnrollments))
      } else {
        // Remove empty schedule from localStorage to keep it clean
        localStorage.removeItem(`schedule_${currentTerm}`)
      }
    } catch (error) {
      console.error('Failed to save schedule:', error)
    }
  }, [courseEnrollments, currentTerm])

  // Convert enrollments to calendar events with conflict detection
  const calendarEvents = useMemo(() => {
    // Generate events from enrollments
    const events = enrollmentsToCalendarEvents(courseEnrollments)
    
    // Detect conflicts and return
    return detectConflicts(events)
  }, [courseEnrollments])

  // Handle term change - localStorage will handle schedule restoration
  const handleTermChange = (newTerm: string) => {
    setCurrentTerm(newTerm)
    // localStorage useEffect will automatically restore/clear schedule for new term
  }

  const handleToggleVisibility = (enrollmentId: string) => {
    setCourseEnrollments(prev => 
      prev.map(enrollment => 
        enrollment.courseId === enrollmentId 
          ? { ...enrollment, isVisible: !enrollment.isVisible }
          : enrollment
      )
    )
  }

  const handleSelectEnrollment = (enrollmentId: string | null) => {
    setSelectedEnrollment(enrollmentId)
    // No auto-clear timeout - selection persists for section cycling
  }

  const handleClearSelection = () => {
    setSelectedEnrollment(null)
  }

  const handleRemoveCourse = (enrollmentId: string) => {
    setCourseEnrollments(prev => 
      prev.filter(enrollment => enrollment.courseId !== enrollmentId)
    )
  }

  const handleAddCourse = (course: InternalCourse, sectionsMap: Map<string, string>) => {
    const courseKey = `${course.subject}${course.courseCode}`
    
    // Check if course is already enrolled
    const isAlreadyEnrolled = courseEnrollments.some(enrollment => 
      enrollment.course.subject === course.subject && enrollment.course.courseCode === course.courseCode
    )
    
    if (isAlreadyEnrolled) {
      return // Course already enrolled, do nothing
    }
    
    // Get selected sections for this course
    const selectedSectionsForCourse = getSelectedSectionsForCourse(course, currentTerm, sectionsMap)
    
    if (selectedSectionsForCourse.length === 0) {
      return // No valid sections selected
    }
    
    // Assign deterministic color based on course code
    const assignedColor = getDeterministicColor(courseKey)
    
    // Create new enrollment - using deterministic ID for server/client consistency
    const newEnrollment: CourseEnrollment = {
      courseId: courseKey, // Remove timestamp to ensure server/client match
      course,
      selectedSections: selectedSectionsForCourse,
      enrollmentDate: new Date(),
      color: assignedColor,
      isVisible: true // Default to visible
    }
    
    // Add to enrollments
    setCourseEnrollments(prev => [...prev, newEnrollment])
    
    // Clear section selections for this course after adding
    const newSectionsMap = new Map(sectionsMap)
    Array.from(sectionsMap.keys()).forEach(key => {
      if (key.startsWith(`${courseKey}_`)) {
        newSectionsMap.delete(key)
      }
    })
    setSelectedSections(newSectionsMap)
  }


  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-4">

        {/* Top Section - Calendar + Shopping Cart */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 max-w-7xl mx-auto mb-4">
          {/* Calendar (3/4 width - more space) */}
          <div className="lg:col-span-3">
            <div className="h-[800px]">
              <WeeklyCalendar 
                events={calendarEvents} 
                selectedTerm={currentTerm}
                availableTerms={availableTerms}
                selectedEnrollment={selectedEnrollment}
                onTermChange={handleTermChange}
                onToggleVisibility={handleToggleVisibility}
                onSelectEnrollment={handleSelectEnrollment}
              />
            </div>
          </div>

          {/* Shopping Cart (1/4 width - more compact) */}
          <div>
            <ShoppingCart 
              courseEnrollments={courseEnrollments}
              calendarEvents={calendarEvents}
              selectedEnrollment={selectedEnrollment}
              onToggleVisibility={handleToggleVisibility}
              onRemoveCourse={handleRemoveCourse}
              onClearSelection={handleClearSelection}
            />
          </div>
        </div>

        {/* Bottom Section - Course Search (Full Width) */}
        <div className="max-w-7xl mx-auto">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Search & Add Courses</CardTitle>
                  <CardDescription>
                    Search by course code, title, or instructor name. Click to add courses to your schedule.
                  </CardDescription>
                </div>
                
                {/* Available Subjects - Compact */}
                <div className="flex gap-2 flex-wrap">
                  {['CSCI', 'AIST', 'PHYS', 'FINA'].map((subject) => (
                    <div
                      key={subject}
                      className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium"
                    >
                      {subject}
                    </div>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <CourseSearch 
                onAddCourse={handleAddCourse}
                courseEnrollments={courseEnrollments}
                currentTerm={currentTerm}
                selectedSections={selectedSections}
                onSelectedSectionsChange={setSelectedSections}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
