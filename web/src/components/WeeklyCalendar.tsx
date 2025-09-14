'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, Eye, EyeOff, Camera, Calendar } from 'lucide-react'
import { groupOverlappingEvents, eventsOverlap, formatTimeCompact, formatInstructorCompact, extractSectionType } from '@/lib/courseUtils'
import { captureCalendarScreenshot } from '@/lib/screenshotUtils'
import {
  DEFAULT_CALENDAR_CONFIG,
  CALENDAR_LAYOUT_CONSTANTS,
  TEXT_STYLES,
  ROW_HEIGHTS,
  MINIMUM_COURSE_DURATION_MINUTES,
  getDayIndex,
  getRequiredDays,
  getGridColumns,
  type CalendarDisplayConfig,
  type CalendarLayoutConfig
} from '@/lib/calendarConfig'
import type { CalendarEvent, CourseEnrollment, InternalSection, InternalMeeting } from '@/lib/types'
import { useAppConfig } from '@/lib/appConfig'

/**
 * Calculate the total height needed for a course card based on display configuration
 */
const calculateReferenceCardHeight = (displayConfig: CalendarDisplayConfig): number => {
  let totalHeight = ROW_HEIGHTS.COURSE_CODE // Course code + section type always shown
  
  if (displayConfig.showTitle) totalHeight += ROW_HEIGHTS.TITLE
  if (displayConfig.showTime) totalHeight += ROW_HEIGHTS.TIME
  if (displayConfig.showLocation) totalHeight += ROW_HEIGHTS.LOCATION
  if (displayConfig.showInstructor) totalHeight += ROW_HEIGHTS.INSTRUCTOR
  
  // Add padding (4px top + 4px bottom)
  totalHeight += CALENDAR_LAYOUT_CONSTANTS.COURSE_CARD_PADDING * 2
  
  return totalHeight
}

/**
 * Calculate dynamic hour height based on minimum course duration requirements
 */
const calculateDynamicHourHeight = (referenceCardHeight: number): number => {
  const referenceDurationHours = MINIMUM_COURSE_DURATION_MINUTES / 60
  return referenceCardHeight / referenceDurationHours
}

/**
 * Convert time to pixel position with dynamic hour height support
 */
const timeToPixels = (
  hour: number, 
  minute: number, 
  startHour: number, 
  hourHeight: number = CALENDAR_LAYOUT_CONSTANTS.BASE_HOUR_SLOT_HEIGHT
): number => {
  return ((hour - startHour) * hourHeight) + (minute / 60) * hourHeight
}

/**
 * Calculate card dimensions from time data with dynamic scaling
 */
const getCardDimensions = (
  event: CalendarEvent, 
  startHour: number, 
  hourHeight: number = CALENDAR_LAYOUT_CONSTANTS.BASE_HOUR_SLOT_HEIGHT
) => {
  const top = timeToPixels(event.startHour, event.startMinute, startHour, hourHeight)
  const timeBasedHeight = timeToPixels(event.endHour, event.endMinute, startHour, hourHeight) - top
  
  // With dynamic scaling, no minimum height override needed
  const height = timeBasedHeight
  
  return { top, height }
}

interface WeeklyCalendarProps {
  events: CalendarEvent[]
  unscheduledSections?: Array<{
    enrollment: CourseEnrollment
    section: InternalSection
    meeting: InternalMeeting
  }>
  selectedTerm?: string
  availableTerms?: string[]
  selectedEnrollment?: string | null
  calendarConfig?: CalendarLayoutConfig  // New: flexible calendar configuration
  onTermChange?: (term: string) => void
  onToggleVisibility?: (enrollmentId: string) => void
  onSelectEnrollment?: (enrollmentId: string | null) => void
}

