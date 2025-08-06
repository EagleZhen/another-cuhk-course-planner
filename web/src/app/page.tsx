'use client'

import { useState, useMemo } from 'react'
import CourseSearch from '@/components/CourseSearch'
import WeeklyCalendar from '@/components/WeeklyCalendar'
import ShoppingCart from '@/components/ShoppingCart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { detectConflicts, coursesToCalendarEvents, getSelectedSectionsForCourse, type Course, type ScrapedCourse, type CourseEnrollment } from '@/lib/courseUtils'

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
  
  // Sample shopping cart courses
  const initialCourses: Course[] = [
    {
      id: '1',
      subject: 'CSCI',
      courseCode: '3100',
      title: 'Software Engineering',
      section: '--LEC (8192)',
      time: 'Mo 14:30 - 15:15',
      location: 'Mong Man Wai Bldg 404',
      instructor: 'Prof. WONG',
      credits: '3.0',
      color: 'bg-blue-500',
      isVisible: true,
      hasConflict: false
    },
    {
      id: '4',
      subject: 'FINA',
      courseCode: '2020', 
      title: 'Corporate Finance',
      section: '--LEC (7845)',
      time: 'Tu 14:30 - 16:15',
      location: 'Lee Shau Kee Building 101',
      instructor: 'Prof. CHAN',
      credits: '3.0',
      color: 'bg-gray-500',
      isVisible: true,
      hasConflict: false
    },
    {
      id: '5',
      subject: 'PHYS',
      courseCode: '1001',
      title: 'General Physics I',
      section: '--LEC (9123)', 
      time: 'Tu 15:00 - 16:30',
      location: 'Science Centre LT1',
      instructor: 'Dr. LI',
      credits: '3.0',
      color: 'bg-pink-500',
      isVisible: false,
      hasConflict: false
    }
  ]

  const [courseEnrollments, setCourseEnrollments] = useState<CourseEnrollment[]>([])
  const [selectedSections, setSelectedSections] = useState<Map<string, string>>(new Map())
  const [selectedEnrollment, setSelectedEnrollment] = useState<string | null>(null)

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

  // Handle term change - clear shopping cart since courses may not be available in new term
  const handleTermChange = (newTerm: string) => {
    setCurrentTerm(newTerm)
    // Clear shopping cart when term changes since course availability may differ
    setCourseEnrollments([])
    setSelectedSections(new Map())
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
    
    // Assign consistent color for this enrollment (avoiding red - conflict zone color)
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-yellow-500', 'bg-indigo-500', 'bg-pink-500', 'bg-teal-500', 'bg-cyan-500', 'bg-emerald-500', 'bg-violet-500']
    const assignedColor = colors[courseEnrollments.length % colors.length]
    
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
