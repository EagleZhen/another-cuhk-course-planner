'use client'

import { useState, useMemo, useEffect } from 'react'
import CourseSearch from '@/components/CourseSearch'
import WeeklyCalendar from '@/components/WeeklyCalendar'
import ShoppingCart from '@/components/ShoppingCart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { detectConflicts, coursesToCalendarEvents, getSelectedSectionsForCourse, type Course, type ScrapedCourse, type CourseEnrollment } from '@/lib/courseUtils'

// Deterministic color assignment based on course code
function getDeterministicColor(courseCode: string): string {
  // Expanded color palette with 25 distinct colors for better distribution
  // Avoiding red tones (reserved for conflicts) and very light colors (poor contrast)
  const colors = [
    // Blues
    'bg-blue-500', 'bg-blue-600', 'bg-sky-500', 'bg-cyan-500', 'bg-cyan-600',
    // Greens  
    'bg-green-500', 'bg-green-600', 'bg-emerald-500', 'bg-teal-500', 'bg-teal-600',
    // Purples
    'bg-purple-500', 'bg-purple-600', 'bg-violet-500', 'bg-indigo-500', 'bg-indigo-600',
    // Warm colors
    'bg-yellow-500', 'bg-amber-500', 'bg-orange-500', 'bg-pink-500', 'bg-rose-500',
    // Earth tones
    'bg-stone-500', 'bg-gray-600', 'bg-slate-600', 'bg-zinc-600', 'bg-neutral-600'
  ]
  
  // Improved hash function with better distribution
  let hash = 0
  const prime = 31 // Use prime number for better distribution
  
  for (let i = 0; i < courseCode.length; i++) {
    const char = courseCode.charCodeAt(i)
    hash = (hash * prime + char) % 2147483647 // Use large prime modulus
  }
  
  // Additional mixing to reduce clustering
  hash = ((hash >>> 16) ^ hash) * 0x45d9f3b
  hash = ((hash >>> 16) ^ hash) * 0x45d9f3b
  hash = (hash >>> 16) ^ hash
  
  return colors[Math.abs(hash) % colors.length]
}

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
        // Restore Date objects
        const restoredSchedule = parsedSchedule.map((enrollment) => ({
          ...enrollment,
          enrollmentDate: new Date(enrollment.enrollmentDate)
        }))
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

  // Convert enrolled sections to calendar events - single source of truth
  const calendarEvents = useMemo(() => {
    const events: Course[] = []
    
    courseEnrollments.forEach(enrollment => {
      if (!enrollment.isVisible) return // Skip hidden enrollments entirely
      
      enrollment.selectedSections.forEach(section => {
        // Deduplicate meetings by time for each section
        const uniqueMeetings = new Map<string, { time: string; location?: string; instructor?: string }>()
        section.meetings.forEach(meeting => {
          if (meeting.time && meeting.time !== 'TBD') {
            uniqueMeetings.set(meeting.time, meeting)
          }
        })
        
        // Create one calendar event per unique meeting time
        Array.from(uniqueMeetings.values()).forEach((meeting, meetingIndex) => {
          const event: Course = {
            id: `${enrollment.courseId}_${section.id}_${meetingIndex}`,
            subject: enrollment.course.subject,
            courseCode: enrollment.course.course_code,
            title: enrollment.course.title,
            section: section.section,
            time: meeting.time,
            location: meeting.location || 'TBD',
            instructor: meeting.instructor || 'TBD',
            credits: enrollment.course.credits || '3.0',
            color: enrollment.color, // Consistent color per enrollment
            isVisible: true, // Always visible if enrollment is visible
            hasConflict: false, // Will be calculated by detectConflicts
            enrollmentId: enrollment.courseId // Add enrollment ID for toggle functionality
          }
          events.push(event)
        })
      })
    })
    
    // Convert to calendar events and detect conflicts
    return coursesToCalendarEvents(detectConflicts(events))
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
    
    // Auto-clear selection after 1.5 seconds
    if (enrollmentId) {
      setTimeout(() => {
        setSelectedEnrollment(null)
      }, 1000)
    }
  }

  const handleClearSelection = () => {
    setSelectedEnrollment(null)
  }

  const handleRemoveCourse = (enrollmentId: string) => {
    setCourseEnrollments(prev => 
      prev.filter(enrollment => enrollment.courseId !== enrollmentId)
    )
  }

  const handleAddCourse = (course: ScrapedCourse, sectionsMap: Map<string, string>) => {
    const courseKey = `${course.subject}${course.course_code}`
    
    // Check if course is already enrolled
    const isAlreadyEnrolled = courseEnrollments.some(enrollment => 
      enrollment.course.subject === course.subject && enrollment.course.course_code === course.course_code
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
    
    // Create new enrollment
    const newEnrollment: CourseEnrollment = {
      courseId: `${courseKey}_${Date.now()}`,
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
