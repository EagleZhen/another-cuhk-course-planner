'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { groupOverlappingEvents, getConflictZones, eventsOverlap, type CalendarEvent } from '@/lib/courseUtils'


interface WeeklyCalendarProps {
  events: CalendarEvent[]
  selectedTerm?: string
}

export default function WeeklyCalendar({ events, selectedTerm = "2025-26 Term 2" }: WeeklyCalendarProps) {
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