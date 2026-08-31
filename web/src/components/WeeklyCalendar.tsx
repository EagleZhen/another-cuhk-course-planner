'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import posthog from 'posthog-js'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TermSelector } from '@/components/TermSelector'
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Camera,
  Calendar,
  CalendarArrowDown,
  Undo,
} from 'lucide-react'
import {
  groupOverlappingEvents,
  eventsOverlap,
  formatTimeCompact,
  formatInstructorsCompact,
  formatCourseCodeWithPrefix,
  formatCourseCodeWithSection,
  generateICSCalendar,
  processICSForUndo,
} from '@/lib/courseUtils'
import { captureCalendarScreenshot } from '@/lib/screenshotUtils'
import {
  DEFAULT_CALENDAR_CONFIG,
  CALENDAR_LAYOUT_CONSTANTS,
  TEXT_STYLES,
  MINIMUM_COURSE_DURATION_MINUTES,
  calculateReferenceCardHeight,
  getCardTextLineLimits,
  getDayIndex,
  getRequiredDays,
  getGridColumns,
  getMinimumCalendarWidth,
  type CalendarDisplayConfig,
  type CalendarLayoutConfig,
} from '@/lib/calendarConfig'
import type { CalendarEvent, CourseEnrollment, InternalSection, InternalMeeting } from '@/lib/types'
import { analytics } from '@/lib/analytics'

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
  return (hour - startHour) * hourHeight + (minute / 60) * hourHeight
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
  courseEnrollments: CourseEnrollment[]
  selectedTerm?: string
  availableTerms?: string[]
  selectedEnrollment?: string | null
  displayConfig?: CalendarDisplayConfig
  calendarConfig?: CalendarLayoutConfig // New: flexible calendar configuration
  onTermChange?: (term: string) => void
  onToggleVisibility?: (enrollmentId: string) => void
  onSelectEnrollment?: (enrollmentId: string | null) => void
}

