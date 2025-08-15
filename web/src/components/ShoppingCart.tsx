'use client'

import { useRef, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff, Trash2, AlertTriangle, ChevronLeft, ChevronRight, Search, MapPin } from 'lucide-react'
import { type CourseEnrollment, type CalendarEvent, type SectionType, parseSectionTypes, getUniqueMeetings, formatTimeCompact, formatInstructorCompact, getSectionTypePriority, categorizeCompatibleSections, getAvailabilityBadges, getComputedBorderColor, googleSearchAndOpen, googleMapsSearchAndOpen } from '@/lib/courseUtils'

interface ShoppingCartProps {
  courseEnrollments: CourseEnrollment[]
  calendarEvents: CalendarEvent[] // Calendar events for conflict detection
  selectedEnrollment?: string | null // Enrollment ID that was clicked/selected
  currentTerm: string // Current term to get available sections
  lastDataUpdate?: Date | null // When course data was last refreshed
  onToggleVisibility: (enrollmentId: string) => void
  onRemoveCourse: (enrollmentId: string) => void
  onSelectEnrollment?: (enrollmentId: string | null) => void
  onSectionChange?: (enrollmentId: string, sectionType: string, newSectionId: string) => void
}

export default function ShoppingCart({ 
  courseEnrollments,
  calendarEvents,
  selectedEnrollment,
  currentTerm,
  lastDataUpdate,
  onToggleVisibility, 
  onRemoveCourse,
  onSelectEnrollment,
  onSectionChange
}: ShoppingCartProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [, forceUpdate] = useState({}) // For timestamp updates
  
  // Update timestamp display every 30 seconds
  useEffect(() => {
    if (!lastDataUpdate) return
    
    const interval = setInterval(() => {
      forceUpdate({}) // Trigger re-render to update relative time
    }, 30000) // Update every 30 seconds
    
    return () => clearInterval(interval)
  }, [lastDataUpdate])
  
  // Note: Removed unused helper functions - cycling now uses direct compatibility checking
  
  // Helper function to cycle to next/previous section (compatible sections only - hierarchical priority)
  const cycleSection = (enrollment: CourseEnrollment, sectionType: string, direction: 'next' | 'prev') => {
    if (!onSectionChange) return
    
    const currentSection = enrollment.selectedSections.find(s => s.sectionType === sectionType)
    if (!currentSection) return
    
    // Get compatible sections considering ONLY HIGHER priority constraints (hierarchical)
    const sectionTypes = parseSectionTypes(enrollment.course, currentTerm)
    const typeGroup = sectionTypes.find(group => group.type === sectionType)
    if (!typeGroup) return
    
    // Only constrain by HIGHER priority sections (lower priority numbers)
    const currentPriority = getSectionTypePriority(sectionType as SectionType, sectionTypes)
    const higherPrioritySelections = enrollment.selectedSections.filter(s => {
      const sPriority = getSectionTypePriority(s.sectionType, sectionTypes)
      return sPriority < currentPriority // Higher priority (lower number)
    })
    
    const { compatible } = categorizeCompatibleSections(typeGroup.sections, higherPrioritySelections)
    
    if (compatible.length <= 1) {
      console.log(`🔄 No compatible alternatives for ${sectionType} in ${enrollment.course.subject}${enrollment.course.courseCode}`)
      return // No alternatives to cycle through
    }
    
    const currentIndex = compatible.findIndex(s => s.id === currentSection.id)
    if (currentIndex === -1) return
    
    let newIndex
    if (direction === 'next') {
      newIndex = (currentIndex + 1) % compatible.length
    } else {
      newIndex = currentIndex === 0 ? compatible.length - 1 : currentIndex - 1
    }
    
    const newSection = compatible[newIndex]
    console.log(`🔄 Cycling ${enrollment.course.subject}${enrollment.course.courseCode} ${sectionType}: ${currentSection.sectionCode} → ${newSection.sectionCode}`)
    console.log(`🔍 Compatible sections for ${sectionType} (constrained by higher priority only):`, compatible.map(s => s.sectionCode))
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

  // Helper function to calculate visible/total counts for different statuses
  const getStatusCounts = () => {
    const validEnrollments = courseEnrollments.filter(enrollment => !enrollment.isInvalid)
    const visibleValidEnrollments = validEnrollments.filter(enrollment => enrollment.isVisible)
    
    return {
      // Credit counts
      visibleCredits: visibleValidEnrollments.reduce((sum, enrollment) => sum + enrollment.course.credits, 0),
      totalCredits: validEnrollments.reduce((sum, enrollment) => sum + enrollment.course.credits, 0),
      
      // Status counts
      open: {
        visible: visibleValidEnrollments.filter(enrollment => 
          enrollment.selectedSections.every(section => section.availability.status === 'Open')
        ).length,
        total: validEnrollments.filter(enrollment => 
          enrollment.selectedSections.every(section => section.availability.status === 'Open')
        ).length
      },
      waitlisted: {
        visible: visibleValidEnrollments.filter(enrollment => 
          enrollment.selectedSections.some(section => section.availability.status === 'Waitlisted')
        ).length,
        total: validEnrollments.filter(enrollment => 
          enrollment.selectedSections.some(section => section.availability.status === 'Waitlisted')
        ).length
      },
      closed: {
        visible: visibleValidEnrollments.filter(enrollment => 
          enrollment.selectedSections.some(section => section.availability.status === 'Closed')
        ).length,
        total: validEnrollments.filter(enrollment => 
          enrollment.selectedSections.some(section => section.availability.status === 'Closed')
        ).length
      },
      conflicts: {
        visible: calendarEvents.filter(event => event.hasConflict && event.isVisible).length,
        total: conflictCount
      },
      invalid: {
        visible: courseEnrollments.filter(enrollment => enrollment.isInvalid && enrollment.isVisible).length,
        total: courseEnrollments.filter(enrollment => enrollment.isInvalid).length
      }
    }
  }

  const statusCounts = getStatusCounts()

  return (
    <Card className="h-[800px] flex flex-col gap-2" data-shopping-cart>
      <CardHeader className="pb-0 pt-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Shopping Cart</CardTitle>
          <Badge variant="outline" className="text-xs">
            {(() => {
              const visibleCount = courseEnrollments.filter(enrollment => enrollment.isVisible).length
              const totalCount = courseEnrollments.length
              
              // Show simple count when all are visible (like credits logic)
              if (visibleCount === totalCount) {
                return `${totalCount} ${totalCount === 1 ? 'course' : 'courses'}`
              }
              
              // Show visible/total when some are hidden
              return `${visibleCount}/${totalCount} ${totalCount === 1 ? 'course' : 'courses'}`
            })()}
          </Badge>
        </div>
        {/* Data freshness indicator - shows actual scraping time */}
        <div className="text-[10px] text-gray-400 flex items-center gap-1 mt-1">
          <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
          {lastDataUpdate ? (
            <span>Last Data Refresh: {lastDataUpdate.toLocaleDateString()} {lastDataUpdate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
          ) : (
            <span>Loading Data...</span>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 overflow-hidden px-3">
        {courseEnrollments.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-2xl mb-2">📚</div>
            <p className="text-sm">No courses enrolled</p>
            <p className="text-xs opacity-70">Add courses to get started</p>
          </div>
        ) : (
          <div 
            ref={scrollContainerRef}
            className="space-y-3 overflow-y-auto h-full p-1 pr-2 py-2"
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
              const isInvalid = enrollment.isInvalid // Check if enrollment has invalid data
              
              
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
                    border-l-4 border-gray-200
                    ${isInvalid 
                      ? 'bg-orange-50 opacity-75' 
                      : 'bg-white'
                    }
                    ${isSelected && isVisible && !isInvalid
                      ? `ring-1 shadow-lg scale-[1.02]` 
                      : ''
                    }
                    ${!isVisible || isInvalid ? 'cursor-not-allowed' : 'cursor-pointer'}
                  `}
                  style={{
                    ...(isInvalid ? {
                      borderLeftColor: '#fb923c' // orange-400 for invalid courses
                    } : enrollment.color ? {
                      borderLeftColor: getComputedBorderColor(enrollment.color) // course color for normal/conflict courses
                    } : {}),
                    // Ring color matches the left border color when selected
                    ...(isSelected && isVisible && !isInvalid && enrollment.color ? {
                      '--tw-ring-color': getComputedBorderColor(enrollment.color)
                    } : {})
                  }}
                  title={
                    !isVisible && !isInvalid 
                      ? 'Course is hidden from calendar. Click the eye icon to show it and enable selection.'
                      : isInvalid
                        ? enrollment.invalidReason || 'Course data is outdated'
                        : undefined
                  }
                  onClick={() => {
                    // Only allow selection if the enrollment is visible and not invalid
                    if (isVisible && !isInvalid && onSelectEnrollment) {
                      const newSelection = isSelected ? null : enrollment.courseId
                      onSelectEnrollment(newSelection)
                    }
                  }}
                >
                  {/* Course Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className={`flex items-center gap-2 flex-1 min-w-0 ${!isVisible && !isInvalid ? 'opacity-50' : ''}`}>
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-sm">
                          {enrollment.course.subject}{enrollment.course.courseCode}
                        </span>
                      </div>
                      {/* Status indicators only for critical issues not shown in badges */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {isInvalid && (
                          <div title={enrollment.invalidReason || 'Course data is outdated'}>
                            <AlertTriangle className="w-3 h-3 text-orange-500" />
                          </div>
                        )}
                        {hasConflict && !isInvalid && (
                          <div title="Time conflict detected">
                            <AlertTriangle className="w-3 h-3 text-purple-500" />
                          </div>
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
                        title={isVisible ? 'Hide all sections on the calendar' : 'Show all sections on the calendar'}
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
                  <p className={`text-xs text-gray-600 mb-2 ${!isVisible && !isInvalid ? 'opacity-50' : ''}`}>
                    {enrollment.course.title}
                  </p>

                  {/* Selected Sections - Compact Display or Invalid Message */}
                  {isInvalid ? (
                    /* Show simplified invalid state */
                    <div className="bg-orange-50 border border-orange-200 rounded px-3 py-2">
                      <div className="flex items-center gap-2 text-xs text-orange-600">
                        <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0" />
                        <span>{enrollment.invalidReason}</span>
                      </div>
                      {enrollment.lastSynced && (
                        <div className="text-xs text-gray-500 mt-2">
                          Last synced:
                        </div>
                      )}
                      {enrollment.lastSynced && (
                        <div className="text-xs text-gray-500">
                          {enrollment.lastSynced.toLocaleString()}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Show normal section details */
                    <div className={`space-y-2 ${!isVisible && !isInvalid ? 'opacity-50' : ''}`}>
                      {enrollment.selectedSections.map((section) => {
                      // Get compatible alternatives considering ONLY HIGHER priority constraints (hierarchical)
                      const sectionTypes = parseSectionTypes(enrollment.course, currentTerm)
                      const typeGroup = sectionTypes.find(group => group.type === section.sectionType)
                      if (!typeGroup) return null
                      
                      // Only constrain by HIGHER priority sections (lower priority numbers)
                      const higherPrioritySelections = enrollment.selectedSections.filter(s => {
                        const sPriority = getSectionTypePriority(s.sectionType, sectionTypes)
                        const currentPriority = getSectionTypePriority(section.sectionType, sectionTypes)
                        return sPriority < currentPriority // Higher priority (lower number)
                      })
                      
                      const { compatible } = categorizeCompatibleSections(typeGroup.sections, higherPrioritySelections)
                      
                      const canCycle = compatible.length > 1
                      const currentIndex = compatible.findIndex(s => s.id === section.id)
                      const sectionPosition = `${currentIndex + 1}/${compatible.length}`
                      
                      return (
                        <div key={section.id} className="bg-gray-50 rounded px-2 py-2 border">
                          {/* Section header with cycling buttons */}
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <div className="text-xs font-mono font-medium text-gray-800">
                                {section.sectionCode}
                              </div>
                            </div>
                            
                            {/* Cycling controls or "only option" badge */}
                            {canCycle ? (
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
                            ) : (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-gray-500 border-gray-300">
                                only option
                              </Badge>
                            )}
                          </div>
                        
                        {/* Row 2: Enrollment Badges */}
                        <div className="flex items-center gap-1 mb-2">
                          {getAvailabilityBadges(section.availability).map((badge) => (
                            <Badge
                              key={badge.type}
                              className={`text-[9px] flex-shrink-0 px-1 py-0 ${badge.style.className}`}
                              title={
                                badge.type === 'status' 
                                  ? `Course status: ${badge.text}`
                                  : badge.type === 'availability' 
                                    ? `${section.availability.availableSeats} seats available out of ${section.availability.capacity}`
                                    : `${section.availability.waitlistTotal} people waiting (capacity: ${section.availability.waitlistCapacity})`
                              }
                            >
                              {badge.text}
                            </Badge>
                          ))}
                        </div>
                        
                        {/* Row 3: Teaching Language */}
                        {section.classAttributes && (
                          <div className="flex items-center gap-1 text-gray-500 text-[9px] mb-2">
                            <span className="flex-shrink-0">🌐</span>
                            <span className="truncate" title={`Language of instruction: ${section.classAttributes}`}>
                              {section.classAttributes}
                            </span>
                          </div>
                        )}
                        
                        {/* Unique meetings for this section - consolidated by time+location+instructor */}
                        <div className="space-y-1">
                          {getUniqueMeetings(section.meetings).map((meeting, index) => {
                            const formattedTime = formatTimeCompact(meeting?.time || 'TBA')
                            const formattedInstructor = formatInstructorCompact(meeting?.instructor || 'TBA')
                            const location = meeting?.location || 'TBA'
                            
                            return (
                              <div key={index} className="bg-white border border-gray-200 rounded px-2 py-1.5 shadow-sm">
                                {/* Row 1: Time */}
                                <div className="flex items-center gap-1 text-[11px]">
                                  <span>⏰</span>
                                  <span className="font-mono text-gray-600">{formattedTime}</span>
                                </div>
                                {/* Row 2: Instructor */}
                                <div className="flex items-center gap-1 text-gray-600 text-[11px] mt-1">
                                  <span>👨‍🏫</span>
                                  <div className="flex items-center gap-1 min-w-0 flex-1">
                                    <span className="truncate" title={formattedInstructor}>
                                      {formattedInstructor}
                                    </span>
                                    {formattedInstructor !== 'Staff' && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          googleSearchAndOpen(`CUHK ${formattedInstructor}`)
                                        }}
                                        className="flex-shrink-0 p-0.5 hover:bg-gray-100 rounded cursor-pointer transition-colors duration-200"
                                        title={`Search Google for "CUHK ${formattedInstructor}"`}
                                      >
                                        <Search className="w-2.5 h-2.5 text-gray-400 hover:text-gray-600" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {/* Row 3: Location */}
                                <div className="flex items-center gap-1 text-gray-600 text-[11px] mt-1">
                                  <span>📍</span>
                                  <div className="flex items-center gap-1 min-w-0 flex-1">
                                    <span className="truncate" title={location}>
                                      {location}
                                    </span>
                                    {location !== 'TBA' && location !== 'No Room Required' && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          googleMapsSearchAndOpen(location)
                                        }}
                                        className="flex-shrink-0 p-0.5 hover:bg-gray-100 rounded cursor-pointer transition-colors duration-200"
                                        title={`View "${location}" on Google Maps`}
                                      >
                                        <MapPin className="w-2.5 h-2.5 text-gray-400 hover:text-gray-600" />
                                      </button>
                                    )}
                                  </div>
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
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
      
      {/* Schedule Summary - Outside scrollable area */}
      {courseEnrollments.length > 0 && (
        <div className="border-t px-3 py-2 flex-shrink-0 space-y-1">
          {/* Row 1: Credits + Conflicts (optional) */}
          <div className="flex justify-between text-xs text-gray-600">
            <span>
              {statusCounts.visibleCredits === statusCounts.totalCredits 
                ? `${statusCounts.totalCredits.toFixed(1)} credits`
                : `${statusCounts.visibleCredits.toFixed(1)} / ${statusCounts.totalCredits.toFixed(1)} credits`
              }
            </span>
            {statusCounts.conflicts.total > 0 && (
              <div className="flex items-center gap-1 text-purple-500">
                <AlertTriangle className="w-3 h-3" />
                <span>
                  {statusCounts.conflicts.visible === statusCounts.conflicts.total
                    ? 'Conflicts'
                    : `${statusCounts.conflicts.visible}/${statusCounts.conflicts.total} Conflicts`
                  }
                </span>
              </div>
            )}
          </div>
          
          {/* Row 2: Open, Waitlisted, Closed (all optional) */}
          {(() => {
            // Only show row 2 if there's any status info to display
            const hasStatusInfo = statusCounts.open.total > 0 || statusCounts.waitlisted.total > 0 || statusCounts.closed.total > 0 || statusCounts.invalid.total > 0
            
            return hasStatusInfo && (
              <div className="flex items-center justify-between text-xs">
                {statusCounts.open.total > 0 && (
                  <div className="flex items-center gap-1 text-green-600">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    <span>
                      {statusCounts.open.visible === statusCounts.open.total
                        ? `${statusCounts.open.total} Open`
                        : `${statusCounts.open.visible}/${statusCounts.open.total} Open`
                      }
                    </span>
                  </div>
                )}
                {statusCounts.waitlisted.total > 0 && (
                  <div className="flex items-center gap-1 text-yellow-500">
                    <AlertTriangle className="w-3 h-3" />
                    <span>
                      {statusCounts.waitlisted.visible === statusCounts.waitlisted.total
                        ? `${statusCounts.waitlisted.total} Waitlisted`
                        : `${statusCounts.waitlisted.visible}/${statusCounts.waitlisted.total} Waitlisted`
                      }
                    </span>
                  </div>
                )}
                {statusCounts.closed.total > 0 && (
                  <div className="flex items-center gap-1 text-red-500">
                    <AlertTriangle className="w-3 h-3" />
                    <span>
                      {statusCounts.closed.visible === statusCounts.closed.total
                        ? `${statusCounts.closed.total} Closed`
                        : `${statusCounts.closed.visible}/${statusCounts.closed.total} Closed`
                      }
                    </span>
                  </div>
                )}
                {statusCounts.invalid.total > 0 && (
                  <div className="flex items-center gap-1 text-orange-500">
                    <AlertTriangle className="w-3 h-3" />
                    <span>
                      {statusCounts.invalid.visible === statusCounts.invalid.total
                        ? `${statusCounts.invalid.total} Invalid`
                        : `${statusCounts.invalid.visible}/${statusCounts.invalid.total} Invalid`
                      }
                    </span>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}
    </Card>
  )
}