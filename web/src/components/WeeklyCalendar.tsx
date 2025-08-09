'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronDown, Eye, EyeOff } from 'lucide-react'
import { groupOverlappingEvents, getConflictZones, eventsOverlap, formatTimeCompact, formatInstructorCompact, type CalendarEvent, type CourseEnrollment, type InternalSection, type InternalMeeting } from '@/lib/courseUtils'

// Configuration-driven calendar display system
interface CalendarDisplayConfig {
  showTime: boolean
  showLocation: boolean  
  showInstructor: boolean
  // title always shown - it's essential for course identification
}

// Typography constants for consistency
const CARD_TEXT = {
  TITLE_SIZE: 'text-xs',
  DETAIL_SIZE: 'text-[10px]', 
  SMALL_SIZE: 'text-[9px]',
  LINE_HEIGHT: 'leading-tight',
  // Row height estimates for calculation (precise measurements)
  TITLE_ROW_HEIGHT: 16,    // text-xs + font-semibold + line-height
  DETAIL_ROW_HEIGHT: 12,   // text-[10px] + line-height  
  SMALL_ROW_HEIGHT: 11     // text-[9px] + tight line-height
} as const

// Calculate layout dimensions based on display configuration
const calculateLayoutFromConfig = (config: CalendarDisplayConfig) => {
  // Calculate total content height needed - title always shown
  let contentHeight = CARD_TEXT.TITLE_ROW_HEIGHT
  
  // Add height for each visible row
  if (config.showTime) {
    contentHeight += CARD_TEXT.DETAIL_ROW_HEIGHT
  }
  if (config.showLocation) {
    contentHeight += CARD_TEXT.SMALL_ROW_HEIGHT
  }
  if (config.showInstructor) {
    contentHeight += CARD_TEXT.SMALL_ROW_HEIGHT
  }
  
  // Calculate padding based on content
  // Title-only cards need minimal padding, more rows need slightly more breathing room
  const rowCount = 1 + 
    (config.showTime ? 1 : 0) + 
    (config.showLocation ? 1 : 0) + 
    (config.showInstructor ? 1 : 0)
  
  const cardPadding = rowCount === 1 ? 4 : 6 // Minimal padding for title-only
  const CARD_MIN_HEIGHT = contentHeight + cardPadding
  
  // Hour height accommodates content with minimal but usable buffer
  const HOUR_HEIGHT = Math.max(32, CARD_MIN_HEIGHT + 6) // Very compact for title-only mode
  
  return {
    HOUR_HEIGHT,
    CARD_MIN_HEIGHT,
    TIME_COLUMN_WIDTH: 48,
    STACK_OFFSET: 16,
    CONFLICT_ZONE_PADDING: 4,
    CARD_PADDING: {
      horizontal: 4,
      vertical: cardPadding === 4 ? 1 : 2 // Tighter vertical padding for compact cards
    },
    // Store the config for conditional rendering
    DISPLAY_CONFIG: config
  } as const
}

// Helper functions for consistent calculations (now layout-aware)
const getCardHeight = (startHour: number, endHour: number, startMin: number, endMin: number, layout: ReturnType<typeof calculateLayoutFromConfig>) => {
  const naturalHeight = ((endHour - startHour) * layout.HOUR_HEIGHT + 
                        ((endMin - startMin) / 60) * layout.HOUR_HEIGHT)
  // For very short classes (like 45-50 min), ensure minimum content can fit
  // But allow cards to shrink when fewer rows are displayed
  return Math.max(naturalHeight, layout.CARD_MIN_HEIGHT)
}

const getCardTop = (startHour: number, startMin: number, defaultStartHour: number, layout: ReturnType<typeof calculateLayoutFromConfig>) => {
  return (startHour - defaultStartHour) * layout.HOUR_HEIGHT + (startMin / 60) * layout.HOUR_HEIGHT
}

const getConflictZoneTop = (startHour: number, startMin: number, defaultStartHour: number, layout: ReturnType<typeof calculateLayoutFromConfig>) => {
  return getCardTop(startHour, startMin, defaultStartHour, layout) - layout.CONFLICT_ZONE_PADDING
}

