'use client'

import { useState, useEffect, useCallback } from 'react'
import CourseSearch from '@/components/CourseSearch'
import WeeklyCalendar from '@/components/WeeklyCalendar'
import ShoppingCart from '@/components/ShoppingCart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// Helper function to calculate initial conflicts (outside component to avoid re-renders)
const calculateInitialConflicts = (courses: any[]) => {
  const visibleCourses = courses.filter(course => course.isVisible)
  
  return courses.map(course => {
    if (!course.isVisible) {
      return { ...course, hasConflict: false }
    }
    
    const parseTimeRange = (timeStr: string) => {
      const dayMatch = timeStr.match(/(Mo|Tu|We|Th|Fr)/)
      const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/)
      
      if (!dayMatch || !timeMatch) return null
      return {
        day: dayMatch[1],
        startHour: parseInt(timeMatch[1]),
        startMinute: parseInt(timeMatch[2]),
        endHour: parseInt(timeMatch[3]),
        endMinute: parseInt(timeMatch[4])
      }
    }

    const coursesOverlap = (course1: any, course2: any) => {
      if (!course1 || !course2 || course1.day !== course2.day) return false
      
      const start1 = course1.startHour * 60 + course1.startMinute
      const end1 = course1.endHour * 60 + course1.endMinute
      const start2 = course2.startHour * 60 + course2.startMinute
      const end2 = course2.endHour * 60 + course2.endMinute
      
      return start1 < end2 && start2 < end1
    }
    
    const hasConflict = visibleCourses.some(other => {
      if (other.id === course.id) return false
      
      const courseTime = parseTimeRange(course.time)
      const otherTime = parseTimeRange(other.time)
      
      return coursesOverlap(courseTime, otherTime)
    })
    
    return { ...course, hasConflict }
  })
}

