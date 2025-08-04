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
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle>Weekly Schedule</CardTitle>
          <Badge variant="outline">{selectedTerm}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-6 gap-1 h-full">
          {/* Time column */}
          <div className="flex flex-col">
            <div className="h-10 flex items-center justify-center text-sm font-medium text-gray-500">
              Time
            </div>
            {hours.map(hour => (
              <div key={hour} className="h-[60px] flex items-start justify-end pr-2 text-xs text-gray-500">
                {hour.toString().padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, dayIndex) => {
            const dayEvents = events.filter(event => event.day === dayIndex)
            
            return (
              <div key={day} className="flex flex-col relative">
                {/* Day header */}
                <div className="h-10 flex items-center justify-center text-sm font-medium text-gray-700 border-b">
                  {day}
                </div>
                
                {/* Hour slots */}
                <div className="relative flex-1">
                  {hours.map(hour => (
                    <div 
                      key={hour} 
                      className="h-[60px] border-b border-gray-100 border-r"
                    />
                  ))}
                  
                  {/* Events */}
                  {dayEvents.map(event => (
                    <div
                      key={event.id}
                      style={getEventStyle(event)}
                      className={`
                        ${event.color} 
                        rounded-md p-2 text-xs text-white shadow-sm
                        hover:shadow-md transition-shadow cursor-pointer
                        ${event.hasConflict ? 'ring-2 ring-yellow-400' : ''}
                      `}
                    >
                      <div className="font-semibold">
                        {event.courseCode}
                      </div>
                      <div className="opacity-90 text-xs">
                        {event.section}
                      </div>
                      <div className="opacity-80 text-xs mt-1 truncate">
                        {event.location}
                      </div>
                      {event.hasConflict && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center">
                          <span className="text-yellow-900 text-xs">⚠</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}