const getConflictZoneHeight = (startHour: number, endHour: number, startMin: number, endMin: number, layout: ReturnType<typeof calculateLayoutFromConfig>) => {
  return ((endHour - startHour) * layout.HOUR_HEIGHT + 
          ((endMin - startMin) / 60) * layout.HOUR_HEIGHT) + 
         (layout.CONFLICT_ZONE_PADDING * 2)
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
  displayConfig?: CalendarDisplayConfig  // New: configure what info to show
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
  displayConfig = { showTime: true, showLocation: true, showInstructor: true }, // Default: show all info
  onTermChange,
  onToggleVisibility,
  onSelectEnrollment
}: WeeklyCalendarProps) {
  // State for testing display configuration
  const [localDisplayConfig, setLocalDisplayConfig] = useState<CalendarDisplayConfig>(displayConfig)
  
  // Calculate layout based on display configuration
  const CALENDAR_LAYOUT = calculateLayoutFromConfig(localDisplayConfig)
  
  // Toggle functions for testing
  const toggleTime = () => setLocalDisplayConfig(prev => ({ ...prev, showTime: !prev.showTime }))
  const toggleLocation = () => setLocalDisplayConfig(prev => ({ ...prev, showLocation: !prev.showLocation }))
  const toggleInstructor = () => setLocalDisplayConfig(prev => ({ ...prev, showInstructor: !prev.showInstructor }))
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  
  // Dynamic hour range based on enrolled courses
  const defaultStartHour = 8
  const defaultEndHour = 19 // 7pm
  
  // Find the latest end time from all events
  const latestEndTime = events.length > 0 
    ? Math.max(defaultEndHour, ...events.map(event => event.endHour))
    : defaultEndHour
  
  const hours = Array.from({ length: latestEndTime - defaultStartHour + 1 }, (_, i) => defaultStartHour + i)

  // Detect conflicts and mark events - using shared utility
  const detectConflicts = (events: CalendarEvent[]) => {
    return events.map(event => {
      const hasConflict = events.some(otherEvent => 
        otherEvent.id !== event.id && 
        otherEvent.day === event.day && 
        eventsOverlap(event, otherEvent)
      )
      return { ...event, hasConflict }
    })
  }


  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-0 pt-1 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <CardTitle>Weekly Schedule</CardTitle>
            
            {/* Display Configuration Toggle Buttons */}
            <div className="flex items-center gap-2">
              <div className="text-xs text-gray-500 font-medium">Show:</div>
              <Button
                variant={localDisplayConfig.showTime ? "default" : "outline"}
                size="sm"
                onClick={toggleTime}
                className="h-6 px-2 text-xs font-normal"
              >
                Time
              </Button>
              <Button
                variant={localDisplayConfig.showLocation ? "default" : "outline"}
                size="sm"
                onClick={toggleLocation}
                className="h-6 px-2 text-xs font-normal"
              >
                Location
              </Button>
              <Button
                variant={localDisplayConfig.showInstructor ? "default" : "outline"}
                size="sm"
                onClick={toggleInstructor}
                className="h-6 px-2 text-xs font-normal"
              >
                Instructor
              </Button>
            </div>
          </div>
          
          <TermSelector 
            selectedTerm={selectedTerm}
            availableTerms={availableTerms}
            onTermChange={onTermChange}
          />
        </div>
      </CardHeader>
      
      {/* Unscheduled Events Row */}
      {unscheduledSections.length > 0 && (
        <UnscheduledSectionsCard 
          unscheduledSections={unscheduledSections} 
          selectedEnrollment={selectedEnrollment}
          onSelectEnrollment={onSelectEnrollment}
          layout={CALENDAR_LAYOUT}
        />
      )}
      
      <CardContent className="flex-1 px-4 py-0 overflow-hidden">
        {/* Scrollable Calendar Content - moved up to wrap header for scrollbar alignment */}
        <div className="h-full max-h-[720px] overflow-y-auto">
          {/* Sticky Header Row - now inside the scrollable container */}
          <div className="grid border-b border-gray-200 bg-white sticky top-0 z-40" style={{gridTemplateColumns: `${CALENDAR_LAYOUT.TIME_COLUMN_WIDTH}px 1fr 1fr 1fr 1fr 1fr`}}>
            {/* Time header - smaller width */}
            <div className="h-8 flex items-center justify-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 flex-shrink-0">
              Time
            </div>
            {/* Day headers */}
            {days.map((day) => (
              <div key={day} className="h-8 flex items-center justify-center text-xs font-medium text-gray-700 border-b border-r border-gray-200 min-w-0 flex-1">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Content Grid */}
          <div 
            className="grid" 
            style={{gridTemplateColumns: `${CALENDAR_LAYOUT.TIME_COLUMN_WIDTH}px 1fr 1fr 1fr 1fr 1fr`}}
            onClick={(e) => {
              // Click away handler - deselect if clicking on empty calendar space (not on a course card)
              const target = e.target as HTMLElement
              const isEmptySpace = !target.closest('[data-course-card]')
              
              if (isEmptySpace && onSelectEnrollment) {
                onSelectEnrollment(null)
              }
            }}
          >
            {/* Time column - smaller width */}
            <div className="flex flex-col flex-shrink-0 border-r border-gray-200 time-column">
            <div className="flex-1">
              {hours.map(hour => (
                <div key={hour} className="flex items-start justify-end pr-1 text-xs text-gray-500 border-b border-gray-100" style={{ height: `${CALENDAR_LAYOUT.HOUR_HEIGHT}px` }}>
                  {hour.toString().padStart(2, '0')}
                </div>
              ))}
            </div>
          </div>

          {/* Day columns */}
          {days.map((day, dayIndex) => {
            const dayEvents = detectConflicts(events.filter(event => event.day === dayIndex))
            const eventGroups = groupOverlappingEvents(dayEvents)
            const conflictZones = getConflictZones(dayEvents)
            
            return (
              <div key={day} className="flex flex-col relative min-w-0 flex-1 border-r border-gray-200 day-column">
                {/* Hour slots */}
                <div className="relative flex-1">
                  {hours.map(hour => (
                    <div 
                      key={hour} 
                      className="border-b border-gray-200"
                      style={{ height: `${CALENDAR_LAYOUT.HOUR_HEIGHT}px` }}
                    />
                  ))}
                  
                  {/* Conflict Zone Backgrounds */}
                  {conflictZones.map((zone, zoneIndex) => {
                    const zoneTop = getConflictZoneTop(zone.startHour, zone.startMinute, defaultStartHour, CALENDAR_LAYOUT)
                    const zoneHeight = getConflictZoneHeight(zone.startHour, zone.endHour, zone.startMinute, zone.endMinute, CALENDAR_LAYOUT)
                    
                    return (
                      <div
                        key={`conflict-zone-${zoneIndex}`}
                        style={{
                          position: 'absolute',
                          top: `${zoneTop}px`,
                          height: `${zoneHeight}px`,
                          left: '0px',
                          right: '0px',
                          zIndex: 1, // Behind course cards
                          background: 'repeating-linear-gradient(45deg, rgba(239, 68, 68, 0.6) 0px, rgba(239, 68, 68, 0.6) 10px, rgba(255, 255, 255, 0.3) 10px, rgba(255, 255, 255, 0.3) 20px)'
                        }}
                        className="border-2 border-red-600 rounded-sm shadow-xl animate-pulse"
                      />
                    )
                  })}
                  
                  {/* Event Groups with Smart Stacking */}
                  {eventGroups.map((group) => {
                    return group.map((event, stackIndex) => {
                      const cardHeight = getCardHeight(event.startHour, event.endHour, event.startMinute, event.endMinute, CALENDAR_LAYOUT)
                      const cardTop = getCardTop(event.startHour, event.startMinute, defaultStartHour, CALENDAR_LAYOUT)
                      
                      // Conditional styling based on conflict status and selection
                      const isConflicted = group.length > 1
                      const isSelected = selectedEnrollment === event.enrollmentId
                      const stackOffset = isConflicted ? stackIndex * CALENDAR_LAYOUT.STACK_OFFSET : 0
                      const rightOffset = isConflicted ? (group.length - 1 - stackIndex) * CALENDAR_LAYOUT.STACK_OFFSET : 0
                      
                      // Boost z-index for selected cards to bring them to front
                      let zIndex = isConflicted ? 20 + stackIndex : 10
                      if (isSelected) {
                        zIndex = 100 // Much higher z-index to ensure it's on top
                      }
                      
                      const shadowClass = isConflicted ? 'shadow-lg hover:shadow-xl' : 'shadow-md hover:shadow-lg'
                      const isTopCard = stackIndex === 0
                      
                      return (
                        <div
                          key={event.id}
                          data-course-card="true"
                          style={{
                            position: 'absolute',
                            top: `${cardTop}px`,
                            height: `${cardHeight}px`,
                            left: `${CALENDAR_LAYOUT.CARD_PADDING.horizontal + stackOffset}px`,
                            right: `${CALENDAR_LAYOUT.CARD_PADDING.horizontal + rightOffset}px`,
                            padding: `${CALENDAR_LAYOUT.CARD_PADDING.vertical}px ${CALENDAR_LAYOUT.CARD_PADDING.horizontal}px`,
                            zIndex
                          }}
                          className={`
                            ${event.color} 
                            rounded-sm text-xs text-white ${shadowClass}
                            hover:scale-105 transition-all cursor-pointer
                            overflow-hidden group
                            ${isSelected ? 'ring-2 ring-blue-400 ring-opacity-75 scale-105 shadow-2xl' : ''}
                          `}
                          onClick={() => {
                            // Toggle selection: if already selected, deselect; otherwise select
                            if (onSelectEnrollment && event.enrollmentId) {
                              const newSelection = isSelected ? null : event.enrollmentId
                              onSelectEnrollment(newSelection)
                            }
                            
                            // Log course details  
                            console.log(
                              isConflicted 
                                ? `Conflict details: ${event.courseCode} vs ${group.filter(e => e.id !== event.id).map(e => e.courseCode)}`
                                : `Course details: ${event.courseCode} - Selected: ${!isSelected}`
                            )
                          }}
                        >
                          {/* Toggle visibility button - shown on hover for ALL events */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              
                              // Trigger shopping cart selection + scroll when toggling visibility
                              if (onSelectEnrollment && event.enrollmentId) {
                                onSelectEnrollment(event.enrollmentId)
                              }
                              
                              // Toggle visibility
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
                          
                          {/* Row 1: Course info (always shown) */}
                          <div className={`font-semibold ${CARD_TEXT.TITLE_SIZE} ${CARD_TEXT.LINE_HEIGHT} truncate pr-3`}>
                            {event.subject}{event.courseCode} {event.sectionCode.match(/(LEC|TUT|LAB|EXR|SEM|PRJ|WKS|PRA|FLD)/)?.[1] || '?'}
                          </div>
                          
                          {/* Row 2: Time (conditional) */}
                          {CALENDAR_LAYOUT.DISPLAY_CONFIG.showTime && (
                            <div className={`${CARD_TEXT.DETAIL_SIZE} ${CARD_TEXT.LINE_HEIGHT} truncate opacity-90`}>
                              {formatTimeCompact(event.time)}
                            </div>
                          )}
                          
                          {/* Row 3: Location (conditional) */}
                          {CALENDAR_LAYOUT.DISPLAY_CONFIG.showLocation && (
                            <div className={`${CARD_TEXT.SMALL_SIZE} ${CARD_TEXT.LINE_HEIGHT} opacity-80 truncate`} style={{lineHeight: '1.2'}}>
                              {event.location}
                            </div>
                          )}
                          
                          {/* Row 4: Instructor (conditional) */}
                          {CALENDAR_LAYOUT.DISPLAY_CONFIG.showInstructor && (
                            <div className={`${CARD_TEXT.SMALL_SIZE} ${CARD_TEXT.LINE_HEIGHT} opacity-80 truncate`} style={{lineHeight: '1.2'}}>
                              {event.instructor ? formatInstructorCompact(event.instructor) : 'TBD'}
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
      </CardContent>
    </Card>
  )
}

// Term Selector Component - optimized for calendar header
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
        className={`flex items-center gap-2 cursor-pointer ${isOpen ? 'relative z-50' : ''}`}
      >
        <span className="text-sm">{selectedTerm}</span>
        <ChevronDown className="w-3 h-3" />
      </Button>
      
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40 cursor-pointer" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-md shadow-lg min-w-[200px]">
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

// Unscheduled Sections Card Component - expandable like TermSelector
function UnscheduledSectionsCard({ 
  unscheduledSections,
  selectedEnrollment,
  onSelectEnrollment,
  layout
}: {
  unscheduledSections: Array<{
    enrollment: CourseEnrollment
    section: InternalSection
    meeting: InternalMeeting
  }>
  selectedEnrollment?: string | null
  onSelectEnrollment?: (enrollmentId: string | null) => void
  layout: ReturnType<typeof calculateLayoutFromConfig>
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  return (
    <div className="px-4 py-1 bg-white">
      {/* Card-like expandable container - like CourseSearch */}
      <div 
        className="border border-gray-200 rounded-lg shadow-sm hover:shadow-md hover:bg-gray-50 transition-all bg-white cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Header row */}
        <div className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-sm font-medium text-gray-700">📋 Unscheduled ({unscheduledSections.length})</span>
              
              {/* Preview chips - always visible, left-aligned */}
              <div className="flex gap-2 flex-wrap">
                {unscheduledSections.map((item, index) => {
                  const isSelected = selectedEnrollment === item.enrollment.courseId
                  
                  return (
                  <span 
                    key={`${item.enrollment.courseId}_${item.section.id}_${index}`}
                    className={`
                      ${item.enrollment.color || 'bg-indigo-500'}
                      px-2 py-0.5 text-xs rounded text-white cursor-pointer hover:scale-105 transition-all
                      ${isSelected ? 'ring-2 ring-blue-400 ring-opacity-75 scale-105' : ''}
                    `}
                    onClick={(e) => {
                      e.stopPropagation() // Don't trigger card expansion
                      // Same selection behavior as detailed cards
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
            
            {/* Dropdown arrow in top-right corner */}
            <div className="flex-shrink-0 ml-2">
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </div>
          </div>
        </div>
        
        {/* Detailed view when expanded - inside the same card */}
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
                overflow-hidden group
                relative
                ${isSelected ? 'ring-2 ring-blue-400 ring-opacity-75 scale-105 shadow-2xl' : ''}
              `}
              style={{
                width: 'calc((100% - 32px) / 5)', // 5 cards per row with gap-2 (8px gaps)
                minHeight: `${layout.CARD_MIN_HEIGHT}px`, // Consistent height for configured rows
                padding: `${layout.CARD_PADDING.vertical}px ${layout.CARD_PADDING.horizontal}px`
              }}
              onClick={(e) => {
                e.stopPropagation() // Prevent card collapse when clicking course cards
                
                // Toggle selection: if already selected, deselect; otherwise select
                if (onSelectEnrollment && item.enrollment.courseId) {
                  const newSelection = isSelected ? null : item.enrollment.courseId
                  onSelectEnrollment(newSelection)
                }
                
                // Log course details like regular events
                console.log(`Unscheduled course: ${item.enrollment.course.subject}${item.enrollment.course.courseCode} - Selected: ${!isSelected}`)
              }}
            >
              {/* Row 1: Course info (always shown) */}
              <div className={`font-semibold ${CARD_TEXT.TITLE_SIZE} ${CARD_TEXT.LINE_HEIGHT} truncate pr-1`}>
                {item.enrollment.course.subject}{item.enrollment.course.courseCode} {item.section.sectionType}
              </div>
              
              {/* Row 2: Time (conditional) */}
              {layout.DISPLAY_CONFIG.showTime && (
                <div className={`${CARD_TEXT.DETAIL_SIZE} ${CARD_TEXT.LINE_HEIGHT} truncate opacity-90`}>
                  {item.meeting.time === 'TBA' ? 'No set time' : item.meeting.time}
                </div>
              )}
              
              {/* Row 3: Location (conditional) */}
              {layout.DISPLAY_CONFIG.showLocation && (
                <div className={`${CARD_TEXT.SMALL_SIZE} ${CARD_TEXT.LINE_HEIGHT} opacity-80 truncate`} style={{lineHeight: '1.2'}}>
                  {item.meeting.location || 'TBD'}
                </div>
              )}
              
              {/* Row 4: Instructor (conditional) */}
              {layout.DISPLAY_CONFIG.showInstructor && (
                <div className={`${CARD_TEXT.SMALL_SIZE} ${CARD_TEXT.LINE_HEIGHT} opacity-80 truncate`} style={{lineHeight: '1.2'}}>
                  {item.meeting.instructor ? formatInstructorCompact(item.meeting.instructor) : 'TBD'}
                </div>
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