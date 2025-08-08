'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronDown, Eye, EyeOff } from 'lucide-react'
import { groupOverlappingEvents, getConflictZones, eventsOverlap, formatTimeCompact, type CalendarEvent } from '@/lib/courseUtils'


interface WeeklyCalendarProps {
  events: CalendarEvent[]
  selectedTerm?: string
  availableTerms?: string[]
  selectedEnrollment?: string | null
  onTermChange?: (term: string) => void
  onToggleVisibility?: (enrollmentId: string) => void
  onSelectEnrollment?: (enrollmentId: string | null) => void
}

export default function WeeklyCalendar({ 
  events, 
  selectedTerm = "2025-26 Term 2", 
  availableTerms = ["2025-26 Term 2"],
  selectedEnrollment,
  onTermChange,
  onToggleVisibility,
  onSelectEnrollment
}: WeeklyCalendarProps) {
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
          <CardTitle>Weekly Schedule</CardTitle>
          <TermSelector 
            selectedTerm={selectedTerm}
            availableTerms={availableTerms}
            onTermChange={onTermChange}
          />
        </div>
      </CardHeader>
      <CardContent className="flex-1 px-4 py-0 overflow-hidden">
        {/* Scrollable Calendar Content - moved up to wrap header for scrollbar alignment */}
        <div className="h-full max-h-[720px] overflow-y-auto">
          {/* Sticky Header Row - now inside the scrollable container */}
          <div className="grid border-b border-gray-200 bg-white sticky top-0 z-40" style={{gridTemplateColumns: '48px 1fr 1fr 1fr 1fr 1fr'}}>
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
            style={{gridTemplateColumns: '48px 1fr 1fr 1fr 1fr 1fr'}}
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
                <div key={hour} className="h-16 flex items-start justify-end pr-1 text-xs text-gray-500 border-b border-gray-100">
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
                      className="h-16 border-b border-gray-200"
                    />
                  ))}
                  
                  {/* Conflict Zone Backgrounds */}
                  {conflictZones.map((zone, zoneIndex) => {
                    const zoneTop = ((zone.startHour - defaultStartHour) * 64 + (zone.startMinute / 60) * 64) - 4
                    const zoneHeight = ((zone.endHour - zone.startHour) * 64 + ((zone.endMinute - zone.startMinute) / 60) * 64) + 8
                    
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
                      const cardHeight = ((event.endHour - event.startHour) * 64 + ((event.endMinute - event.startMinute) / 60) * 64)
                      const cardTop = ((event.startHour - defaultStartHour) * 64 + (event.startMinute / 60) * 64)
                      
                      // Conditional styling based on conflict status and selection
                      const isConflicted = group.length > 1
                      const isSelected = selectedEnrollment === event.enrollmentId
                      const stackOffset = isConflicted ? stackIndex * 16 : 0
                      const rightOffset = isConflicted ? (group.length - 1 - stackIndex) * 16 : 0
                      
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
                            left: `${4 + stackOffset}px`,
                            right: `${4 + rightOffset}px`,
                            zIndex
                          }}
                          className={`
                            ${event.color} 
                            rounded-sm p-1 text-xs text-white ${shadowClass}
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
                          
                          <div className="font-semibold text-xs leading-tight truncate pr-3">
                            {event.subject}{event.courseCode} {event.sectionCode.match(/(LEC|TUT|LAB|EXR|SEM|PRJ|WKS|PRA|FLD)/)?.[1] || '?'}
                          </div>
                          <div className="text-[10px] leading-tight truncate opacity-90 mb-1">
                            {formatTimeCompact(event.time)}
                          </div>
                          <div className="text-[9px] leading-tight opacity-80" style={{wordBreak: 'break-word', lineHeight: '1.2'}}>
                            {event.location}
                          </div>
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
        className="flex items-center gap-2"
      >
        <span className="text-sm">{selectedTerm}</span>
        <ChevronDown className="w-3 h-3" />
      </Button>
      
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-md shadow-lg min-w-[200px]">
            <div className="py-1">
              {availableTerms.map(term => (
                <button
                  key={term}
                  type="button"
                  className={`block w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${
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