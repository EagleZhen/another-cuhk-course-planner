'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff, Trash2, AlertTriangle } from 'lucide-react'
import { type CourseEnrollment } from '@/lib/courseUtils'

interface ShoppingCartProps {
  courseEnrollments: CourseEnrollment[]
  calendarEvents: any[] // Calendar events for conflict detection
  onToggleVisibility: (enrollmentId: string) => void
  onRemoveCourse: (enrollmentId: string) => void
}

export default function ShoppingCart({ 
  courseEnrollments,
  calendarEvents,
  onToggleVisibility, 
  onRemoveCourse
}: ShoppingCartProps) {
  const visibleEvents = calendarEvents.filter(event => event.isVisible)
  const conflictCount = calendarEvents.filter(event => event.hasConflict).length

  const handleToggleVisibility = (courseId: string) => {
    onToggleVisibility(courseId)
  }

  const handleRemoveCourse = (courseId: string) => {
    onRemoveCourse(courseId)
  }

  return (
    <Card className="h-[650px] flex flex-col">
      <CardHeader className="pb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">My Schedule</CardTitle>
          <div className="flex items-center gap-2">
            {conflictCount > 0 && (
              <AlertTriangle className="w-3 h-3 text-red-500" />
            )}
            <Badge variant="secondary" className="text-xs">
              {courseEnrollments.length}
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 overflow-hidden p-3">
        {courseEnrollments.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-2xl mb-2">📚</div>
            <p className="text-sm">No courses enrolled</p>
            <p className="text-xs opacity-70">Add courses to get started</p>
          </div>
        ) : (
          <div className="space-y-3 overflow-y-auto h-full pr-1">
            {courseEnrollments.map((enrollment) => {
              // Find calendar events for this enrollment
              const enrollmentEvents = calendarEvents.filter(event => 
                event.subject === enrollment.course.subject && 
                event.courseCode === enrollment.course.course_code
              )
              const hasConflict = enrollmentEvents.some(event => event.hasConflict)
              const isVisible = enrollment.isVisible // Use enrollment visibility directly
              
              return (
                <div
                  key={enrollment.courseId}
                  className={`
                    border rounded p-3 transition-all
                    ${hasConflict 
                      ? 'border-red-200 bg-red-50' 
                      : 'border-gray-200 bg-white'
                    }
                    ${!isVisible ? 'opacity-60' : ''}
                  `}
                >
                  {/* Course Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-sm">
                          {enrollment.course.subject}{enrollment.course.course_code}
                        </span>
                      </div>
                      {/* Always reserve space for conflict indicator */}
                      <div className="w-3 h-3 flex-shrink-0">
                        {hasConflict && (
                          <AlertTriangle className="w-3 h-3 text-red-500" />
                        )}
                      </div>
                      <span className="text-xs text-gray-500 font-medium">
                        {enrollment.course.credits || '3.0'} credits
                      </span>
                    </div>
                    
                    {/* Quick Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          // Toggle visibility for this enrollment
                          handleToggleVisibility(enrollment.courseId)
                        }}
                        className="h-5 w-5 p-0"
                        title={isVisible ? 'Hide all sections' : 'Show all sections'}
                      >
                        {isVisible ? (
                          <Eye className="w-3 h-3" />
                        ) : (
                          <EyeOff className="w-3 h-3" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          // Remove this enrollment
                          handleRemoveCourse(enrollment.courseId)
                        }}
                        className="h-5 w-5 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        title="Remove course"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Course Title */}
                  <p className="text-xs text-gray-600 mb-2">
                    {enrollment.course.title}
                  </p>

                  {/* Selected Sections */}
                  <div className="space-y-1">
                    {enrollment.selectedSections.map((section, index) => {
                      const meeting = section.meetings[0]
                      return (
                        <div key={section.id} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium">{section.section}</span>
                            <span className="text-gray-600">{meeting?.time || 'TBD'}</span>
                          </div>
                          <span className="text-gray-500">{meeting?.instructor || 'TBD'}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
      
      {/* Schedule Summary - Outside scrollable area */}
      {courseEnrollments.length > 0 && (
        <div className="border-t px-3 py-2 flex-shrink-0">
          <div className="flex justify-between text-xs text-gray-600">
            <span>{visibleEvents.length}/{calendarEvents.length} sections</span>
            <span>
              {courseEnrollments.reduce((sum, enrollment) => 
                sum + parseFloat(enrollment.course.credits || '0'), 0
              ).toFixed(1)} credits
            </span>
            {conflictCount > 0 && (
              <span className="text-red-500">{conflictCount} conflicts</span>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}