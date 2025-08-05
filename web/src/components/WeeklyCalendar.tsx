'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface CalendarEvent {
  id: string
  courseCode: string
  section: string
  title: string
  time: string
  location: string
  instructor: string
  day: number // 0=Monday, 1=Tuesday, etc.
  startHour: number
  endHour: number
  startMinute: number
  endMinute: number
  color: string
  hasConflict?: boolean
}

interface WeeklyCalendarProps {
  events: CalendarEvent[]
  selectedTerm?: string
}

export default function WeeklyCalendar({ events, selectedTerm = "2025-26 Term 2" }: WeeklyCalendarProps) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const hours = Array.from({ length: 10 }, (_, i) => 9 + i) // 9:00 to 18:00

  // Detect conflicts and mark events
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

  // Calculate conflict zones for background highlighting
  const getConflictZones = (dayEvents: CalendarEvent[]) => {
    const zones: { startHour: number, endHour: number, startMinute: number, endMinute: number }[] = []
    const eventGroups = groupOverlappingEvents(dayEvents)
    
    eventGroups.forEach(group => {
      if (group.length > 1) {
        // Find the time range that covers all conflicting events
        const minStart = Math.min(...group.map(e => e.startHour * 60 + e.startMinute))
        const maxEnd = Math.max(...group.map(e => e.endHour * 60 + e.endMinute))
        
        zones.push({
          startHour: Math.floor(minStart / 60),
          startMinute: minStart % 60,
          endHour: Math.floor(maxEnd / 60),
          endMinute: maxEnd % 60
        })
      }
    })
    
    return zones
  }

  // Group overlapping events for smart stacking
  const groupOverlappingEvents = (dayEvents: CalendarEvent[]) => {
    const groups: CalendarEvent[][] = []
    const processed = new Set<string>()

    for (const event of dayEvents) {
      if (processed.has(event.id)) continue

      const group = [event]
      processed.add(event.id)

      // Find overlapping events
      for (const otherEvent of dayEvents) {
        if (processed.has(otherEvent.id)) continue

        if (eventsOverlap(event, otherEvent)) {
          group.push(otherEvent)
          processed.add(otherEvent.id)
        }
      }

      groups.push(group)
    }

    return groups
  }

  // Check if two events overlap in time
  const eventsOverlap = (event1: CalendarEvent, event2: CalendarEvent) => {
    const start1 = event1.startHour * 60 + event1.startMinute
    const end1 = event1.endHour * 60 + event1.endMinute
    const start2 = event2.startHour * 60 + event2.startMinute
    const end2 = event2.endHour * 60 + event2.endMinute

    return start1 < end2 && start2 < end1
  }

  // Render event content based on available space and priority
  const renderEventContent = (event: CalendarEvent, height: number, isPrimary: boolean, conflictCount: number) => {
    // Determine what information to show based on height and priority
    if (height >= 60) {
      // Large card - show all info
      return (
        <>
          <div className="font-semibold text-xs leading-tight truncate">
            {event.courseCode}
          </div>
          <div className="text-[10px] leading-tight truncate opacity-90">
            {event.time.split(' ').slice(1).join(' ')} {/* Remove day prefix */}
          </div>
          <div className="text-[10px] leading-tight truncate opacity-80">
            {event.section.split(' ')[0]} {/* Just section type */}
          </div>
          <div className="text-[9px] leading-tight truncate opacity-70">
            {event.location.length > 15 ? event.location.substring(0, 15) + '...' : event.location}
          </div>
        </>
      )
    } else if (height >= 36) {
      // Medium card - essential info
      return (
        <>
          <div className="font-semibold text-xs leading-tight truncate">
            {event.courseCode}
          </div>
          <div className="text-[10px] leading-tight truncate opacity-90">
            {event.time.split(' ').slice(1, 2).join(' ')} {/* Just start time */}
          </div>
          <div className="text-[10px] leading-tight truncate opacity-80">
            {event.section.split(' ')[0]}
          </div>
        </>
      )
    } else {
      // Small card - minimal info
      return (
        <div className="font-semibold text-xs leading-tight truncate">
          {event.courseCode}
        </div>
      )
    }
  }

  // Parse time string to get hour and minute
  const parseTime = (timeStr: string) => {
    // Handle formats like "Mo 14:30 - 15:15" or "Th 1:30PM - 2:15PM"
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})(?:AM|PM)?/i)
    if (timeMatch) {
      let hour = parseInt(timeMatch[1])
      const minute = parseInt(timeMatch[2])
      
      // Handle PM times
      if (timeStr.includes('PM') && hour !== 12) {
        hour += 12
      } else if (timeStr.includes('AM') && hour === 12) {
        hour = 0
      }
      
      return { hour, minute }
    }
    return { hour: 9, minute: 0 }
  }

  // Get day index from time string
  const getDayIndex = (timeStr: string) => {
    const dayMap: { [key: string]: number } = {
      'Mo': 0, 'Tu': 1, 'We': 2, 'Th': 3, 'Fr': 4,
      'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3, 'Friday': 4
    }
    
    for (const [key, index] of Object.entries(dayMap)) {
      if (timeStr.includes(key)) {
        return index
      }
    }
    return 0 // Default to Monday
  }

  // Calculate position and height for calendar events
  const getEventStyle = (event: CalendarEvent) => {
    const startHour = event.startHour
    const startMinute = event.startMinute
    const endHour = event.endHour
    const endMinute = event.endMinute
    
    // Calculate position from 9:00 AM
    const startPosition = ((startHour - 9) * 60 + startMinute) / 60
    const duration = ((endHour - startHour) * 60 + (endMinute - startMinute)) / 60
    
    return {
      top: `${startPosition * 60}px`, // 60px per hour
      height: `${duration * 60}px`,
      left: '4px',
      right: '4px',
      position: 'absolute' as const,
      zIndex: 10
    }
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle>Weekly Schedule</CardTitle>
          <Badge variant="outline">{selectedTerm}</Badge>
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
                            {event.courseCode}
                          </div>
                          <div className="text-[10px] leading-tight truncate opacity-90">
                            {event.time.split(' ').slice(1).join(' ')}
                          </div>
                          <div className="text-[10px] leading-tight truncate opacity-80">
                            {event.section.replace('--', '')}
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
                              {event.courseCode}
                            </div>
                            <div className="text-[10px] leading-tight truncate opacity-90">
                              {event.time.split(' ').slice(1).join(' ')}
                            </div>
                            {cardHeight > 36 && (
                              <div className="text-[10px] leading-tight truncate opacity-80">
                                {event.section.replace('--', '')}
                              </div>
                            )}
                            
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