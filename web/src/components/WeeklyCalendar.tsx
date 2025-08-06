'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronDown } from 'lucide-react'
import { groupOverlappingEvents, getConflictZones, eventsOverlap, type CalendarEvent } from '@/lib/courseUtils'


interface WeeklyCalendarProps {
  events: CalendarEvent[]
  selectedTerm?: string
  availableTerms?: string[]
  onTermChange?: (term: string) => void
}

export default function WeeklyCalendar({ 
  events, 
  selectedTerm = "2025-26 Term 2", 
  availableTerms = ["2025-26 Term 2"],
  onTermChange 
}: WeeklyCalendarProps) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const hours = Array.from({ length: 10 }, (_, i) => 9 + i) // 9:00 to 18:00

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
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle>Weekly Schedule</CardTitle>
          <TermSelector 
            selectedTerm={selectedTerm}
            availableTerms={availableTerms}
            onTermChange={onTermChange}
          />
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-4">
        <div className="grid grid-cols-6 gap-1 h-full min-h-[580px]">
          {/* Time column */}
          <div className="flex flex-col w-16 flex-shrink-0">
            <div className="h-12 flex items-center justify-center text-sm font-medium text-gray-500 border-b">
              Time
            </div>
            <div className="flex-1">
              {hours.map(hour => (
                <div key={hour} className="h-12 flex items-start justify-end pr-2 text-xs text-gray-500 border-b border-gray-100">
                  {hour.toString().padStart(2, '0')}:00
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
              <div key={day} className="flex flex-col relative min-w-0 flex-1">
                {/* Day header */}
                <div className="h-12 flex items-center justify-center text-sm font-medium text-gray-700 border-b border-r border-gray-200">
                  {day}
                </div>
                
                {/* Hour slots */}
                <div className="relative flex-1">
                  {hours.map(hour => (
                    <div 
                      key={hour} 
                      className="h-12 border-b border-gray-100 border-r border-gray-200"
                    />
                  ))}
                  
                  {/* Conflict Zone Backgrounds */}
                  {conflictZones.map((zone, zoneIndex) => {
                    const zoneTop = ((zone.startHour - 9) * 48 + (zone.startMinute / 60) * 48)
                    const zoneHeight = ((zone.endHour - zone.startHour) * 48 + ((zone.endMinute - zone.startMinute) / 60) * 48)
                    
                    return (
                      <div
                        key={`conflict-zone-${zoneIndex}`}
                        style={{
                          position: 'absolute',
                          top: `${zoneTop}px`,
                          height: `${zoneHeight}px`,
                          left: '-5px', // Extend past left border
                          right: '0px', // Extend past right border  
                          zIndex: 1 // Behind course cards
                        }}
                        className="bg-red-400/85 border-2 border-red-500/85 rounded-sm bg-radial"
                      />
                    )
                  })}
                  
                  {/* Event Groups with Smart Stacking */}
                  {eventGroups.map((group) => {
                    if (group.length === 1) {
                      // Single event - no conflict
                      const event = group[0]
                      const cardHeight = ((event.endHour - event.startHour) * 48 + ((event.endMinute - event.startMinute) / 60) * 48)
                      const cardTop = ((event.startHour - 9) * 48 + (event.startMinute / 60) * 48)
                      
                      return (
                        <div
                          key={event.id}
                          style={{
                            position: 'absolute',
                            top: `${cardTop}px`,
                            height: `${cardHeight}px`,
                            left: '3px',
                            right: '8px',
                            zIndex: 10
                          }}
                          className={`
                            ${event.color} 
                            rounded-sm p-1 text-xs text-white shadow-md
                            hover:shadow-lg hover:scale-[1.02] transition-all cursor-pointer
                            overflow-hidden
                          `}
                          onClick={() => console.log('Course details:', event.courseCode)}
                        >
                          <div className="font-semibold text-xs leading-tight truncate">
                            {event.subject}{event.courseCode} {event.section.match(/(LEC|TUT|LAB|EXR|SEM|PRJ|WKS|PRA|FLD)/)?.[1] || '?'}
                          </div>
                          <div className="text-[10px] leading-tight truncate opacity-90">
                            {event.time}
                          </div>
                          <div className="text-[9px] leading-tight truncate opacity-80">
                            {event.instructor}
                          </div>
                        </div>
                      )
                    } else {
                      // Multiple events - conflict stacking
                      return group.map((event, stackIndex) => {
                        const cardHeight = ((event.endHour - event.startHour) * 48 + ((event.endMinute - event.startMinute) / 60) * 48)
                        const cardTop = ((event.startHour - 9) * 48 + (event.startMinute / 60) * 48)
                        const stackOffset = stackIndex * 16 // 16px offset per stack level - even more visible
                        const isTopCard = stackIndex === 0
                        
                        return (
                          <div
                            key={event.id}
                            style={{
                              position: 'absolute',
                              top: `${cardTop}px`,
                              height: `${cardHeight}px`,
                              left: `${8 + stackOffset}px`,
                              right: `${8 + (group.length - 1 - stackIndex) * 16}px`,
                              zIndex: 20 + stackIndex // Conflicted events float higher
                            }}
                            className={`
                              ${event.color} 
                              rounded-sm p-1 text-xs text-white shadow-lg
                              hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer
                              overflow-hidden
                            `}
                            onClick={() => console.log('Conflict details:', event.courseCode, 'vs', group.filter(e => e.id !== event.id).map(e => e.courseCode))}
                          >
                            {/* Warning sign for conflict */}
                            <div className="absolute top-0.5 right-0.5 text-yellow-300 text-[10px] drop-shadow-sm">
                              ⚠️
                            </div>
                            
                            <div className="font-semibold text-xs leading-tight truncate pr-3">
                              {event.subject}{event.courseCode} {event.section.match(/(LEC|TUT|LAB|EXR|SEM|PRJ|WKS|PRA|FLD)/)?.[1] || 'SEC'}
                            </div>
                            <div className="text-[10px] leading-tight truncate opacity-90">
                              {event.time.split(' ').slice(1).join(' ')}
                            </div>
                            
                            {/* Conflict count indicator for top card */}
                            {isTopCard && group.length > 2 && (
                              <div className="absolute bottom-0.5 right-0.5 bg-red-500 text-white text-[8px] px-1 rounded font-medium">
                                +{group.length - 1}
                              </div>
                            )}
                          </div>
                        )
                      })
                    }
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
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
        className="flex items-center gap-2"
      >
        <span className="text-sm">{selectedTerm}</span>
        <ChevronDown className="w-3 h-3" />
      </Button>
      
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-md shadow-lg min-w-[200px]">
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