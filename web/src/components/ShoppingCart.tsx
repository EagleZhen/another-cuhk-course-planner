'use client'

import { useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff, Trash2, AlertTriangle } from 'lucide-react'
import { type CourseEnrollment, type CalendarEvent } from '@/lib/courseUtils'

interface ShoppingCartProps {
  courseEnrollments: CourseEnrollment[]
  calendarEvents: CalendarEvent[] // Calendar events for conflict detection
  selectedEnrollment?: string | null // Enrollment ID that was clicked/selected
  onToggleVisibility: (enrollmentId: string) => void
  onRemoveCourse: (enrollmentId: string) => void
  onClearSelection?: () => void
}

export default function ShoppingCart({ 
  courseEnrollments,
  calendarEvents,
  selectedEnrollment,
  onToggleVisibility, 
  onRemoveCourse,
  onClearSelection
}: ShoppingCartProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  
  // Auto-scroll to selected enrollment
  useEffect(() => {
    if (selectedEnrollment && scrollContainerRef.current) {
      const selectedElement = itemRefs.current.get(selectedEnrollment)
      if (selectedElement) {
        const container = scrollContainerRef.current
        const elementTop = selectedElement.offsetTop
        const elementHeight = selectedElement.offsetHeight
        const containerHeight = container.clientHeight
        const containerScrollTop = container.scrollTop
        
        // Calculate the ideal scroll position to center the element
        const idealScrollTop = elementTop - (containerHeight / 2) + (elementHeight / 2)
        
        // Only scroll if the element is not fully visible
        const elementBottom = elementTop + elementHeight
        const visibleTop = containerScrollTop
        const visibleBottom = containerScrollTop + containerHeight
        
        if (elementTop < visibleTop || elementBottom > visibleBottom) {
          container.scrollTo({
            top: idealScrollTop,
            behavior: 'smooth'
          })
        }
      }
    }
  }, [selectedEnrollment])

  const conflictCount = calendarEvents.filter(event => event.hasConflict).length

  return (
    <Card className="h-[800px] flex flex-col">
      <CardHeader className="pb-0 pt-1 flex-shrink-0">
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
      
      <CardContent className="flex-1 overflow-hidden px-3 py-0">
        {courseEnrollments.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-2xl mb-2">📚</div>
            <p className="text-sm">No courses enrolled</p>
            <p className="text-xs opacity-70">Add courses to get started</p>
          </div>
        ) : (
          <div 
            ref={scrollContainerRef}
            className="space-y-3 overflow-y-auto h-full pr-1 px-2 py-1"
          >
            {courseEnrollments.map((enrollment) => {
              // Find calendar events for this enrollment
              const enrollmentEvents = calendarEvents.filter(event => 
                event.subject === enrollment.course.subject && 
                event.courseCode === enrollment.course.course_code
              )
              const hasConflict = enrollmentEvents.some(event => event.hasConflict)
              const isVisible = enrollment.isVisible // Use enrollment visibility directly
              const isSelected = selectedEnrollment === enrollment.courseId
              
              return (
                <div
                  key={enrollment.courseId}
                  ref={(el) => {
                    if (el) {
                      itemRefs.current.set(enrollment.courseId, el)
                    } else {
                      itemRefs.current.delete(enrollment.courseId)
                    }
                  }}
                  className={`
                    border rounded p-2 transition-all duration-300 relative
                    ${hasConflict 
                      ? 'border-red-200 bg-red-50' 
                      : 'border-gray-200 bg-white'
                    }
                    ${!isVisible ? 'opacity-60' : ''}
                    ${isSelected 
                      ? 'ring-2 ring-blue-400 ring-opacity-75 shadow-lg scale-[1.02] bg-blue-50' 
                      : ''
                    }
                  `}
                  onClick={() => {
                    // Clear selection when clicking on selected shopping cart item
                    if (isSelected && onClearSelection) {
                      onClearSelection()
                    }
                  }}
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
                          onToggleVisibility(enrollment.courseId)
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
                          onRemoveCourse(enrollment.courseId)
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
                  <div className="space-y-2">
                    {enrollment.selectedSections.map((section) => (
                      <div key={section.id} className="bg-gray-50 rounded px-2 py-2">
                        {/* Section header */}
                        <div className="text-xs font-mono font-medium text-gray-800 mb-1">
                          {section.section}
                        </div>
                        
                        {/* All meetings for this section - consolidated by time+location+instructor */}
                        <div className="space-y-0.5">
                          {(() => {
                            // Group meetings by time + location + instructor
                            const meetingGroups = new Map()
                            section.meetings.forEach((meeting) => {
                              const key = `${meeting?.time || 'TBD'}-${meeting?.location || 'TBD'}-${meeting?.instructor || 'TBD'}`
                              if (!meetingGroups.has(key)) {
                                meetingGroups.set(key, [])
                              }
                              meetingGroups.get(key).push(meeting)
                            })
                            
                            return Array.from(meetingGroups.values()).map((meetings, groupIndex) => {
                              const firstMeeting = meetings[0]
                              
                              // Format time: "Tu 12:30PM - 2:15PM" → "Tu 12:30-14:15"
                              let formattedTime = firstMeeting?.time || 'TBD'
                              if (formattedTime !== 'TBD') {
                                formattedTime = formattedTime
                                  .replace(/(\d{1,2}):(\d{2})PM/g, (_match: string, h: string, m: string) => {
                                    const hour = parseInt(h) === 12 ? 12 : parseInt(h) + 12
                                    return `${hour}:${m}`
                                  })
                                  .replace(/(\d{1,2}):(\d{2})AM/g, (_match: string, h: string, m: string) => {
                                    const hour = parseInt(h) === 12 ? 0 : parseInt(h)
                                    return `${hour.toString().padStart(2, '0')}:${m}`
                                  })
                                  .replace(' - ', '-')
                              }
                              
                              // Format instructor: "Professor" → "Prof.", "Dr." stays "Dr."
                              let formattedInstructor = firstMeeting?.instructor || 'TBD'
                              if (formattedInstructor !== 'TBD') {
                                formattedInstructor = formattedInstructor.replace('Professor ', 'Prof. ')
                              }
                              
                              return (
                                <div key={groupIndex} className="flex items-center justify-between text-[11px] text-gray-600">
                                  <span className="font-medium font-mono">{formattedTime}</span>
                                  <span 
                                    className="text-gray-500 truncate ml-2 text-right max-w-[100px]"
                                    title={formattedInstructor} // Tooltip shows full name on hover
                                  >
                                    {formattedInstructor}
                                  </span>
                                </div>
                              )
                            })
                          })()}
                        </div>
                      </div>
                    ))}
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