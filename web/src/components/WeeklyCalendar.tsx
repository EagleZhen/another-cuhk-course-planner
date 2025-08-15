'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronDown, Eye, EyeOff, Camera } from 'lucide-react'
import { groupOverlappingEvents, eventsOverlap, formatTimeCompact, formatInstructorCompact, captureCalendarScreenshot, extractSectionType, type CalendarEvent, type CourseEnrollment, type InternalSection, type InternalMeeting } from '@/lib/courseUtils'

// Clean calendar architecture - time-first approach
interface CalendarDisplayConfig {
  showTime: boolean
  showLocation: boolean  
  showInstructor: boolean
  showTitle: boolean
}

// Fixed calendar constants - never change regardless of content
const CALENDAR_CONSTANTS = {
  HOUR_HEIGHT: 64,        // Fixed hour height for consistent time mapping
  TIME_COLUMN_WIDTH: 48,
  STACK_OFFSET: 16,       // Offset for conflicting cards
  CARD_PADDING: 4,        // Fixed padding for all cards
  MIN_CARD_HEIGHT: 24,    // Absolute minimum for very short events
} as const

// Typography styles for consistent rendering - timetable priorities
const TEXT_STYLES = {
  COURSE_CODE: 'text-xs font-semibold leading-tight',       // Most important: What course
  TITLE: 'text-[9px] leading-tight opacity-85',            // Course title - smaller than course code
  TIME: 'text-[10px] leading-tight opacity-90',            // Critical: When to go
  LOCATION: 'text-[10px] leading-tight opacity-85',        // Critical: Where to go
  INSTRUCTOR: 'text-[8px] leading-tight opacity-70',       // Less critical: Who teaches
} as const

// Row height constants based on typography (in pixels) - timetable priorities
const ROW_HEIGHTS = {
  COURSE_CODE: 14,     // text-xs with leading-tight (course code + section type)
  TITLE: 11,           // text-[9px] with leading-tight (course title)
  TIME: 12,            // text-[10px] with leading-tight
  LOCATION: 12,        // text-[10px] with leading-tight  
  INSTRUCTOR: 10,      // text-[8px] with leading-tight
} as const

// Reference duration for 45-minute standard class
const REFERENCE_DURATION_MINUTES = 45

// Dynamic height calculation functions
const calculateReferenceCardHeight = (displayConfig: CalendarDisplayConfig): number => {
  let totalHeight = ROW_HEIGHTS.COURSE_CODE // Course code + section type always shown
  
  if (displayConfig.showTitle) totalHeight += ROW_HEIGHTS.TITLE
  if (displayConfig.showTime) totalHeight += ROW_HEIGHTS.TIME
  if (displayConfig.showLocation) totalHeight += ROW_HEIGHTS.LOCATION
  if (displayConfig.showInstructor) totalHeight += ROW_HEIGHTS.INSTRUCTOR
  
  // Add padding (4px top + 4px bottom)
  totalHeight += CALENDAR_CONSTANTS.CARD_PADDING * 2
  
  return totalHeight
}

const calculateDynamicHourHeight = (referenceCardHeight: number): number => {
  // 45 minutes = 0.75 hours
  const referenceDurationHours = REFERENCE_DURATION_MINUTES / 60
  return referenceCardHeight / referenceDurationHours
}

// Pure time-to-pixel conversion (now accepts dynamic hour height)
const timeToPixels = (hour: number, minute: number, startHour: number, hourHeight: number = CALENDAR_CONSTANTS.HOUR_HEIGHT): number => {
  return ((hour - startHour) * hourHeight) + (minute / 60) * hourHeight
}

