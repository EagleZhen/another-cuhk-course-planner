'use client'

import { useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff, Trash2, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import { type CourseEnrollment, type CalendarEvent, type InternalCourse, type InternalSection, parseSectionTypes, getUniqueMeetings, formatTimeCompact, formatInstructorCompact, getCompatibleAlternatives, getSectionTypePriority, categorizeCompatibleSections } from '@/lib/courseUtils'

interface ShoppingCartProps {
  courseEnrollments: CourseEnrollment[]
  calendarEvents: CalendarEvent[] // Calendar events for conflict detection
  selectedEnrollment?: string | null // Enrollment ID that was clicked/selected
  currentTerm: string // Current term to get available sections
  onToggleVisibility: (enrollmentId: string) => void
  onRemoveCourse: (enrollmentId: string) => void
  onClearSelection?: () => void
  onSelectEnrollment?: (enrollmentId: string | null) => void
  onSectionChange?: (enrollmentId: string, sectionType: string, newSectionId: string) => void
}

export default function ShoppingCart({ 
  courseEnrollments,
  calendarEvents,
  selectedEnrollment,
  currentTerm,
  onToggleVisibility, 
  onRemoveCourse,
  onClearSelection,
  onSelectEnrollment,
  onSectionChange
}: ShoppingCartProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  
  // Helper function to get compatible alternative sections for cycling
  // This considers hierarchical compatibility constraints
  const getCompatibleAlternativeSections = (enrollment: CourseEnrollment, sectionType: string) => {
    const sectionTypes = parseSectionTypes(enrollment.course, currentTerm)
    const typeGroup = sectionTypes.find(group => group.type === sectionType)
    if (!typeGroup) return []
    
    // Get current selected section of this type
    const currentSection = enrollment.selectedSections.find(s => s.sectionType === sectionType)
    if (!currentSection) return typeGroup.sections // If none selected, all are available
    
    // Use the existing getCompatibleAlternatives function that considers hierarchical constraints
    return getCompatibleAlternatives(currentSection, enrollment, currentTerm)
  }
  
  // Helper function to check if a section type has any alternatives
  const hasAlternatives = (enrollment: CourseEnrollment, sectionType: string): boolean => {
    const alternatives = getCompatibleAlternativeSections(enrollment, sectionType)
    return alternatives.length > 0
  }
  
  // Helper function to cycle to next/previous section (all sections of same type)
  const cycleSection = (enrollment: CourseEnrollment, sectionType: string, direction: 'next' | 'prev') => {
    if (!onSectionChange) return
    
    const currentSection = enrollment.selectedSections.find(s => s.sectionType === sectionType)
    if (!currentSection) return
    
    // Get ALL sections of the same type for cycling
    const sectionTypes = parseSectionTypes(enrollment.course, currentTerm)
    const typeGroup = sectionTypes.find(group => group.type === sectionType)
    const allSameSections = typeGroup?.sections || []
    
    if (allSameSections.length <= 1) {
      console.log(`🔄 No alternatives for ${sectionType} in ${enrollment.course.subject}${enrollment.course.courseCode}`)
      return // No alternatives to cycle through
    }
    
    const currentIndex = allSameSections.findIndex(s => s.id === currentSection.id)
    if (currentIndex === -1) return
    
    let newIndex
    if (direction === 'next') {
      newIndex = (currentIndex + 1) % allSameSections.length
    } else {
      newIndex = currentIndex === 0 ? allSameSections.length - 1 : currentIndex - 1
    }
    
    const newSection = allSameSections[newIndex]
    console.log(`🔄 Cycling ${enrollment.course.subject}${enrollment.course.courseCode} ${sectionType}: ${currentSection.sectionCode} → ${newSection.sectionCode}`)
    console.log(`🔍 Available sections for ${sectionType}:`, allSameSections.map(s => s.sectionCode))
    onSectionChange(enrollment.courseId, sectionType, newSection.id)
  }
  
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
                event.courseCode === enrollment.course.courseCode
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
                    ${isSelected && isVisible
                      ? 'ring-2 ring-blue-400 ring-opacity-75 shadow-lg scale-[1.02] bg-blue-50' 
                      : ''
                    }
                    ${!isVisible ? 'cursor-default' : 'cursor-pointer'}
                  `}
                  onClick={() => {
                    // Only allow selection if the enrollment is visible
                    if (isVisible && onSelectEnrollment) {
                      const newSelection = isSelected ? null : enrollment.courseId
                      onSelectEnrollment(newSelection)
                    }
                  }}
                >
                  {/* Course Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-sm">
                          {enrollment.course.subject}{enrollment.course.courseCode}
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
                        onClick={(e) => {
                          e.stopPropagation()
                          // If making invisible and currently selected, deselect it
                          if (isVisible && isSelected && onSelectEnrollment) {
                            onSelectEnrollment(null)
                          }
                          // Toggle visibility for this enrollment
                          onToggleVisibility(enrollment.courseId)
                        }}
                        className="h-5 w-5 p-0 cursor-pointer"
                        title={isVisible ? 'Hide all sections' : 'Show all sections'}
                      >
                        {isVisible ? (
                          <Eye className="w-3 h-3 text-gray-600" />
                        ) : (
                          <EyeOff className="w-3 h-3 text-gray-400" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          // Remove this enrollment
                          onRemoveCourse(enrollment.courseId)
                        }}
                        className="h-5 w-5 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 cursor-pointer"
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
                    {enrollment.selectedSections.map((section) => {
                      // For cycling in shopping cart, we want ALL sections of the same type
                      const sectionTypes = parseSectionTypes(enrollment.course, currentTerm)
                      const typeGroup = sectionTypes.find(group => group.type === section.sectionType)
                      const allSameSections = typeGroup?.sections || [section]
                      
                      const canCycle = allSameSections.length > 1
                      const currentIndex = allSameSections.findIndex(s => s.id === section.id)
                      const sectionPosition = `${currentIndex + 1}/${allSameSections.length}` 
                      const isOrphan = !canCycle
                      
                      return (
                        <div key={section.id} className="bg-gray-50 rounded px-2 py-2">
                          {/* Section header with cycling buttons */}
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <div className="text-xs font-mono font-medium text-gray-800">
                                {section.sectionCode}
                              </div>
                              {isOrphan && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-gray-500 border-gray-300">
                                  only option
                                </Badge>
                              )}
                            </div>
                            
                            {/* Cycling controls */}
                            {canCycle && (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-gray-500 mr-1">
                                  {sectionPosition}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    cycleSection(enrollment, section.sectionType, 'prev')
                                  }}
                                  className="h-4 w-4 p-0 hover:bg-gray-200 cursor-pointer"
                                  title="Previous section"
                                >
                                  <ChevronLeft className="w-3 h-3 text-gray-600" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    cycleSection(enrollment, section.sectionType, 'next')
                                  }}
                                  className="h-4 w-4 p-0 hover:bg-gray-200 cursor-pointer"
                                  title="Next section"
                                >
                                  <ChevronRight className="w-3 h-3 text-gray-600" />
                                </Button>
                              </div>
                            )}
                          </div>
                        
                        {/* Unique meetings for this section - consolidated by time+location+instructor */}
                        <div className="space-y-1">
                          {getUniqueMeetings(section.meetings).map((meeting, index) => {
                            const formattedTime = formatTimeCompact(meeting?.time || 'TBD')
                            const formattedInstructor = formatInstructorCompact(meeting?.instructor || 'TBD')
                            const location = meeting?.location || 'TBD'
                            
                            return (
                              <div key={index} className="bg-white border border-gray-200 rounded px-2 py-1.5 shadow-sm">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-medium font-mono text-gray-900">{formattedTime}</span>
                                  <span 
                                    className="text-gray-600 truncate text-right max-w-[90px]"
                                    title={formattedInstructor}
                                  >
                                    {formattedInstructor}
                                  </span>
                                </div>
                                {location !== 'TBD' && (
                                  <div className="flex items-center gap-1 text-gray-500 text-[10px] mt-1">
                                    <span>📍</span>
                                    <span className="truncate" title={location}>{location}</span>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
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
            <span>
              {courseEnrollments.reduce((sum, enrollment) => 
                sum + enrollment.course.credits, 0
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