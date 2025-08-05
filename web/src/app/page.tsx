'use client'

import { useState } from 'react'
import CourseSearch from '@/components/CourseSearch'
import WeeklyCalendar from '@/components/WeeklyCalendar'
import ShoppingCart from '@/components/ShoppingCart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function Home() {
  // Sample shopping cart courses
  const [selectedCourses, setSelectedCourses] = useState([
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
  ])

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

  // Debug calendar events
  console.log('Calendar events:', calendarEvents)

  const handleToggleVisibility = (courseId: string) => {
    setSelectedCourses(prev => prev.map(course => 
      course.id === courseId 
        ? { ...course, isVisible: !course.isVisible }
        : course
    ))
  }

  const handleRemoveCourse = (courseId: string) => {
    setSelectedCourses(prev => prev.filter(course => course.id !== courseId))
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
              <CourseSearch />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