export default function Home() {
  // Sample shopping cart courses with initial conflict calculation
  const initialCourses = [
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
      hasConflict: true
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
      hasConflict: true
    }
  ]

  const [selectedCourses, setSelectedCourses] = useState(() => calculateInitialConflicts(initialCourses))

  // Helper function to parse time from string like "Mo 14:30 - 15:15"
  const parseTime = (timeStr: string) => {
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/)
    if (timeMatch) {
      return {
        startHour: parseInt(timeMatch[1]),
        startMinute: parseInt(timeMatch[2]),
        endHour: parseInt(timeMatch[3]),
        endMinute: parseInt(timeMatch[4])
      }
    }
    return { startHour: 9, startMinute: 0, endHour: 10, endMinute: 0 }
  }

  const parseDay = (timeStr: string) => {
    if (timeStr.includes('Mo')) return 0
    if (timeStr.includes('Tu')) return 1  
    if (timeStr.includes('We')) return 2
    if (timeStr.includes('Th')) return 3
    if (timeStr.includes('Fr')) return 4
    return 0
  }


  // Helper function to detect conflicts between visible courses
  const detectConflicts = useCallback((courses: typeof selectedCourses) => {
    // Helper to parse time range - moved inside to avoid dependency issues
    const parseTimeRange = (timeStr: string) => {
      const dayMatch = timeStr.match(/(Mo|Tu|We|Th|Fr)/)
      const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/)
      
      if (!dayMatch || !timeMatch) return null
      return {
        day: dayMatch[1],
        startHour: parseInt(timeMatch[1]),
        startMinute: parseInt(timeMatch[2]),
        endHour: parseInt(timeMatch[3]),
        endMinute: parseInt(timeMatch[4])
      }
    }

    // Helper to check overlap - moved inside to avoid dependency issues
    const coursesOverlap = (course1: any, course2: any) => {
      if (!course1 || !course2 || course1.day !== course2.day) return false
      
      const start1 = course1.startHour * 60 + course1.startMinute
      const end1 = course1.endHour * 60 + course1.endMinute
      const start2 = course2.startHour * 60 + course2.startMinute
      const end2 = course2.endHour * 60 + course2.endMinute
      
      return start1 < end2 && start2 < end1
    }

    const visibleCourses = courses.filter(course => course.isVisible)
    
    return courses.map(course => {
      if (!course.isVisible) {
        // Hidden courses don't have conflicts
        return { ...course, hasConflict: false }
      }
      
      // Check if this visible course conflicts with other visible courses
      const hasConflict = visibleCourses.some(other => {
        if (other.id === course.id) return false // Don't compare with self
        
        // Parse time ranges for conflict detection
        const courseTime = parseTimeRange(course.time)
        const otherTime = parseTimeRange(other.time)
        
        // Check for day and time overlap
        return coursesOverlap(courseTime, otherTime)
      })
      
      return { ...course, hasConflict }
    })
  }, [])

  // Convert selected courses to calendar events (only visible ones)
  const calendarEvents = selectedCourses
    .filter(course => course.isVisible)
    .map(course => {
      const timeInfo = parseTime(course.time)
      return {
        id: course.id,
        courseCode: `${course.subject}${course.courseCode}`,
        section: course.section,
        title: course.title,
        time: course.time,
        location: course.location,
        instructor: course.instructor,
        day: parseDay(course.time),
        ...timeInfo,
        color: course.color
      }
    })

  // Remove useEffect - conflicts will be calculated when state changes

  const handleToggleVisibility = (courseId: string) => {
    setSelectedCourses(prev => {
      // Toggle visibility
      const updatedCourses = prev.map(course => 
        course.id === courseId 
          ? { ...course, isVisible: !course.isVisible }
          : course
      )
      
      // Recalculate conflicts based on new visibility states
      return detectConflicts(updatedCourses)
    })
  }

  const handleRemoveCourse = (courseId: string) => {
    setSelectedCourses(prev => {
      const filteredCourses = prev.filter(course => course.id !== courseId)
      // Recalculate conflicts after removing course
      return detectConflicts(filteredCourses)
    })
  }

  const handleAddCourse = (course: any) => {
    // Check if course is already added
    const isAlreadyAdded = selectedCourses.some(existing => 
      existing.subject === course.subject && existing.courseCode === course.course_code
    )
    
    if (isAlreadyAdded) {
      return // Course already added, do nothing
    }
    
    // Generate a unique ID and random color for the new course
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-red-500', 'bg-yellow-500', 'bg-indigo-500', 'bg-pink-500', 'bg-teal-500']
    const randomColor = colors[Math.floor(Math.random() * colors.length)]
    
    // Get the first available term and section for initial display
    const firstTerm = course.terms?.[0]
    const firstSection = firstTerm?.schedule?.[0]
    const firstMeeting = firstSection?.meetings?.[0]
    
    const newCourse = {
      id: `${course.subject}${course.course_code}_${Date.now()}`, // Unique ID
      subject: course.subject,
      courseCode: course.course_code,
      title: course.title,
      section: firstSection?.section || '--LEC',
      time: firstMeeting?.time || 'TBD',
      location: firstMeeting?.location || 'TBD',
      instructor: firstMeeting?.instructor || 'TBD',
      credits: course.credits || '3.0',
      color: randomColor,
      isVisible: true,
      hasConflict: false // Will be calculated later by conflict detection
    }
    
    setSelectedCourses(prev => {
      const updatedCourses = [...prev, newCourse]
      // Recalculate conflicts when adding new course
      return detectConflicts(updatedCourses)
    })
  }


  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            CUHK Course Planner
          </h1>
          <p className="text-lg text-gray-600">
            Plan your courses with up-to-date schedule information
          </p>
        </div>

        {/* Top Section - Calendar + Shopping Cart */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 max-w-7xl mx-auto mb-8">
          {/* Calendar (3/4 width - more space) */}
          <div className="lg:col-span-3">
            <div className="h-[650px]">
              <WeeklyCalendar events={calendarEvents} />
            </div>
          </div>

          {/* Shopping Cart (1/4 width - more compact) */}
          <div>
            <ShoppingCart 
              selectedCourses={selectedCourses}
              onToggleVisibility={handleToggleVisibility}
              onRemoveCourse={handleRemoveCourse}
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
                selectedCourses={selectedCourses}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