export default function WeeklyCalendar({ 
  events, 
  unscheduledSections = [],
  selectedTerm = "2025-26 Term 2", 
  availableTerms = ["2025-26 Term 2"],
  selectedEnrollment,
  calendarConfig = DEFAULT_CALENDAR_CONFIG,
  onTermChange,
  onToggleVisibility,
  onSelectEnrollment
}: WeeklyCalendarProps) {
  // Global config for display preferences - uses single hydration source
  const { config, updateConfig } = useAppConfig()
  const localDisplayConfig = config.calendarDisplay
  const [isCapturing, setIsCapturing] = useState(false)
  
  // Refs for auto-scrolling to selected events
  const eventRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  
  // Scroll state for indicators
  const [scrollState, setScrollState] = useState({
    canScrollUp: false,
    canScrollDown: false
  })
  
  // Ref for capturing the calendar component
  const calendarRef = useRef<HTMLDivElement>(null)

  const updateScrollStateHandler = useCallback(() => {
    if (!calendarRef.current) return
    
    const { scrollTop, scrollHeight, clientHeight } = calendarRef.current
    const maxScrollTop = Math.max(0, scrollHeight - clientHeight)
    
    // Auto-adjust if scrolled past the new bottom
    if (scrollTop > maxScrollTop) {
      calendarRef.current.scrollTop = maxScrollTop
    }
    
    const currentScrollTop = calendarRef.current.scrollTop
    const tolerance = 1
    const significantScrollThreshold = 5
    
    setScrollState({
      canScrollUp: currentScrollTop > tolerance,
      canScrollDown: scrollHeight > clientHeight && 
                     maxScrollTop > significantScrollThreshold && 
                     currentScrollTop < maxScrollTop - tolerance
    })
  }, [])

  const handleScroll = useCallback(() => {
    updateScrollStateHandler()
  }, [updateScrollStateHandler])

  const scrollToTopHandler = useCallback(() => {
    if (calendarRef.current) {
      calendarRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [])

  const scrollToBottomHandler = useCallback(() => {
    if (calendarRef.current) {
      calendarRef.current.scrollTo({ top: calendarRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [])

  const toggleDisplayOption = useCallback((option: keyof CalendarDisplayConfig) => {
    updateConfig(`calendarDisplay/${option}`, !config.calendarDisplay[option])
  }, [config.calendarDisplay, updateConfig])

  // Update scroll indicators when content changes
  useEffect(() => {
    if (!calendarRef.current) return
    
    const resizeObserver = new ResizeObserver(updateScrollStateHandler)
    resizeObserver.observe(calendarRef.current)
    
    // Update immediately on config/events change
    updateScrollStateHandler()
    
    return () => resizeObserver.disconnect()
  }, [localDisplayConfig, events, updateScrollStateHandler])
  
  // Auto-scroll to selected event
  useEffect(() => {
    if (!selectedEnrollment || !calendarRef.current) return
    
    const selectedElement = eventRefs.current.get(selectedEnrollment)
    if (!selectedElement) return
    
    const container = calendarRef.current
    const elementTop = selectedElement.offsetTop
    const elementHeight = selectedElement.offsetHeight
    const containerHeight = container.clientHeight
    const containerScrollTop = container.scrollTop
    
    // Calculate ideal scroll position to center the element
    const idealScrollTop = elementTop - (containerHeight / 2) + (elementHeight / 2)
    
    // Only scroll if element is not fully visible
    const elementBottom = elementTop + elementHeight
    const visibleTop = containerScrollTop
    const visibleBottom = containerScrollTop + containerHeight
    
    if (elementTop < visibleTop || elementBottom > visibleBottom) {
      container.scrollTo({
        top: idealScrollTop,
        behavior: 'smooth'
      })
    }
  }, [selectedEnrollment, events])

  const handleScreenshot = async () => {
    if (!calendarRef.current) {
      console.error('Calendar element not found')
      return
    }

    setIsCapturing(true)
    try {
      console.log('Starting screenshot capture...')
      
      // Find unscheduled section using data attribute
      const unscheduledElement = document.querySelector('[data-screenshot="unscheduled"]') as HTMLElement | null
      
      await captureCalendarScreenshot(calendarRef.current, unscheduledElement, selectedTerm)
      console.log('Screenshot completed successfully')
    } catch (error) {
      console.error('Screenshot capture failed:', error)
      if (error instanceof Error) {
        console.error('Error details:', { message: error.message, stack: error.stack })
      }
    } finally {
      setIsCapturing(false)
    }
  }
  
  // Dynamic day detection - show weekends only when courses exist
  const days = getRequiredDays(events)
  const gridColumns = getGridColumns(days.length)
  
  // Calculate dynamic hour height based on display configuration
  const dynamicHourHeight = calculateDynamicHourHeight(
    calculateReferenceCardHeight(localDisplayConfig)
  )
  
  const latestEndTime = events.length > 0 
    ? Math.max(calendarConfig.endHour, ...events.map(event => event.endHour))
    : calendarConfig.endHour
  
  const hours = Array.from({ 
    length: latestEndTime - calendarConfig.startHour + 1 
  }, (_, i) => calendarConfig.startHour + i)

  return (
    <Card className="h-full flex flex-col gap-2">
      <CardHeader className="pb-0 pt-1 flex-shrink-0">
        {/* #region Desktop Layout */}
        {/* Desktop layout: everything in one row */}
        <div className="hidden md:flex items-center justify-between">
          <div className="flex items-center gap-4">
            <CardTitle>Weekly Schedule</CardTitle>
            <DisplayToggleButtons
              displayConfig={localDisplayConfig}
              onToggle={toggleDisplayOption}
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleScreenshot}
              disabled={isCapturing}
              className="flex items-center gap-2 cursor-pointer"
              title="Download schedule as image"
            >
              <Camera className="w-4 h-4" />
              {isCapturing ? 'Capturing...' : 'Screenshot'}
            </Button>
            
            <TermSelector 
              selectedTerm={selectedTerm}
              availableTerms={availableTerms}
              onTermChange={onTermChange}
            />
          </div>
        </div>
        {/* #endregion */}

        {/* #region Mobile Layout */}
        {/* Mobile layout: title row, then controls row */}
        <div className="md:hidden">
          <CardTitle className="mb-3">Weekly Schedule</CardTitle>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleScreenshot}
                disabled={isCapturing}
                className="flex items-center gap-1 cursor-pointer flex-shrink-0"
                title="Download schedule as image"
              >
                <Camera className="w-4 h-4" />
                <span className="hidden xs:inline">{isCapturing ? 'Capturing...' : 'Screenshot'}</span>
              </Button>
              
              <TermSelector 
                selectedTerm={selectedTerm}
                availableTerms={availableTerms}
                onTermChange={onTermChange}
              />
            </div>
          </div>
          
          <DisplayToggleButtons
            displayConfig={localDisplayConfig}
            onToggle={toggleDisplayOption}
          />
        </div>
        {/* #endregion */}
      </CardHeader>
      
      {/* Unscheduled Events Row */}
      {unscheduledSections.length > 0 && (
        <UnscheduledSectionsCard 
          unscheduledSections={unscheduledSections} 
          selectedEnrollment={selectedEnrollment}
          onSelectEnrollment={onSelectEnrollment}
          onToggleVisibility={onToggleVisibility}
          displayConfig={localDisplayConfig}
        />
      )}
      
      <CardContent className="flex-1 px-4 py-0 overflow-hidden relative">
        {/* Scroll indicators */}
        {scrollState.canScrollUp && (
          <button 
            className="absolute z-40 bg-white hover:bg-gray-50 active:bg-gray-100 border border-gray-300 hover:border-gray-400 active:border-gray-500 rounded-lg transition-all duration-150 shadow-lg hover:shadow-xl active:shadow-md active:scale-95 cursor-pointer px-1.5 py-1 top-12 -left-2"
            onClick={scrollToTopHandler}
          >
            <ChevronUp className="w-4 h-4 text-gray-700" />
          </button>
        )}
        {scrollState.canScrollDown && (
          <button 
            className="absolute z-40 bg-white hover:bg-gray-50 active:bg-gray-100 border border-gray-300 hover:border-gray-400 active:border-gray-500 rounded-lg transition-all duration-150 shadow-lg hover:shadow-xl active:shadow-md active:scale-95 cursor-pointer px-1.5 py-1 bottom-8 -left-2"
            onClick={scrollToBottomHandler}
          >
            <ChevronDown className="w-4 h-4 text-gray-700" />
          </button>
        )}
        
        {/* Mobile horizontal scroll wrapper */}
        <div className="overflow-x-auto h-full">
          <div className="h-full" style={{ minWidth: `${CALENDAR_LAYOUT_CONSTANTS.MINIMUM_CALENDAR_WIDTH}px` }}>
            <div className="h-full max-h-[720px] overflow-y-auto" ref={calendarRef} onScroll={handleScroll}>
              {/* Sticky Header Row */}
              <div className="grid border-gray-200 bg-white sticky top-0 z-50 shadow-xs" style={{gridTemplateColumns: gridColumns, height: `${CALENDAR_LAYOUT_CONSTANTS.STICKY_HEADER_HEIGHT}px`}}>
                <div className="h-full flex items-center justify-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 flex-shrink-0 bg-white">
                  Time
                </div>
                {days.map((day) => (
                  <div key={day} className="h-full flex items-center justify-center text-xs font-medium text-gray-700 border-b border-r border-gray-200 min-w-0 flex-1 bg-white">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Content Grid */}
              <div 
                className="grid" 
                style={{gridTemplateColumns: gridColumns}}
                onClick={(e) => {
                  const target = e.target as HTMLElement
                  const isEmptySpace = !target.closest('[data-course-card]')
                  
                  if (isEmptySpace && onSelectEnrollment) {
                    onSelectEnrollment(null)
                  }
                }}
              >
            {/* Time column */}
            <div className="flex flex-col flex-shrink-0 border-r border-gray-200 time-column">
              <div className="flex-1">
                {hours.map(hour => (
                  <div key={hour} className="flex items-start justify-end pr-1 text-xs text-gray-500 border-b border-gray-100 transition-all duration-300" style={{ height: `${dynamicHourHeight}px` }}>
                    {hour.toString().padStart(2, '0')}
                  </div>
                ))}
              </div>
            </div>

            {/* Day columns with clean time-based rendering */}
            {days.map((day) => {
              // Get the CalendarEvent.day index for this day key
              const calendarEventDayIndex = getDayIndex(day)
              const dayEvents = events
                .filter(event => event.day === calendarEventDayIndex)
                .map(event => ({
                  ...event,
                  hasConflict: events.some(other => 
                    other.id !== event.id && 
                    other.day === event.day && 
                    eventsOverlap(event, other)
                  )
                }))
              
              const eventGroups = groupOverlappingEvents(dayEvents)
              
              return (
                <div key={day} className="flex flex-col relative min-w-0 flex-1 border-r border-gray-200 day-column">
                  {/* Hour slots with dynamic height */}
                  <div className="relative flex-1">
                    {hours.map(hour => (
                      <div 
                        key={hour} 
                        className="border-b border-gray-200 transition-all duration-300"
                        style={{ height: `${dynamicHourHeight}px` }}
                      />
                    ))}
                    
                    {/* Dynamic conflict zones - scale with hour height */}
                    {eventGroups.map((group, groupIndex) => {
                      if (group.length <= 1) return null
                      
                      // Calculate based on pure time bounds with dynamic height
                      const startTimes = group.map(e => e.startHour * 60 + e.startMinute)
                      const endTimes = group.map(e => e.endHour * 60 + e.endMinute)
                      const minStart = Math.min(...startTimes)
                      const maxEnd = Math.max(...endTimes)
                      
                      const zoneTop = timeToPixels(Math.floor(minStart / 60), minStart % 60, calendarConfig.startHour, dynamicHourHeight) - CALENDAR_LAYOUT_CONSTANTS.COURSE_CARD_PADDING
                      const zoneBottom = timeToPixels(Math.floor(maxEnd / 60), maxEnd % 60, calendarConfig.startHour, dynamicHourHeight) + CALENDAR_LAYOUT_CONSTANTS.COURSE_CARD_PADDING
                      
                      return (
                        <div
                          key={`conflict-zone-${groupIndex}`}
                          style={{
                            position: 'absolute',
                            top: `${zoneTop}px`,
                            height: `${zoneBottom - zoneTop}px`,
                            left: '0px',
                            right: '0px',
                            zIndex: 1,
                            background: 'repeating-linear-gradient(45deg, rgba(239, 68, 68, 0.6) 0px, rgba(239, 68, 68, 0.6) 10px, rgba(255, 255, 255, 0.3) 10px, rgba(255, 255, 255, 0.3) 20px)'
                          }}
                          className="border-2 border-red-600 rounded-sm shadow-xl animate-pulse transition-all duration-300"
                        />
                      )
                    })}
                    
                    {/* Event cards with dynamic time-based positioning */}
                    {eventGroups.map((group) => {
                      return group.map((event, stackIndex) => {
                        const { top, height } = getCardDimensions(event, calendarConfig.startHour, dynamicHourHeight)
                        const isConflicted = group.length > 1
                        const isSelected = selectedEnrollment === event.enrollmentId
                        
                        // Stacking for conflicts
                        const stackOffset = isConflicted ? stackIndex * CALENDAR_LAYOUT_CONSTANTS.CONFLICT_CARD_STACK_OFFSET : 0
                        const rightOffset = isConflicted ? (group.length - 1 - stackIndex) * CALENDAR_LAYOUT_CONSTANTS.CONFLICT_CARD_STACK_OFFSET : 0
                        
                        // Z-index should be lower than sticky header (z-50)
                        let zIndex = isConflicted ? 20 + stackIndex : 10
                        if (isSelected) zIndex = 40 // Lower than header z-50
                        
                        const shadowClass = isConflicted ? 'shadow-lg hover:shadow-xl' : 'shadow-md hover:shadow-lg'
                        
                        return (
                          <div
                            key={event.id}
                            ref={(el) => {
                              if (el && event.enrollmentId) {
                                eventRefs.current.set(event.enrollmentId, el)
                              } else if (event.enrollmentId) {
                                eventRefs.current.delete(event.enrollmentId)
                              }
                            }}
                            data-course-card="true"
                            style={{
                              position: 'absolute',
                              top: `${top}px`,
                              height: `${height}px`,
                              left: `${CALENDAR_LAYOUT_CONSTANTS.COURSE_CARD_PADDING + stackOffset}px`,
                              right: `${CALENDAR_LAYOUT_CONSTANTS.COURSE_CARD_PADDING + rightOffset}px`,
                              padding: `${CALENDAR_LAYOUT_CONSTANTS.COURSE_CARD_PADDING}px`,
                              zIndex,
                              ...(isSelected && {
                                backgroundImage: `repeating-linear-gradient(
                                  45deg,
                                  transparent,
                                  transparent 8px,
                                  rgba(255,255,255,0.15) 8px,
                                  rgba(255,255,255,0.15) 10px
                                )`
                              })
                            }}
                            className={`
                              ${event.color} 
                              rounded-sm text-xs text-white ${shadowClass}
                              hover:scale-105 transition-all duration-300 cursor-pointer
                              overflow-hidden group
                              ${isSelected ? 'scale-105 shadow-2xl' : ''}
                            `}
                            onClick={() => {
                              if (onSelectEnrollment && event.enrollmentId) {
                                const newSelection = isSelected ? null : event.enrollmentId
                                onSelectEnrollment(newSelection)
                              }
                            }}
                          >
                            {/* Visibility toggle button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (onSelectEnrollment && event.enrollmentId) {
                                  onSelectEnrollment(event.enrollmentId)
                                }
                                if (onToggleVisibility && event.enrollmentId) {
                                  onToggleVisibility(event.enrollmentId)
                                }
                              }}
                              className="absolute top-0.5 right-0.5 h-4 w-4 p-0 bg-black/20 hover:bg-white/40 backdrop-blur-sm cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                              title={event.isVisible ? 'Hide course' : 'Show course'}
                            >
                              {event.isVisible ? (
                                <Eye className="w-2.5 h-2.5 text-white" />
                              ) : (
                                <EyeOff className="w-2.5 h-2.5 text-white" />
                              )}
                            </Button>
                            
                            {/* Course content with conditional rendering based on config */}
                            <div className={`${TEXT_STYLES.COURSE_CODE} truncate pr-3`}>
                              {event.subject}{event.courseCode} {extractSectionType(event.sectionCode)}
                            </div>
                            
                            {localDisplayConfig.showTitle && (
                              <div className={`${TEXT_STYLES.TITLE} truncate`}>
                                {event.title || 'Course Title'}
                              </div>
                            )}
                            
                            {localDisplayConfig.showTime && (
                              <div className={`${TEXT_STYLES.TIME} truncate`}>
                                {formatTimeCompact(event.time)}
                              </div>
                            )}
                            
                            {localDisplayConfig.showLocation && (
                              <div className={`${TEXT_STYLES.LOCATION} truncate`}>
                                {event.location}
                              </div>
                            )}
                            
                            {localDisplayConfig.showInstructor && (
                              <div className={`${TEXT_STYLES.INSTRUCTOR} truncate`}>
                                {event.instructor ? formatInstructorCompact(event.instructor) : 'TBA'}
                              </div>
                            )}
                          </div>
                        )
                      })
                    })}
                  </div>
                </div>
              )
            })}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Display Toggle Buttons Component - data-driven approach eliminates repetition
function DisplayToggleButtons({ 
  displayConfig, 
  onToggle
}: {
  displayConfig: CalendarDisplayConfig
  onToggle: (option: keyof CalendarDisplayConfig) => void
}) {
  // Configuration-driven button definition - easy to maintain and extend
  const toggleButtons = [
    { key: 'showTitle' as const, label: 'Title' },
    { key: 'showTime' as const, label: 'Time' },
    { key: 'showLocation' as const, label: 'Location' },
    { key: 'showInstructor' as const, label: 'Instructor' }
  ]

  return (
    <div className="flex items-center gap-2">
      <div className="text-xs text-gray-500 font-medium">Show:</div>
      {toggleButtons.map(({ key, label }) => (
        <Button
          key={key}
          variant={displayConfig[key] ? "default" : "outline"}
          size="sm"
          onClick={() => onToggle(key)}
          className="h-6 px-2 text-xs font-normal border-1 cursor-pointer"
        >
          {label}
        </Button>
      ))}
    </div>
  )
}

// Term Selector Component
function TermSelector({ 
  selectedTerm, 
  availableTerms, 
  onTermChange 
}: {
  selectedTerm: string
  availableTerms: string[]
  onTermChange?: (term: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 cursor-pointer ${isOpen ? 'relative z-[60]' : ''}`}
      >
        <span className="text-sm">{selectedTerm}</span>
        <ChevronDown className="w-3 h-3" />
      </Button>
      
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-[55] cursor-pointer" 
            onClick={() => setIsOpen(false)}
          />
          
          <div className="absolute right-0 top-full mt-1 z-[60] bg-white border border-gray-200 rounded-md shadow-lg min-w-[250px]">
            <div className="py-1">
              {availableTerms.map(term => (
                <button
                  key={term}
                  type="button"
                  className={`block w-full text-left px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer ${
                    term === selectedTerm ? 'bg-blue-50 text-blue-600' : 'text-gray-900'
                  }`}
                  onClick={() => {
                    onTermChange?.(term)
                    setIsOpen(false)
                  }}
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Unscheduled Sections Card Component
function UnscheduledSectionsCard({ 
  unscheduledSections,
  selectedEnrollment,
  onSelectEnrollment,
  onToggleVisibility,
  displayConfig
}: {
  unscheduledSections: Array<{
    enrollment: CourseEnrollment
    section: InternalSection
    meeting: InternalMeeting
  }>
  selectedEnrollment?: string | null
  onSelectEnrollment?: (enrollmentId: string | null) => void
  onToggleVisibility?: (enrollmentId: string) => void
  displayConfig: CalendarDisplayConfig
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  // Auto-expand when shopping cart item is selected and it's in unscheduled
  useEffect(() => {
    if (selectedEnrollment) {
      const hasSelectedInUnscheduled = unscheduledSections.some(
        item => item.enrollment.courseId === selectedEnrollment
      )
      if (hasSelectedInUnscheduled) {
        setIsExpanded(true)
      }
    }
  }, [selectedEnrollment, unscheduledSections])
  
  return (
    <div data-screenshot="unscheduled" className="px-4 py-1 bg-white">
      <div 
        className="border border-gray-200 rounded-lg shadow-sm hover:shadow-md hover:bg-gray-50 transition-all bg-white cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-shrink-0">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
                  {unscheduledSections.length === 1 
                    ? '1 Unscheduled Course'
                    : `${unscheduledSections.length} Unscheduled Courses`
                  }
                </span>
              </div>
              
              <div className="flex gap-2 flex-wrap min-w-0">
                {unscheduledSections.map((item, index) => {
                  const isSelected = selectedEnrollment === item.enrollment.courseId
                  
                  return (
                    <span 
                      key={`${item.enrollment.courseId}_${item.section.id}_${index}`}
                      className={`
                        ${item.enrollment.color || 'bg-indigo-500'}
                        px-2 py-0.5 rounded font-mono text-xs text-white cursor-pointer hover:scale-105 transition-all
                        ${isSelected ? 'scale-105 shadow-lg' : ''}
                      `}
                      style={isSelected ? {
                        backgroundImage: `repeating-linear-gradient(
                          45deg,
                          transparent,
                          transparent 8px,
                          rgba(255,255,255,0.15) 8px,
                          rgba(255,255,255,0.15) 10px
                        )`
                      } : {}}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (onSelectEnrollment && item.enrollment.courseId) {
                          const newSelection = isSelected ? null : item.enrollment.courseId
                          onSelectEnrollment(newSelection)
                        }
                      }}
                    >
                      {item.enrollment.course.subject}{item.enrollment.course.courseCode}
                    </span>
                  )
                })}
              </div>
            </div>
            
            <div className="flex-shrink-0 ml-2">
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </div>
          </div>
        </div>
        
        {isExpanded && (
          <div className="px-3 pb-3 pt-0">
            <div className="flex flex-wrap gap-2">
              {unscheduledSections.map((item, index) => {
                const isSelected = selectedEnrollment === item.enrollment.courseId
                
                return (
                  <div
                    key={`${item.enrollment.courseId}_${item.section.id}_${index}`}
                    className={`
                      ${item.enrollment.color || 'bg-indigo-500'}
                      rounded-sm text-xs text-white shadow-md
                      hover:scale-105 transition-all cursor-pointer
                      overflow-hidden group relative
                      ${isSelected ? 'scale-105 shadow-2xl' : ''}
                    `}
                    style={{
                      width: 'calc((100% - 32px) / 5)',
                      minHeight: '60px',
                      padding: `${CALENDAR_LAYOUT_CONSTANTS.COURSE_CARD_PADDING}px`,
                      ...(isSelected && {
                        backgroundImage: `repeating-linear-gradient(
                          45deg,
                          transparent,
                          transparent 8px,
                          rgba(255,255,255,0.15) 8px,
                          rgba(255,255,255,0.15) 10px
                        )`
                      })
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      
                      if (onSelectEnrollment && item.enrollment.courseId) {
                        const newSelection = isSelected ? null : item.enrollment.courseId
                        onSelectEnrollment(newSelection)
                      }
                    }}
                  >
                    <div className={`${TEXT_STYLES.COURSE_CODE} truncate pr-1`}>
                      {item.enrollment.course.subject}{item.enrollment.course.courseCode} {extractSectionType(item.section.id)}
                    </div>
                    
                    {displayConfig.showTitle && (
                      <div className={`${TEXT_STYLES.TITLE} truncate`}>
                        {item.enrollment.course.title || 'Course Title'}
                      </div>
                    )}
                    
                    {displayConfig.showTime && (
                      <div className={`${TEXT_STYLES.TIME} truncate`}>
                        {item.meeting.time === 'TBA' ? 'No set time' : item.meeting.time}
                      </div>
                    )}
                    
                    {displayConfig.showLocation && (
                      <div className={`${TEXT_STYLES.LOCATION} truncate`}>
                        {item.meeting.location === 'TBA' ? 'No set location' : item.meeting.location}
                      </div>
                    )}
                    
                    {displayConfig.showInstructor && (
                      <div className={`${TEXT_STYLES.INSTRUCTOR} truncate`}>
                        {item.meeting.instructor ? formatInstructorCompact(item.meeting.instructor) : 'TBA'}
                      </div>
                    )}
                    
                    {/* Visibility toggle button for unscheduled sections */}
                    {onToggleVisibility && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleVisibility(item.enrollment.courseId)
                        }}
                        className="absolute top-0.5 right-0.5 h-4 w-4 p-0 bg-black/20 hover:bg-white/40 backdrop-blur-sm cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                        title={item.enrollment.isVisible ? 'Hide course' : 'Show course'}
                      >
                        {item.enrollment.isVisible ? (
                          <Eye className="w-2.5 h-2.5 text-white" />
                        ) : (
                          <EyeOff className="w-2.5 h-2.5 text-white" />
                        )}
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
