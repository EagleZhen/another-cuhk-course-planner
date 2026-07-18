'use client'

import { useRef, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff, Trash2, AlertTriangle, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import {
  parseSectionTypes,
  sectionSignature,
  formatTimeCompact,
  formatInstructorsCompact,
  formatSyncTimestamp,
  getSectionTypePriority,
  categorizeCompatibleSections,
  getAvailabilityBadges,
  getComputedBorderColor,
  googleSearchAndOpen,
  googleMapsSearchAndOpen,
  formatCourseCodeWithPrefix,
  checkSectionConflict,
  diffSectionDetail,
} from '@/lib/courseUtils'
import type {
  CourseEnrollment,
  CalendarEvent,
  SectionType,
  SectionChange,
  MeetingRow,
} from '@/lib/types'
import { analytics } from '@/lib/analytics'
import { GoogleIcon } from '@/components/icons/GoogleIcon'
import { GoogleMapsIcon } from '@/components/icons/GoogleMapsIcon'

// Shared style for the change-banner's "Show" / "Dismiss all" buttons.
const bannerButtonClass =
  'h-5 rounded border border-amber-300 bg-white/50 px-1.5 text-[10px] text-amber-800 hover:bg-amber-100 cursor-pointer'

// Amber text marks a changed value without shifting the surrounding row.
const changedText = 'rounded bg-amber-100 text-amber-800 cursor-help'

function renderMeetingRow(row: MeetingRow, key: string) {
  const { meeting } = row
  const before = row.status === 'changed' ? row.before : undefined
  const fields = row.status === 'changed' ? row.fields : undefined
  const formattedTime = formatTimeCompact(meeting.time || 'TBA')
  const formattedInstructor = formatInstructorsCompact(meeting.instructor || 'TBA')
  const location = meeting.location || 'TBA'

  let containerClass = 'bg-white border-gray-200'
  let valueClass = 'text-gray-600'
  let tooltip: string | undefined
  let wholeMeetingChange = false

  switch (row.status) {
    case 'unchanged':
      break
    case 'added':
      containerClass = 'bg-amber-50 border-amber-200 cursor-help'
      tooltip = 'New meeting (added since you last checked)'
      wholeMeetingChange = true
      break
    case 'changed':
      break
    case 'removed':
      containerClass = 'bg-amber-50 border-amber-200 cursor-help'
      valueClass = 'text-gray-400 line-through'
      tooltip = 'This meeting was removed since you last checked'
      wholeMeetingChange = true
      break
  }

  return (
    <div
      key={key}
      className={`rounded border px-2 py-1.5 shadow-sm ${containerClass}`}
      title={tooltip}
    >
      {/* Row 1: Time */}
      <div className="flex items-center gap-1 text-[11px]">
        <span>⏰</span>
        <span
          className={`font-mono ${fields?.time ? changedText : valueClass}`}
          title={fields?.time && before ? `Previously ${before.time}` : undefined}
        >
          {formattedTime}
        </span>
      </div>
      {/* Row 2: Instructor */}
      <div className="flex items-center gap-1 text-[11px] mt-1">
        <span>🧑🏻‍🏫</span>
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <span
            className={`truncate ${fields?.instructor ? changedText : valueClass}`}
            title={
              fields?.instructor && before
                ? `Previously ${before.instructor}`
                : wholeMeetingChange
                  ? undefined
                  : formattedInstructor
            }
          >
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
              <GoogleIcon className="size-3" />
            </button>
          )}
        </div>
      </div>
      {/* Row 3: Location */}
      <div className="flex items-center gap-1 text-[11px] mt-1">
        <span>📍</span>
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <span
            className={`truncate ${fields?.location ? changedText : valueClass}`}
            title={
              fields?.location && before
                ? `Previously ${before.location}`
                : wholeMeetingChange
                  ? undefined
                  : location
            }
          >
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
              <GoogleMapsIcon className="size-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

interface ShoppingCartProps {
  courseEnrollments: CourseEnrollment[]
  calendarEvents: CalendarEvent[] // Calendar events for conflict detection
  selectedEnrollment?: string | null // Enrollment ID that was clicked/selected
  currentTerm: string // Current term to get available sections
  onToggleVisibility: (enrollmentId: string) => void
  onRemoveCourse: (enrollmentId: string) => void
  onSelectEnrollment?: (enrollmentId: string | null) => void
  onSectionChange?: (enrollmentId: string, sectionType: string, newSectionId: string) => void
  onShowCourseDetails?: (courseCode: string) => void // Navigate to course search and show details
  sectionChanges?: Map<string, SectionChange[]> // Sections changed since the user last saw them, by courseId
  onDismissAllChanges?: () => void
}

export default function ShoppingCart({
  courseEnrollments,
  calendarEvents,
  selectedEnrollment,
  currentTerm,
  onToggleVisibility,
  onRemoveCourse,
  onSelectEnrollment,
  onSectionChange,
  onShowCourseDetails,
  sectionChanges,
  onDismissAllChanges,
}: ShoppingCartProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Note: Removed unused helper functions - cycling now uses direct compatibility checking

  // Helper function to cycle to next/previous section (compatible sections only - hierarchical priority)
  const cycleSection = (
    enrollment: CourseEnrollment,
    sectionType: string,
    direction: 'next' | 'prev'
  ) => {
    if (!onSectionChange) return

    const currentSection = enrollment.selectedSections.find((s) => s.sectionType === sectionType)
    if (!currentSection) return

    // Get compatible sections considering ONLY HIGHER priority constraints (hierarchical)
    const sectionTypes = parseSectionTypes(enrollment.course, currentTerm)
    const typeGroup = sectionTypes.find((group) => group.type === sectionType)
    if (!typeGroup) return

    // Only constrain by HIGHER priority sections (lower priority numbers)
    const currentPriority = getSectionTypePriority(sectionType as SectionType, sectionTypes)
    const higherPrioritySelections = enrollment.selectedSections.filter((s) => {
      const sPriority = getSectionTypePriority(s.sectionType, sectionTypes)
      return sPriority < currentPriority // Higher priority (lower number)
    })

    const { compatible } = categorizeCompatibleSections(
      typeGroup.sections,
      higherPrioritySelections
    )

    if (compatible.length <= 1) {
      console.debug(
        `No compatible alternatives for ${sectionType} in ${enrollment.course.subject}${enrollment.course.courseCode}`
      )
      return // No alternatives to cycle through
    }

    const currentIndex = compatible.findIndex((s) => s.id === currentSection.id)
    if (currentIndex === -1) return

    let newIndex
    if (direction === 'next') {
      newIndex = (currentIndex + 1) % compatible.length
    } else {
      newIndex = currentIndex === 0 ? compatible.length - 1 : currentIndex - 1
    }

    const newSection = compatible[newIndex]
    console.debug(
      `Cycling ${enrollment.course.subject}${enrollment.course.courseCode} ${sectionType}: ${currentSection.sectionCode} → ${newSection.sectionCode}`
    )
    console.debug(
      `Compatible sections for ${sectionType} (constrained by higher priority only):`,
      compatible.map((s) => s.sectionCode)
    )

    // Track section cycling for product analytics
    analytics.sectionCycled(`${enrollment.course.subject}${enrollment.course.courseCode}`)

    onSectionChange(enrollment.courseId, sectionType, newSection.id)
  }

  // Scroll a course card into view within the cart container, if not already fully visible.
  // Shared by the selection effect and the "Show" button so both scroll reliably.
  const scrollEnrollmentIntoView = useCallback((enrollmentId: string) => {
    const container = scrollContainerRef.current
    const element = itemRefs.current.get(enrollmentId)
    if (!container || !element) return

    const containerStyle = window.getComputedStyle(container)
    const containerPaddingTop = parseInt(containerStyle.paddingTop) || 0

    // Use getBoundingClientRect for cross-platform reliability
    const containerRect = container.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()
    const elementTopInContainer = elementRect.top - containerRect.top + container.scrollTop

    // Position element at top of container with comfortable padding
    const idealScrollTop = elementTopInContainer - containerPaddingTop - 16

    // Only scroll if element is not fully visible
    const elementBottom = elementTopInContainer + element.offsetHeight
    const visibleTop = container.scrollTop
    const visibleBottom = container.scrollTop + container.clientHeight

    if (elementTopInContainer < visibleTop || elementBottom > visibleBottom) {
      container.scrollTo({ top: Math.max(0, idealScrollTop), behavior: 'smooth' })
    }
  }, [])

  // Auto-scroll the selected course into view within the shopping cart container.
  useEffect(() => {
    if (selectedEnrollment) scrollEnrollmentIntoView(selectedEnrollment)
  }, [selectedEnrollment, scrollEnrollmentIntoView])

  const conflictCount = calendarEvents.filter((event) => event.hasConflict).length

  // Helper function to calculate visible/total counts for different statuses
  const getStatusCounts = () => {
    const validEnrollments = courseEnrollments.filter((enrollment) => !enrollment.isInvalid)
    const visibleValidEnrollments = validEnrollments.filter((enrollment) => enrollment.isVisible)

    return {
      // Credit counts
      visibleCredits: visibleValidEnrollments.reduce(
        (sum, enrollment) => sum + enrollment.course.credits,
        0
      ),
      totalCredits: validEnrollments.reduce(
        (sum, enrollment) => sum + enrollment.course.credits,
        0
      ),

      // Status counts
      open: {
        visible: visibleValidEnrollments.filter((enrollment) =>
          enrollment.selectedSections.every((section) => section.availability.status === 'Open')
        ).length,
        total: validEnrollments.filter((enrollment) =>
          enrollment.selectedSections.every((section) => section.availability.status === 'Open')
        ).length,
      },
      waitlisted: {
        visible: visibleValidEnrollments.filter((enrollment) =>
          enrollment.selectedSections.some(
            (section) => section.availability.status === 'Waitlisted'
          )
        ).length,
        total: validEnrollments.filter((enrollment) =>
          enrollment.selectedSections.some(
            (section) => section.availability.status === 'Waitlisted'
          )
        ).length,
      },
      closed: {
        visible: visibleValidEnrollments.filter((enrollment) =>
          enrollment.selectedSections.some((section) => section.availability.status === 'Closed')
        ).length,
        total: validEnrollments.filter((enrollment) =>
          enrollment.selectedSections.some((section) => section.availability.status === 'Closed')
        ).length,
      },
      conflicts: {
        visible: calendarEvents.filter((event) => event.hasConflict && event.isVisible).length,
        total: conflictCount,
      },
      invalid: {
        visible: courseEnrollments.filter(
          (enrollment) => enrollment.isInvalid && enrollment.isVisible
        ).length,
        total: courseEnrollments.filter((enrollment) => enrollment.isInvalid).length,
      },
    }
  }

  const statusCounts = getStatusCounts()

  // Changed courses in cart order; "Show" selects the next one (reusing the select/scroll
  // path that clicking a card or calendar event uses) so the user can step through changes.
  const changedCourseIds = courseEnrollments
    .filter((e) => sectionChanges?.has(e.courseId))
    .map((e) => e.courseId)
  const showNextChange = () => {
    if (!onSelectEnrollment || changedCourseIds.length === 0) return
    const current = changedCourseIds.indexOf(selectedEnrollment ?? '')
    const next = changedCourseIds[(current + 1) % changedCourseIds.length]
    onSelectEnrollment(next)
    // Scroll directly too: when next is already the selected course, selectedEnrollment
    // doesn't change, so the selection effect wouldn't re-fire on its own.
    scrollEnrollmentIntoView(next)
  }

  return (
    <Card className="h-[800px] flex flex-col gap-1 py-2 pt-4" data-shopping-cart>
      <CardHeader className="pb-0 pt-1 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Shopping Cart</CardTitle>
          <Badge
            variant="secondary"
            className="text-xs"
            title={(() => {
              const visibleCount = courseEnrollments.filter(
                (enrollment) => enrollment.isVisible
              ).length
              const totalCount = courseEnrollments.length

              if (visibleCount === totalCount) {
                return `${totalCount} ${totalCount === 1 ? 'course' : 'courses'} in shopping cart`
              }

              return `${visibleCount} visible, ${totalCount} total ${totalCount === 1 ? 'course' : 'courses'} in shopping cart`
            })()}
          >
            {(() => {
              const visibleCount = courseEnrollments.filter(
                (enrollment) => enrollment.isVisible
              ).length
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
      </CardHeader>

      {sectionChanges && sectionChanges.size > 0 ? (
        <div
          className="flex cursor-help items-center justify-between gap-2 border-y border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800"
          title={`CUHK updated the teaching timetable for ${Array.from(sectionChanges.keys()).join(', ')}. Re-export your calendar and update any screenshot you saved.`}
        >
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
            <span>
              {sectionChanges.size} {sectionChanges.size === 1 ? 'course' : 'courses'} changed
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {onSelectEnrollment && (
              <Button
                variant="ghost"
                size="sm"
                onClick={showNextChange}
                className={bannerButtonClass}
                title="Scroll to the next changed course"
              >
                Show
              </Button>
            )}
            {onDismissAllChanges && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDismissAllChanges}
                className={bannerButtonClass}
              >
                Dismiss all
              </Button>
            )}
          </span>
        </div>
      ) : (
        <div className="border-t flex-shrink-0" />
      )}

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
            className="space-y-3 overflow-y-auto h-full p-1 pr-2 pt-1 pb-2"
          >
            {courseEnrollments.map((enrollment) => {
              const isVisible = enrollment.isVisible // Use enrollment visibility directly
              const isSelected = selectedEnrollment === enrollment.courseId
              const isInvalid = enrollment.isInvalid // Check if enrollment has invalid data
              const isCourseRemoved = enrollment.invalidReason === 'Course no longer available'
              const invalidMessage = isCourseRemoved
                ? `This course is no longer offered in ${currentTerm}. It's off your timetable but stays here until you're ready to remove it.`
                : enrollment.invalidReason
              const changes = sectionChanges?.get(enrollment.courseId)

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
                    border rounded p-2 transition-all duration-300 relative group space-y-2
                    border-l-4 border-gray-200
                    ${isInvalid ? 'bg-orange-50 opacity-75' : 'bg-white'}
                    ${isSelected && isVisible && !isInvalid ? `ring-1 shadow-lg scale-[1.02]` : ''}
                    ${!isVisible || isInvalid ? 'cursor-not-allowed' : 'cursor-pointer'}
                  `}
                  style={{
                    ...(isInvalid
                      ? {
                          borderLeftColor: '#fb923c', // orange-400 for invalid courses
                        }
                      : enrollment.color
                        ? {
                            borderLeftColor: getComputedBorderColor(enrollment.color), // course color for normal/conflict courses
                          }
                        : {}),
                    // Ring color matches the left border color when selected
                    ...(isSelected && isVisible && !isInvalid && enrollment.color
                      ? {
                          '--tw-ring-color': getComputedBorderColor(enrollment.color),
                        }
                      : {}),
                  }}
                  title={
                    !isVisible && !isInvalid
                      ? 'Course is hidden from calendar. Click the eye icon to show it and enable selection.'
                      : isInvalid
                        ? invalidMessage || 'Course data is outdated'
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
                  {/* Icon buttons are `size-5` (not `h-full aspect-square`) to match this row's `h-5` — Safari resolves stretch+aspect-ratio differently and renders the button past the card's edge. */}
                  <div className="flex h-5 items-stretch justify-between gap-1">
                    <div
                      className={`flex min-w-0 flex-1 items-stretch gap-1 ${!isVisible && !isInvalid ? 'opacity-50' : ''}`}
                    >
                      <span className="flex h-full shrink-0 items-center text-sm font-semibold leading-5">
                        {formatCourseCodeWithPrefix(
                          enrollment.course.subject,
                          enrollment.course.courseCode,
                          enrollment.selectedSections[0]?.sectionCode || ''
                        )}
                      </span>
                      {onShowCourseDetails && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            onShowCourseDetails(
                              `${enrollment.course.subject}${enrollment.course.courseCode}`
                            )
                          }}
                          className="size-5 p-0 cursor-pointer"
                          title="View course details"
                        >
                          <Search className="size-3.5 text-gray-400 hover:text-gray-600" />
                        </Button>
                      )}
                      {isInvalid && (
                        <div
                          className="flex size-5 items-center justify-center"
                          title={invalidMessage || 'Course data is outdated'}
                        >
                          <AlertTriangle className="size-3.5 text-orange-500" />
                        </div>
                      )}
                      <span className="flex h-full shrink-0 items-center text-xs font-medium leading-5 text-gray-500">
                        {enrollment.course.credits} credits
                      </span>
                    </div>

                    {/* Quick Actions */}
                    <div className="flex shrink-0 items-stretch gap-1">
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
                        className="size-5 p-0 cursor-pointer"
                        title={isVisible ? 'Hide course' : 'Show course'}
                      >
                        {isVisible ? (
                          <Eye className="size-3.5 text-gray-600" />
                        ) : (
                          <EyeOff className="size-3.5 text-gray-400" />
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
                        className="size-5 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                        title="Remove course"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Course Title */}
                  <p
                    className={`-mt-1 text-xs leading-4 text-gray-600 ${!isVisible && !isInvalid ? 'opacity-50' : ''}`}
                  >
                    {enrollment.course.title}
                  </p>

                  {/* Selected Sections - Compact Display or Invalid Message */}
                  {isInvalid ? (
                    /* Show simplified invalid state */
                    <div className="bg-orange-50 border border-orange-200 rounded px-3 py-2">
                      <div className="flex items-start gap-2 text-xs leading-4 text-orange-600">
                        <AlertTriangle className="mt-0.5 size-4 flex-shrink-0 text-orange-500" />
                        {isCourseRemoved ? (
                          <div className="min-w-0">
                            <p className="font-medium text-orange-700">
                              This course is no longer offered in {currentTerm}.
                            </p>
                            <p className="mt-1">
                              It&apos;s off your timetable but stays here until you&apos;re ready to
                              remove it.
                            </p>
                          </div>
                        ) : (
                          <span>{invalidMessage}</span>
                        )}
                      </div>
                      {enrollment.lastSynced && (
                        <div className="mt-2 text-xs text-gray-500">
                          Last synced · {formatSyncTimestamp(enrollment.lastSynced)}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Show normal section details */
                    <div className={`space-y-2 ${!isVisible && !isInvalid ? 'opacity-50' : ''}`}>
                      {enrollment.selectedSections.map((section) => {
                        // Get compatible alternatives considering ONLY HIGHER priority constraints (hierarchical)
                        const sectionTypes = parseSectionTypes(enrollment.course, currentTerm)
                        const typeGroup = sectionTypes.find(
                          (group) => group.type === section.sectionType
                        )
                        if (!typeGroup) return null

                        // Only constrain by HIGHER priority sections (lower priority numbers)
                        const higherPrioritySelections = enrollment.selectedSections.filter((s) => {
                          const sPriority = getSectionTypePriority(s.sectionType, sectionTypes)
                          const currentPriority = getSectionTypePriority(
                            section.sectionType,
                            sectionTypes
                          )
                          return sPriority < currentPriority // Higher priority (lower number)
                        })

                        const { compatible } = categorizeCompatibleSections(
                          typeGroup.sections,
                          higherPrioritySelections
                        )

                        const canCycle = compatible.length > 1
                        const currentIndex = compatible.findIndex((s) => s.id === section.id)
                        const sectionPosition = `${currentIndex + 1}/${compatible.length}`
                        const conflictInfo = checkSectionConflict(section, courseEnrollments)
                        const sectionChange = changes?.find((c) => c.sectionId === section.id)
                        const changeDetail = sectionChange
                          ? diffSectionDetail(section, sectionChange.before)
                          : undefined
                        const meetingRows: MeetingRow[] =
                          changeDetail?.rows ??
                          sectionSignature(section).meetings.map((meeting) => ({
                            status: 'unchanged',
                            meeting,
                          }))

                        return (
                          <div
                            key={section.id}
                            className={`rounded border px-2 py-2 ${conflictInfo.hasConflict ? 'bg-purple-50 border-purple-300 ring-1 ring-purple-100' : 'bg-gray-50'}`}
                          >
                            {/* Section header with cycling buttons */}
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <div className="text-xs font-mono font-medium text-gray-800">
                                  {section.sectionCode}
                                </div>
                                {conflictInfo.hasConflict && (
                                  <div
                                    title={`Conflicts with: ${conflictInfo.conflictingSections.join(', ')}`}
                                  >
                                    <AlertTriangle className="h-3 w-3 flex-shrink-0 text-purple-600" />
                                  </div>
                                )}
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
                                <Badge
                                  variant="outline"
                                  className="text-[9px] px-1 py-0 h-4 text-gray-500 border-gray-300"
                                >
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
                              <div className="flex items-center gap-1 text-[9px] mb-2 text-gray-500">
                                <span className="flex-shrink-0">🌐</span>
                                <span
                                  className={`truncate ${changeDetail?.languageChanged ? changedText : ''}`}
                                  title={
                                    changeDetail?.languageChanged && sectionChange
                                      ? `Previously ${sectionChange.before.language || 'not specified'}`
                                      : `Language of instruction: ${section.classAttributes}`
                                  }
                                >
                                  {section.classAttributes}
                                </span>
                              </div>
                            )}

                            {/* Meeting rows are normalized and deduped by sectionSignature. */}
                            <div className="space-y-1">
                              {meetingRows.map((row, index) =>
                                renderMeetingRow(
                                  row,
                                  row.status === 'removed' ? `removed-${index}` : `live-${index}`
                                )
                              )}
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
        <div className="border-t px-3 py-2 flex-shrink-0 space-y-2">
          {/* Row 1: Credits + time conflicts (optional) */}
          <div className="flex justify-between text-xs text-gray-600">
            <span
              title={
                statusCounts.visibleCredits === statusCounts.totalCredits
                  ? `${statusCounts.totalCredits.toFixed(1)} total credits from enrolled courses`
                  : `${statusCounts.visibleCredits.toFixed(1)} visible credits, ${statusCounts.totalCredits.toFixed(1)} total credits from enrolled courses`
              }
            >
              {statusCounts.visibleCredits === statusCounts.totalCredits
                ? `${statusCounts.totalCredits.toFixed(1)} credits`
                : `${statusCounts.visibleCredits.toFixed(1)} / ${statusCounts.totalCredits.toFixed(1)} credits`}
            </span>
            {statusCounts.conflicts.total > 0 && (
              <div
                className="flex items-center gap-1 text-purple-500"
                title="Selected sections have time conflicts"
              >
                <AlertTriangle className="w-3 h-3" />
                <span>Conflicts Detected</span>
              </div>
            )}
          </div>

          {/* Row 2: Open, Waitlisted, Closed (all optional) */}
          {(() => {
            // Only show row 2 if there's any status info to display
            const hasStatusInfo =
              statusCounts.open.total > 0 ||
              statusCounts.waitlisted.total > 0 ||
              statusCounts.closed.total > 0 ||
              statusCounts.invalid.total > 0

            return (
              hasStatusInfo && (
                <div className="flex items-center justify-between text-xs">
                  {statusCounts.open.total > 0 && (
                    <div
                      className="flex items-center gap-1 text-green-600"
                      title={
                        statusCounts.open.visible === statusCounts.open.total
                          ? `${statusCounts.open.total} courses are open for enrollment`
                          : `${statusCounts.open.visible} visible, ${statusCounts.open.total} total courses are open for enrollment`
                      }
                    >
                      <span className="w-2 h-2 bg-green-600 rounded-full"></span>
                      <span>
                        {statusCounts.open.visible === statusCounts.open.total
                          ? `${statusCounts.open.total} Open`
                          : `${statusCounts.open.visible}/${statusCounts.open.total} Open`}
                      </span>
                    </div>
                  )}
                  {statusCounts.waitlisted.total > 0 && (
                    <div
                      className="flex items-center gap-1 text-yellow-600"
                      title={
                        statusCounts.waitlisted.visible === statusCounts.waitlisted.total
                          ? `${statusCounts.waitlisted.total} courses require waitlist enrollment`
                          : `${statusCounts.waitlisted.visible} visible, ${statusCounts.waitlisted.total} total courses require waitlist enrollment`
                      }
                    >
                      <AlertTriangle className="w-3 h-3" />
                      <span>
                        {statusCounts.waitlisted.visible === statusCounts.waitlisted.total
                          ? `${statusCounts.waitlisted.total} Waitlisted`
                          : `${statusCounts.waitlisted.visible}/${statusCounts.waitlisted.total} Waitlisted`}
                      </span>
                    </div>
                  )}
                  {statusCounts.closed.total > 0 && (
                    <div
                      className="flex items-center gap-1 text-red-600"
                      title={
                        statusCounts.closed.visible === statusCounts.closed.total
                          ? `${statusCounts.closed.total} courses are closed for enrollment`
                          : `${statusCounts.closed.visible} visible, ${statusCounts.closed.total} total courses are closed for enrollment`
                      }
                    >
                      <AlertTriangle className="w-3 h-3" />
                      <span>
                        {statusCounts.closed.visible === statusCounts.closed.total
                          ? `${statusCounts.closed.total} Closed`
                          : `${statusCounts.closed.visible}/${statusCounts.closed.total} Closed`}
                      </span>
                    </div>
                  )}
                  {statusCounts.invalid.total > 0 && (
                    <div
                      className="flex items-center gap-1 text-orange-500"
                      title={
                        statusCounts.invalid.visible === statusCounts.invalid.total
                          ? `${statusCounts.invalid.total} courses have outdated or invalid data`
                          : `${statusCounts.invalid.visible} visible, ${statusCounts.invalid.total} total courses have outdated or invalid data`
                      }
                    >
                      <AlertTriangle className="w-3 h-3" />
                      <span>
                        {statusCounts.invalid.visible === statusCounts.invalid.total
                          ? `${statusCounts.invalid.total} Invalid`
                          : `${statusCounts.invalid.visible}/${statusCounts.invalid.total} Invalid`}
                      </span>
                    </div>
                  )}
                </div>
              )
            )
          })()}
        </div>
      )}
    </Card>
  )
}