// Calculate card dimensions from pure time data (now accepts dynamic hour height)
const getCardDimensions = (event: CalendarEvent, startHour: number, hourHeight: number = CALENDAR_CONSTANTS.HOUR_HEIGHT) => {
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
  displayConfig?: CalendarDisplayConfig
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
  displayConfig = { showTime: true, showLocation: true, showInstructor: false, showTitle: false },
  onTermChange,
  onToggleVisibility,
  onSelectEnrollment
}: WeeklyCalendarProps) {
  // Local state for display configuration testing
  const [localDisplayConfig, setLocalDisplayConfig] = useState<CalendarDisplayConfig>(displayConfig)
  const [isCapturing, setIsCapturing] = useState(false)
  
  // Ref for capturing the calendar component
  const calendarRef = useRef<HTMLDivElement>(null)
  
  // Toggle functions
  const toggleTime = () => setLocalDisplayConfig(prev => ({ ...prev, showTime: !prev.showTime }))
  const toggleLocation = () => setLocalDisplayConfig(prev => ({ ...prev, showLocation: !prev.showLocation }))
  const toggleInstructor = () => setLocalDisplayConfig(prev => ({ ...prev, showInstructor: !prev.showInstructor }))
  const toggleTitle = () => setLocalDisplayConfig(prev => ({ ...prev, showTitle: !prev.showTitle }))
  
  // Screenshot function
  const handleScreenshot = async () => {
    if (!calendarRef.current) {
      console.error('Calendar element not found')
      return
    }

    setIsCapturing(true)
    try {
      console.log('Starting screenshot capture...')
      await captureCalendarScreenshot(calendarRef.current, selectedTerm)
      console.log('Screenshot completed successfully')
    } catch (error) {
      console.error('Screenshot capture failed:', error)
      // Show detailed error information
      if (error instanceof Error) {
        console.error('Error message:', error.message)
        console.error('Error stack:', error.stack)
      }
    } finally {
      setIsCapturing(false)
    }
  }
  
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  
  // Fixed hour range - consistent time grid
  const defaultStartHour = 8
  const defaultEndHour = 21
  
  // Calculate dynamic hour height based on display configuration
  const referenceCardHeight = calculateReferenceCardHeight(localDisplayConfig)
  const dynamicHourHeight = calculateDynamicHourHeight(referenceCardHeight)
  
  const latestEndTime = events.length > 0 
    ? Math.max(defaultEndHour, ...events.map(event => event.endHour))
    : defaultEndHour
  
  const hours = Array.from({ length: latestEndTime - defaultStartHour + 1 }, (_, i) => defaultStartHour + i)

  return (
    <Card className="h-full flex flex-col gap-2">
      <CardHeader className="pb-0 pt-1 flex-shrink-0">
        {/* Desktop layout: everything in one row */}
        <div className="hidden md:flex items-center justify-between">
          <div className="flex items-center gap-4">
            <CardTitle>Weekly Schedule</CardTitle>
            <DisplayToggleButtons
              displayConfig={localDisplayConfig}
              onToggleTime={toggleTime}
              onToggleLocation={toggleLocation}
              onToggleInstructor={toggleInstructor}
              onToggleTitle={toggleTitle}
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

        {/* Mobile layout: title row, then buttons row */}
        <div className="md:hidden">
          <div className="flex items-center justify-between mb-2">
            <CardTitle>Weekly Schedule</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleScreenshot}
                disabled={isCapturing}
                className="flex items-center gap-1 cursor-pointer"
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
          
          <DisplayToggleButtons
            displayConfig={localDisplayConfig}
            onToggleTime={toggleTime}
            onToggleLocation={toggleLocation}
            onToggleInstructor={toggleInstructor}
            onToggleTitle={toggleTitle}
          />
        </div>
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
      
      <CardContent className="flex-1 px-4 py-0 overflow-hidden">
        {/* Mobile horizontal scroll wrapper */}
        <div className="overflow-x-auto h-full">
          <div className="min-w-[640px] h-full"> {/* Wider minimum width for better course code display */}
            <div className="h-full max-h-[720px] overflow-y-auto" ref={calendarRef}>
              {/* Sticky Header Row */}
              <div className="grid border-gray-200 bg-white sticky top-0 z-50 shadow-xs" style={{gridTemplateColumns: `${CALENDAR_CONSTANTS.TIME_COLUMN_WIDTH}px 1fr 1fr 1fr 1fr 1fr`}}>
                <div className="h-8 flex items-center justify-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 flex-shrink-0 bg-white">
                  Time
                </div>
                {days.map((day) => (
                  <div key={day} className="h-8 flex items-center justify-center text-xs font-medium text-gray-700 border-b border-r border-gray-200 min-w-0 flex-1 bg-white">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Content Grid */}
              <div 
                className="grid" 
                style={{gridTemplateColumns: `${CALENDAR_CONSTANTS.TIME_COLUMN_WIDTH}px 1fr 1fr 1fr 1fr 1fr`}}
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
            {days.map((day, dayIndex) => {
              const dayEvents = events
                .filter(event => event.day === dayIndex)
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
                      
                      const zoneTop = timeToPixels(Math.floor(minStart / 60), minStart % 60, defaultStartHour, dynamicHourHeight) - CALENDAR_CONSTANTS.CARD_PADDING
                      const zoneBottom = timeToPixels(Math.floor(maxEnd / 60), maxEnd % 60, defaultStartHour, dynamicHourHeight) + CALENDAR_CONSTANTS.CARD_PADDING
                      
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
                        const { top, height } = getCardDimensions(event, defaultStartHour, dynamicHourHeight)
                        const isConflicted = group.length > 1
                        const isSelected = selectedEnrollment === event.enrollmentId
                        
                        // Stacking for conflicts
                        const stackOffset = isConflicted ? stackIndex * CALENDAR_CONSTANTS.STACK_OFFSET : 0
                        const rightOffset = isConflicted ? (group.length - 1 - stackIndex) * CALENDAR_CONSTANTS.STACK_OFFSET : 0
                        
                        let zIndex = isConflicted ? 20 + stackIndex : 10
                        if (isSelected) zIndex = 100
                        
                        const shadowClass = isConflicted ? 'shadow-lg hover:shadow-xl' : 'shadow-md hover:shadow-lg'
                        
                        return (
                          <div
                            key={event.id}
                            data-course-card="true"
                            style={{
                              position: 'absolute',
                              top: `${top}px`,
                              height: `${height}px`,
                              left: `${CALENDAR_CONSTANTS.CARD_PADDING + stackOffset}px`,
                              right: `${CALENDAR_CONSTANTS.CARD_PADDING + rightOffset}px`,
                              padding: `${CALENDAR_CONSTANTS.CARD_PADDING}px`,
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

// Display Toggle Buttons Component
function DisplayToggleButtons({ 
  displayConfig, 
  onToggleTime, 
  onToggleLocation, 
  onToggleInstructor,
  onToggleTitle
}: {
  displayConfig: CalendarDisplayConfig
  onToggleTime: () => void
  onToggleLocation: () => void
  onToggleInstructor: () => void
  onToggleTitle: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-xs text-gray-500 font-medium">Show:</div>
      <Button
        variant={displayConfig.showTitle ? "default" : "outline"}
        size="sm"
        onClick={onToggleTitle}
        className="h-6 px-2 text-xs font-normal border-1 cursor-pointer"
      >
        Title
      </Button>
      <Button
        variant={displayConfig.showTime ? "default" : "outline"}
        size="sm"
        onClick={onToggleTime}
        className="h-6 px-2 text-xs font-normal border-1 cursor-pointer"
      >
        Time
      </Button>
      <Button
        variant={displayConfig.showLocation ? "default" : "outline"}
        size="sm"
        onClick={onToggleLocation}
        className="h-6 px-2 text-xs font-normal border-1 cursor-pointer"
      >
        Location
      </Button>
      <Button
        variant={displayConfig.showInstructor ? "default" : "outline"}
        size="sm"
        onClick={onToggleInstructor}
        className="h-6 px-2 text-xs font-normal border-1 cursor-pointer"
      >
        Instructor
      </Button>
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
          
          <div className="absolute right-0 top-full mt-1 z-[60] bg-white border border-gray-200 rounded-md shadow-lg min-w-[200px]">
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
    <div className="px-4 py-1 bg-white">
      <div 
        className="border border-gray-200 rounded-lg shadow-sm hover:shadow-md hover:bg-gray-50 transition-all bg-white cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-sm font-medium text-gray-700">📋 Unscheduled ({unscheduledSections.length})</span>
              
              <div className="flex gap-2 flex-wrap">
                {unscheduledSections.map((item, index) => {
                  const isSelected = selectedEnrollment === item.enrollment.courseId
                  
                  return (
                    <span 
                      key={`${item.enrollment.courseId}_${item.section.id}_${index}`}
                      className={`
                        ${item.enrollment.color || 'bg-indigo-500'}
                        px-2 py-0.5 text-xs rounded text-white cursor-pointer hover:scale-105 transition-all
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
                      padding: `${CALENDAR_CONSTANTS.CARD_PADDING}px`,
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
                        {item.meeting.location || 'TBA'}
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