export default function WeeklyCalendar({
  events,
  unscheduledSections = [],
  courseEnrollments,
  selectedTerm,
  availableTerms,
  selectedEnrollment,
  displayConfig = { showTitle: false, showTime: true, showLocation: true, showInstructor: false },
  calendarConfig = DEFAULT_CALENDAR_CONFIG,
  onTermChange,
  onToggleVisibility,
  onSelectEnrollment,
}: WeeklyCalendarProps) {
  // Local state for display configuration testing
  const [localDisplayConfig, setLocalDisplayConfig] = useState<CalendarDisplayConfig>(displayConfig)
  const [isCapturing, setIsCapturing] = useState(false)
  const [screenshotError, setScreenshotError] = useState<string | null>(null)
  const [isIcsMenuExpanded, setIsIcsMenuExpanded] = useState(false)

  // Refs for auto-scrolling to selected events
  const eventRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Scroll state for indicators
  const [scrollState, setScrollState] = useState({
    canScrollUp: false,
    canScrollDown: false,
  })

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const calendarRef = useRef<HTMLDivElement>(null)

  const updateScrollStateHandler = useCallback(() => {
    if (!scrollContainerRef.current) return

    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current
    const maxScrollTop = Math.max(0, scrollHeight - clientHeight)

    // Auto-adjust if scrolled past the new bottom
    if (scrollTop > maxScrollTop) {
      scrollContainerRef.current.scrollTop = maxScrollTop
    }

    const currentScrollTop = scrollContainerRef.current.scrollTop
    const tolerance = 1
    const significantScrollThreshold = 5

    setScrollState({
      canScrollUp: currentScrollTop > tolerance,
      canScrollDown:
        scrollHeight > clientHeight &&
        maxScrollTop > significantScrollThreshold &&
        currentScrollTop < maxScrollTop - tolerance,
    })
  }, [])

  const handleScroll = useCallback(() => {
    updateScrollStateHandler()
  }, [updateScrollStateHandler])

  const scrollToTopHandler = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [])

  const scrollToBottomHandler = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
  }, [])

  const toggleDisplayOption = useCallback((option: keyof CalendarDisplayConfig) => {
    setLocalDisplayConfig((prev) => ({ ...prev, [option]: !prev[option] }))
  }, [])

  // Update scroll indicators when content changes
  useEffect(() => {
    if (!scrollContainerRef.current) return

    const resizeObserver = new ResizeObserver(updateScrollStateHandler)
    resizeObserver.observe(scrollContainerRef.current)

    // Update immediately on config/events change
    updateScrollStateHandler()

    return () => resizeObserver.disconnect()
  }, [localDisplayConfig, events, updateScrollStateHandler])

  // Auto-scroll to selected event
  useEffect(() => {
    if (!selectedEnrollment || !scrollContainerRef.current) return

    const selectedElement = eventRefs.current.get(selectedEnrollment)
    if (!selectedElement) return

    const container = scrollContainerRef.current
    const elementTop = selectedElement.offsetTop
    const elementHeight = selectedElement.offsetHeight
    const containerHeight = container.clientHeight
    const containerScrollTop = container.scrollTop

    // Calculate ideal scroll position to center the element
    const idealScrollTop = elementTop - containerHeight / 2 + elementHeight / 2

    // Only scroll if element is not fully visible
    const elementBottom = elementTop + elementHeight
    const visibleTop = containerScrollTop
    const visibleBottom = containerScrollTop + containerHeight

    if (elementTop < visibleTop || elementBottom > visibleBottom) {
      container.scrollTo({
        top: idealScrollTop,
        behavior: 'smooth',
      })
    }
  }, [selectedEnrollment, events])

  const handleScreenshot = async () => {
    if (!calendarRef.current) {
      console.error('Calendar element not found')
      return
    }

    if (!selectedTerm) {
      console.error('No term selected for screenshot')
      return
    }

    setScreenshotError(null)
    setIsCapturing(true)
    try {
      // Find unscheduled section using data attribute
      const unscheduledElement = document.querySelector(
        '[data-screenshot="unscheduled"]'
      ) as HTMLElement | null

      await captureCalendarScreenshot(calendarRef.current, unscheduledElement, selectedTerm, {
        minimumCalendarWidth,
      })
      analytics.screenshotTaken()
    } catch (error) {
      posthog.captureException(error, { error_context: 'screenshot_export' })
      setScreenshotError('Couldn’t create the screenshot. Please try again.')
      console.error('Screenshot capture failed:', error)
      if (error instanceof Error) {
        console.error('Error details:', { message: error.message, stack: error.stack })
      }
    } finally {
      setIsCapturing(false)
    }
  }

  const handleExportCalendar = () => {
    if (!selectedTerm) {
      console.error('No term selected for export')
      alert('Please select a term before exporting')
      return
    }

    // Confirm and provide import instructions
    const proceed = confirm(
      '💡 How to use the .ics file:\n\n' +
        '1. Create a NEW calendar in your calendar app (Google Calendar, Outlook, etc.).\n' +
        '2. Import the downloaded .ics file to that NEW calendar\n\n' +
        'This keeps your course schedule separate and easier to manage.\n\n' +
        'P.S. If you imported to the wrong calendar, use the dropdown menu (⌄) → "Undo Previous Import" to cancel all events.\n\n' +
        'Click OK to proceed with the export.'
    )

    if (!proceed) return

    const result = generateICSCalendar(courseEnrollments, selectedTerm)

    if (result.error) {
      console.error('Export failed:', result.error)
      alert(result.error)
      return
    }

    if (result.icsContent && result.filename) {
      // Create blob and download
      const blob = new Blob([result.icsContent], { type: 'text/calendar;charset=utf-8' })
      const url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = url
      link.download = result.filename

      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      analytics.icsExported()
    }
  }

  const handleUndoFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file extension
    if (!file.name.toLowerCase().endsWith('.ics')) {
      alert('Please select a valid .ics file.')
      event.target.value = ''
      return
    }

    // Confirm before processing
    const proceed = confirm(
      'This will modify the selected .ics file, which adds "STATUS:CANCELLED" to each of the calendar events in the file.\n\n' +
        'When you re-import the UNDO .ics file to your calendar, all events will be automatically removed, essentially undoing the previous import.\n\n' +
        'Click OK to generate the UNDO file.'
    )

    if (!proceed) {
      event.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      if (!content) return

      // Process the ICS file using utility function
      const result = processICSForUndo(content)

      if (!result.success) {
        alert(result.error || 'Failed to process file')
        event.target.value = ''
        return
      }

      // Show warning if file wasn't from our app
      if (result.needsWarning) {
        const proceed = confirm(
          'Warning: This file may not be from Another CUHK Course Planner.\n\n' +
            'Proceeding might cancel unrelated events in your calendar.\n\n' +
            'Do you want to continue?'
        )
        if (!proceed) {
          event.target.value = ''
          return
        }
      }

      // Generate filename with (UNDO) prefix at the front
      const undoFilename = `(UNDO) ${file.name}`

      // Trigger download
      const blob = new Blob([result.modifiedContent!], { type: 'text/calendar;charset=utf-8' })
      const url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = url
      link.download = undoFilename

      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      analytics.icsUndo()
      event.target.value = '' // Reset input for future uploads
    }

    reader.onerror = () => {
      console.error('Failed to read file for UNDO file generation:', reader.error)
      alert('Failed to read the selected file. Please check the file and try again.')
      event.target.value = ''
    }

    reader.readAsText(file)
  }

  const handleUndoClick = () => {
    setIsIcsMenuExpanded(false)
    fileInputRef.current?.click()
  }

  // Dynamic day detection - show weekends only when courses exist
  const days = getRequiredDays(events)
  const gridColumns = getGridColumns(days.length)
  const minimumCalendarWidth = getMinimumCalendarWidth(days.length)

  // Calculate dynamic hour height based on display configuration
  const dynamicHourHeight = calculateDynamicHourHeight(
    calculateReferenceCardHeight(localDisplayConfig)
  )

  const latestEndTime =
    events.length > 0
      ? Math.max(calendarConfig.endHour, ...events.map((event) => event.endHour))
      : calendarConfig.endHour

  const hours = Array.from(
    {
      length: latestEndTime - calendarConfig.startHour + 1,
    },
    (_, i) => calendarConfig.startHour + i
  )

  return (
    <Card className="h-full flex flex-col gap-1 py-2 pt-4">
      <CardHeader className="pb-0 pt-1 flex-shrink-0">
        {/* #region Desktop Layout */}
        {/* Desktop layout: everything in one row */}
        <div className="hidden md:flex items-center justify-between">
          <div className="flex items-center gap-4">
            <CardTitle className="text-base">Timetable</CardTitle>
            <DisplayToggleButtons
              displayConfig={localDisplayConfig}
              onToggle={toggleDisplayOption}
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="inline-flex items-center border rounded-md overflow-hidden text-sm h-8 bg-background">
                {/* Left: Download .ics */}
                <Button
                  variant="ghost"
                  onClick={handleExportCalendar}
                  className="gap-2 h-full hover:bg-gray-100 rounded-none"
                  title="Export the term schedule as .ics file, which can be imported into Google Calendar, Outlook, etc."
                >
                  <CalendarArrowDown className="w-4 h-4" />
                  .ics
                </Button>

                {/* Separator */}
                <div className="h-4 w-px bg-border" />

                {/* Right: Expand menu */}
                <Button
                  variant="ghost"
                  onClick={() => setIsIcsMenuExpanded(!isIcsMenuExpanded)}
                  className="h-full hover:bg-gray-100 rounded-none"
                  title={isIcsMenuExpanded ? 'Hide options' : 'Show more options'}
                  aria-expanded={isIcsMenuExpanded}
                  aria-haspopup="true"
                  aria-label="ICS file options"
                >
                  <ChevronDown
                    className={`w-3 h-3 transition-transform ${isIcsMenuExpanded ? 'rotate-180' : ''}`}
                  />
                </Button>
              </div>

              {isIcsMenuExpanded && (
                <div
                  className="absolute top-full left-0 mt-1 w-full min-w-max bg-white border border-gray-200 rounded-md shadow-lg z-[60]"
                  role="menu"
                  aria-label="ICS file options menu"
                >
                  <Button
                    variant="ghost"
                    onClick={handleUndoClick}
                    className="w-full justify-start h-auto flex-col items-start gap-0.5"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Undo className="w-3.5 h-3.5" />
                      Undo Previous Import
                    </div>
                    <div className="text-xs text-gray-500">
                      Upload original .ics to cancel events
                    </div>
                  </Button>
                </div>
              )}
            </div>

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

            {selectedTerm && availableTerms && (
              <TermSelector
                selectedTerm={selectedTerm}
                availableTerms={availableTerms}
                onTermChange={onTermChange}
                variant="button"
              />
            )}
          </div>
        </div>
        {/* #endregion */}

        {/* #region Mobile Layout */}
        {/* Mobile layout: title row, then controls row */}
        <div className="md:hidden">
          <CardTitle className="mb-3">Timetable</CardTitle>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="relative flex-shrink-0">
                <div className="inline-flex items-center border rounded-md overflow-hidden text-sm h-8 bg-background">
                  {/* Left: Download .ics */}
                  <Button
                    variant="ghost"
                    onClick={handleExportCalendar}
                    className="gap-2 h-full hover:bg-gray-100 rounded-none"
                    title="Export the term schedule as .ics file, which can be imported into Google Calendar, Outlook, etc."
                  >
                    <CalendarArrowDown className="w-4 h-4" />
                    <span className="hidden xs:inline">.ics</span>
                  </Button>

                  {/* Separator */}
                  <div className="h-4 w-px bg-border" />

                  {/* Right: Expand menu */}
                  <Button
                    variant="ghost"
                    onClick={() => setIsIcsMenuExpanded(!isIcsMenuExpanded)}
                    className="h-full hover:bg-gray-100 rounded-none"
                    title={isIcsMenuExpanded ? 'Hide options' : 'Show more options'}
                    aria-expanded={isIcsMenuExpanded}
                    aria-haspopup="true"
                    aria-label="ICS file options"
                  >
                    <ChevronDown
                      className={`w-3 h-3 transition-transform ${isIcsMenuExpanded ? 'rotate-180' : ''}`}
                    />
                  </Button>
                </div>

                {isIcsMenuExpanded && (
                  <div
                    className="absolute top-full left-0 mt-1 w-full min-w-max bg-white border border-gray-200 rounded-md shadow-lg z-[60]"
                    role="menu"
                    aria-label="ICS file options menu"
                  >
                    <Button
                      variant="ghost"
                      onClick={handleUndoClick}
                      className="w-full justify-start h-auto flex-col items-start gap-0.5"
                    >
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Undo className="w-3.5 h-3.5" />
                        Undo Previous Import
                      </div>
                      <div className="text-xs text-gray-500">
                        Upload original .ics to cancel events
                      </div>
                    </Button>
                  </div>
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleScreenshot}
                disabled={isCapturing}
                className="flex items-center gap-1 cursor-pointer flex-shrink-0"
                title="Download schedule as image"
              >
                <Camera className="w-4 h-4" />
                <span className="hidden xs:inline">
                  {isCapturing ? 'Capturing...' : 'Screenshot'}
                </span>
              </Button>

              {selectedTerm && availableTerms && (
                <TermSelector
                  selectedTerm={selectedTerm}
                  availableTerms={availableTerms}
                  onTermChange={onTermChange}
                  variant="button"
                />
              )}
            </div>
          </div>

          <DisplayToggleButtons displayConfig={localDisplayConfig} onToggle={toggleDisplayOption} />
        </div>
        {/* #endregion */}

        {screenshotError && (
          <p role="alert" className="mt-2 text-center text-sm text-red-600">
            {screenshotError}
          </p>
        )}
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

        <div
          className="h-full max-h-[720px] overflow-auto"
          ref={scrollContainerRef}
          onScroll={handleScroll}
        >
          <div
            ref={calendarRef}
            className="h-full"
            style={{ minWidth: `${minimumCalendarWidth}px` }}
          >
            {/* Sticky Header Row */}
            <div
              className="grid border-gray-200 bg-white sticky top-0 z-50 shadow-xs"
              style={{
                gridTemplateColumns: gridColumns,
                height: `${CALENDAR_LAYOUT_CONSTANTS.STICKY_HEADER_HEIGHT}px`,
              }}
            >
              <div className="h-full flex items-center justify-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 flex-shrink-0 bg-white">
                Time
              </div>
              {days.map((day) => (
                <div
                  key={day}
                  className="h-full flex items-center justify-center text-xs font-medium text-gray-700 border-b border-r border-gray-200 min-w-0 flex-1 bg-white"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Content Grid */}
            <div
              className="grid"
              style={{ gridTemplateColumns: gridColumns }}
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
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      className="flex items-start justify-end pr-1 text-xs text-gray-500 border-b border-gray-100 transition-all duration-300"
                      style={{ height: `${dynamicHourHeight}px` }}
                    >
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
                  .filter((event) => event.day === calendarEventDayIndex)
                  .map((event) => ({
                    ...event,
                    hasConflict: events.some(
                      (other) =>
                        other.id !== event.id &&
                        other.day === event.day &&
                        eventsOverlap(event, other)
                    ),
                  }))

                const eventGroups = groupOverlappingEvents(dayEvents)

                return (
                  <div
                    key={day}
                    className="flex flex-col relative min-w-0 flex-1 border-r border-gray-200 day-column"
                  >
                    {/* Hour slots with dynamic height */}
                    <div className="relative flex-1">
                      {hours.map((hour) => (
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
                        const startTimes = group.map((e) => e.startHour * 60 + e.startMinute)
                        const endTimes = group.map((e) => e.endHour * 60 + e.endMinute)
                        const minStart = Math.min(...startTimes)
                        const maxEnd = Math.max(...endTimes)

                        const zoneTop =
                          timeToPixels(
                            Math.floor(minStart / 60),
                            minStart % 60,
                            calendarConfig.startHour,
                            dynamicHourHeight
                          ) - CALENDAR_LAYOUT_CONSTANTS.COURSE_CARD_PADDING
                        const zoneBottom =
                          timeToPixels(
                            Math.floor(maxEnd / 60),
                            maxEnd % 60,
                            calendarConfig.startHour,
                            dynamicHourHeight
                          ) + CALENDAR_LAYOUT_CONSTANTS.COURSE_CARD_PADDING

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
                              background:
                                'repeating-linear-gradient(45deg, rgba(168, 85, 247, 0.6) 0px, rgba(168, 85, 247, 0.6) 10px, rgba(255, 255, 255, 0.3) 10px, rgba(255, 255, 255, 0.3) 20px)',
                            }}
                            className="border-2 border-purple-500 rounded-sm animate-pulse transition-all duration-300"
                          />
                        )
                      })}

                      {/* Event cards with dynamic time-based positioning */}
                      {eventGroups.map((group) => {
                        return group.map((event, stackIndex) => {
                          const { top, height } = getCardDimensions(
                            event,
                            calendarConfig.startHour,
                            dynamicHourHeight
                          )
                          const isConflicted = group.length > 1
                          const isSelected = selectedEnrollment === event.enrollmentId
                          const textLineLimits = getCardTextLineLimits(height, localDisplayConfig)

                          // Stacking for conflicts
                          const stackOffset = isConflicted
                            ? stackIndex * CALENDAR_LAYOUT_CONSTANTS.CONFLICT_CARD_STACK_OFFSET
                            : 0
                          const rightOffset = isConflicted
                            ? (group.length - 1 - stackIndex) *
                              CALENDAR_LAYOUT_CONSTANTS.CONFLICT_CARD_STACK_OFFSET
                            : 0

                          // Z-index should be lower than sticky header (z-50)
                          let zIndex = isConflicted ? 20 + stackIndex : 10
                          if (isSelected) zIndex = 40 // Lower than header z-50

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
                                )`,
                                }),
                              }}
                              className={`
                              ${event.color}
                              rounded-sm text-xs text-white
                              hover:scale-105 transition-all duration-300 cursor-pointer
                              overflow-hidden group
                              ${isSelected ? 'scale-105' : ''}
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
                                {formatCourseCodeWithSection(
                                  event.subject,
                                  event.courseCode,
                                  event.sectionCode
                                )}
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
                                <div
                                  className={`${TEXT_STYLES.LOCATION} ${
                                    textLineLimits.location === 2 ? 'line-clamp-2' : 'truncate'
                                  }`}
                                >
                                  {event.location}
                                </div>
                              )}

                              {localDisplayConfig.showInstructor && (
                                <div
                                  className={`${TEXT_STYLES.INSTRUCTOR} ${
                                    textLineLimits.instructor === 2 ? 'line-clamp-2' : 'truncate'
                                  }`}
                                >
                                  {formatInstructorsCompact(event.instructors)}
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
      </CardContent>

      {/* Hidden file input for undo ICS upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".ics"
        onChange={handleUndoFileUpload}
        className="hidden"
      />
    </Card>
  )
}

// Display Toggle Buttons Component - data-driven approach eliminates repetition
function DisplayToggleButtons({
  displayConfig,
  onToggle,
}: {
  displayConfig: CalendarDisplayConfig
  onToggle: (option: keyof CalendarDisplayConfig) => void
}) {
  // Configuration-driven button definition - easy to maintain and extend
  const toggleButtons = [
    { key: 'showTitle' as const, label: 'Title' },
    { key: 'showTime' as const, label: 'Time' },
    { key: 'showLocation' as const, label: 'Location' },
    { key: 'showInstructor' as const, label: 'Instructor' },
  ]

  return (
    <div className="flex items-center gap-2">
      <div className="text-xs text-gray-500 font-medium">Show:</div>
      {toggleButtons.map(({ key, label }) => (
        <Button
          key={key}
          variant={displayConfig[key] ? 'default' : 'outline'}
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

// Unscheduled Sections Card Component
function UnscheduledSectionsCard({
  unscheduledSections,
  selectedEnrollment,
  onSelectEnrollment,
  onToggleVisibility,
  displayConfig,
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
        (item) => item.enrollment.courseId === selectedEnrollment
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
                    : `${unscheduledSections.length} Unscheduled Courses`}
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
                        ${isSelected ? 'scale-105' : ''}
                      `}
                      style={
                        isSelected
                          ? {
                              backgroundImage: `repeating-linear-gradient(
                          45deg,
                          transparent,
                          transparent 8px,
                          rgba(255,255,255,0.15) 8px,
                          rgba(255,255,255,0.15) 10px
                        )`,
                            }
                          : {}
                      }
                      onClick={(e) => {
                        e.stopPropagation()
                        if (onSelectEnrollment && item.enrollment.courseId) {
                          const newSelection = isSelected ? null : item.enrollment.courseId
                          onSelectEnrollment(newSelection)
                        }
                      }}
                    >
                      {formatCourseCodeWithPrefix(
                        item.enrollment.course.subject,
                        item.enrollment.course.courseCode,
                        item.section.sectionCode
                      )}
                    </span>
                  )
                })}
              </div>
            </div>

            <div className="flex-shrink-0 ml-2">
              <ChevronDown
                className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              />
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
                      rounded-sm text-xs text-white
                      hover:scale-105 transition-all cursor-pointer
                      overflow-hidden group relative
                      ${isSelected ? 'scale-105' : ''}
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
                        )`,
                      }),
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
                      {formatCourseCodeWithSection(
                        item.enrollment.course.subject,
                        item.enrollment.course.courseCode,
                        item.section.sectionCode
                      )}
                    </div>

                    {displayConfig.showTitle && (
                      <div className={`${TEXT_STYLES.TITLE} truncate`}>
                        {item.enrollment.course.title || 'Course Title'}
                      </div>
                    )}

                    {displayConfig.showTime && (
                      <div className={`${TEXT_STYLES.TIME} truncate`}>
                        {item.meeting.time === 'TBA'
                          ? 'No Set Time'
                          : formatTimeCompact(item.meeting.time)}
                      </div>
                    )}

                    {displayConfig.showLocation && (
                      <div className={`${TEXT_STYLES.LOCATION} truncate`}>
                        {item.meeting.location === 'TBA'
                          ? 'No Set Location'
                          : item.meeting.location}
                      </div>
                    )}

                    {displayConfig.showInstructor && (
                      <div className={`${TEXT_STYLES.INSTRUCTOR} truncate`}>
                        {formatInstructorsCompact(item.meeting.instructors)}
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
