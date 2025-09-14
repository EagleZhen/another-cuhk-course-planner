'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'

// Proper hydration handling without suppressing warnings
import CourseSearch from '@/components/CourseSearch'
import WeeklyCalendar from '@/components/WeeklyCalendar'
import ShoppingCart from '@/components/ShoppingCart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { detectConflicts, enrollmentsToCalendarEvents, getDeterministicColor, autoCompleteEnrollmentSections, getUnscheduledSections, parseSectionTypes } from '@/lib/courseUtils'
import type { InternalCourse, CourseEnrollment, SectionType, InternalSection } from '@/lib/types'
import { analytics } from '@/lib/analytics'
import { useAppConfig } from '@/lib/appConfig'

// Color assignment is now handled in courseUtils.ts

export default function Home() {
  // Reference to CourseSearch's setSearchTerm function
  const setSearchTermRef = useRef<((term: string, fromCourseDetails?: boolean) => void) | null>(null)

  // App configuration with persistence - single source of hydration truth
  const { config, updateConfig, isHydrated } = useAppConfig()

  // Available terms (TODO: make dynamic)
  const availableTerms = useMemo(() => [
    "2025-26 Term 1",
    "2025-26 Term 2",
    "2025-26 Term 3",
    "2025-26 Term 4",
    "2025-26 Summer Session",
    "2025-26 Acad Year (Medicine)"
  ], [])

  // Current term from config
  const currentTerm = config.currentTerm || availableTerms[0]
  
  // Current data format version for localStorage migration
  const SCHEDULE_DATA_VERSION = 1
  
  const [courseEnrollments, setCourseEnrollments] = useState<CourseEnrollment[]>([])
  const [selectedSections, setSelectedSections] = useState<Map<string, string>>(new Map())
  const [selectedEnrollment, setSelectedEnrollment] = useState<string | null>(null)
  const [lastDataUpdate, setLastDataUpdate] = useState<Date | null>(null)
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<Date | null>(null)
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set())
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([])
  const [showSelectedOnly, setShowSelectedOnly] = useState<boolean>(false)
  const [subjectSearchTerm, setSubjectSearchTerm] = useState('')
  
  // Conflict resolution tracking
  const [lastResolutionMethod, setLastResolutionMethod] = useState<string | null>(null)
  
  // Term-specific subject filter persistence (session state only)
  const [subjectFiltersByTerm, setSubjectFiltersByTerm] = useState<Map<string, Set<string>>>(new Map())

  // Initialize currentTerm if empty (only after app config is hydrated)
  useEffect(() => {
    if (isHydrated && !config.currentTerm) {
      updateConfig('currentTerm', availableTerms[0])
    }
  }, [config.currentTerm, updateConfig, availableTerms, isHydrated])

  // Auto-restore schedule from localStorage when term changes (client-side only)
  useEffect(() => {
    // Only run after hydration to prevent SSR/client mismatch
    if (!isHydrated) return
    
    try {
      const savedData = localStorage.getItem(`schedule_${currentTerm}`)
      if (savedData) {
        const parsedData = JSON.parse(savedData)
        
        // Handle both old format (array) and new format (versioned object)
        let parsedSchedule: CourseEnrollment[]
        if (Array.isArray(parsedData)) {
          // Old format - just array of enrollments
          console.log('📦 Detected old localStorage format, migrating...')
          parsedSchedule = parsedData
        } else if (parsedData.version === SCHEDULE_DATA_VERSION) {
          // Current format - versioned object
          parsedSchedule = parsedData.enrollments
          console.log(`✅ Loaded schedule data version ${parsedData.version}`)
        } else {
          // Unknown version - clear and start fresh
          console.warn(`⚠️ Unknown schedule data version: ${parsedData.version}, clearing...`)
          localStorage.removeItem(`schedule_${currentTerm}`)
          setCourseEnrollments([])
          setSelectedSections(new Map())
          return
        }
        
        // Validate and migrate enrollment data
        const migratedSchedule = parsedSchedule.map((enrollment) => {
          const courseKey = `${enrollment.course.subject}${enrollment.course.courseCode}`
          
          // Migrate courseId if it's in old format (contains underscore + timestamp)
          let migratedCourseId = enrollment.courseId
          if (enrollment.courseId && enrollment.courseId.includes('_') && enrollment.courseId !== courseKey) {
            console.log(`🔄 Migrating courseId: ${enrollment.courseId} → ${courseKey}`)
            migratedCourseId = courseKey
          }
          
          // Validate required fields
          if (!enrollment.course?.subject || !enrollment.course?.courseCode) {
            console.warn('⚠️ Invalid enrollment data, skipping:', enrollment)
            return null
          }
          
          return {
            ...enrollment,
            courseId: migratedCourseId, // Use migrated courseId
            color: getDeterministicColor(courseKey), // Regenerate color for consistency
            isVisible: enrollment.isVisible ?? true // Default to visible if undefined
          }
        }).filter(Boolean) // Remove invalid enrollments
        
        setCourseEnrollments(migratedSchedule as CourseEnrollment[])
        console.log(`✅ Restored ${migratedSchedule.length} enrollments for ${currentTerm}`)
      } else {
        // No saved schedule for this term, start fresh
        setCourseEnrollments([])
      }
      // Clear section selections when switching terms
      setSelectedSections(new Map())
      
      // Restore subject filters from session state (term-specific)
      const termFilters = subjectFiltersByTerm.get(currentTerm) || new Set()
      setSelectedSubjects(termFilters)
      
    } catch (error) {
      console.error('Failed to restore schedule:', error)
      // Clear corrupted localStorage data
      localStorage.removeItem(`schedule_${currentTerm}`)
      setCourseEnrollments([])
      setSelectedSubjects(new Set())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- subjectFiltersByTerm would cause infinite loop
  }, [currentTerm, SCHEDULE_DATA_VERSION, isHydrated])

  // Save subject filters to session state whenever they change
  useEffect(() => {
    setSubjectFiltersByTerm(prev => {
      const updated = new Map(prev)
      updated.set(currentTerm, selectedSubjects)
      return updated
    })
  }, [selectedSubjects, currentTerm])

  // Separate effect to migrate selectedEnrollment after enrollments are loaded
  useEffect(() => {
    if (selectedEnrollment && selectedEnrollment.includes('_') && courseEnrollments.length > 0) {
      const migratedEnrollment = courseEnrollments.find(enrollment => {
        const oldCourseId = selectedEnrollment
        const courseKey = `${enrollment.course.subject}${enrollment.course.courseCode}`
        return oldCourseId.startsWith(courseKey + '_')
      })
      
      if (migratedEnrollment) {
        console.log(`🔄 Migrating selectedEnrollment: ${selectedEnrollment} → ${migratedEnrollment.courseId}`)
        setSelectedEnrollment(migratedEnrollment.courseId)
      } else {
        // Clear invalid selection
        setSelectedEnrollment(null)
      }
    }
  }, [courseEnrollments, selectedEnrollment])

  // Auto-save schedule to localStorage whenever courseEnrollments changes
  // Only after hydration to prevent deleting data on initial load
  useEffect(() => {
    // Don't save/delete during initial hydration
    if (!isHydrated) return
    
    try {
      if (courseEnrollments.length > 0) {
        const scheduleData = {
          version: SCHEDULE_DATA_VERSION,
          enrollments: courseEnrollments,
          savedAt: new Date().toISOString()
        }
        localStorage.setItem(`schedule_${currentTerm}`, JSON.stringify(scheduleData))
        console.log(`💾 Saved ${courseEnrollments.length} enrollments for ${currentTerm}`)
      } else {
        // Only remove if we're sure this is intentional (after hydration)
        localStorage.removeItem(`schedule_${currentTerm}`)
        console.log(`🗑️ Cleared empty schedule for ${currentTerm}`)
      }
    } catch (error) {
      console.error('Failed to save schedule:', error)
    }
  }, [courseEnrollments, currentTerm, isHydrated])

  // Convert enrollments to calendar events with conflict detection
  const calendarEvents = useMemo(() => {
    // Generate events from enrollments
    const events = enrollmentsToCalendarEvents(courseEnrollments)
    
    // Detect conflicts and return
    return detectConflicts(events)
  }, [courseEnrollments])

  // Track conflict resolution when conflicts are resolved after user actions
  useEffect(() => {
    const hasConflicts = calendarEvents.some(event => event.hasConflict)
    
    // If we had a recent resolution method tracked and no conflicts remain, track successful resolution
    if (lastResolutionMethod && !hasConflicts) {
      analytics.conflictResolved(lastResolutionMethod)
      setLastResolutionMethod(null) // Reset after tracking
    }
  }, [calendarEvents, lastResolutionMethod])

  // Handle term change - localStorage will handle schedule restoration
  const handleTermChange = (newTerm: string) => {
    // Track term access for planning behavior analysis
    analytics.termAccessed(newTerm)

    // Update config with persistence
    updateConfig('currentTerm', newTerm)
    // localStorage useEffect will automatically restore/clear schedule for new term
  }

  const handleToggleVisibility = (enrollmentId: string) => {
    // Check if there are conflicts and we're hiding a course (for conflict resolution tracking)
    const hasConflicts = calendarEvents.some(event => event.hasConflict)
    const targetEnrollment = courseEnrollments.find(e => e.courseId === enrollmentId)
    
    if (hasConflicts && targetEnrollment?.isVisible) {
      // Only track when hiding a visible course during conflicts
      setLastResolutionMethod('course_hiding')
    }
    
    // Track general visibility toggle behavior (regardless of conflicts)
    if (targetEnrollment) {
      const courseKey = `${targetEnrollment.course.subject}${targetEnrollment.course.courseCode}`
      const action = targetEnrollment.isVisible ? 'hidden' : 'shown'
      analytics.courseVisibilityToggled(courseKey, action)
    }
    
    setCourseEnrollments(prev => 
      prev.map(enrollment => 
        enrollment.courseId === enrollmentId 
          ? { ...enrollment, isVisible: !enrollment.isVisible }
          : enrollment
      )
    )
  }

  const handleSelectEnrollment = (enrollmentId: string | null) => {
    setSelectedEnrollment(enrollmentId)
    // Container-level scrolling is handled by ShoppingCart component
    // No page-level scrolling needed for side-by-side layout
  }

  const handleScrollToCart = (enrollmentId: string) => {
    // Set selection (same as handleSelectEnrollment)
    setSelectedEnrollment(enrollmentId)
    
    // Scroll to shopping cart area (user-requested navigation)
    setTimeout(() => {
      const shoppingCartElement = document.querySelector('[data-shopping-cart]')
      if (shoppingCartElement) {
        shoppingCartElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        })
      }
    }, 100)
  }

  const handleShowCourseDetails = (courseCode: string) => {
    // Auto-populate search term and scroll to first course result
    if (setSearchTermRef.current) {
      setSearchTermRef.current(courseCode, true) // Pass true to indicate this is from course details
    }
    
    // Scroll to first course card with a slight delay to allow results to load
    setTimeout(() => {
      const firstCourseCard = document.querySelector('[data-course-search] .space-y-3 > div:first-child')
      if (firstCourseCard) {
        // Get the sticky header height to offset scroll position
        const stickyHeader = document.querySelector('[data-course-search] .sticky')
        const headerHeight = stickyHeader ? stickyHeader.getBoundingClientRect().height : 0
        const additionalPadding = 16 // Add some breathing room
        
        // Calculate target position accounting for sticky header
        const elementRect = firstCourseCard.getBoundingClientRect()
        const targetY = window.pageYOffset + elementRect.top - headerHeight - additionalPadding
        
        window.scrollTo({
          top: targetY,
          behavior: 'smooth'
        })
      } else {
        // Fallback to course search section if no results found yet
        const courseSearchElement = document.querySelector('[data-course-search]')
        if (courseSearchElement) {
          courseSearchElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
          })
        }
      }
    }, 300) // Slightly longer delay to allow search debouncing and result rendering
  }


  const handleRemoveCourse = (enrollmentId: string) => {
    // Check if there are conflicts before removal (for conflict resolution tracking)
    const hasConflicts = calendarEvents.some(event => event.hasConflict)
    if (hasConflicts) {
      setLastResolutionMethod('course_removal')
    }
    
    // Track general course removal behavior (regardless of conflicts)
    const targetEnrollment = courseEnrollments.find(e => e.courseId === enrollmentId)
    if (targetEnrollment) {
      const courseKey = `${targetEnrollment.course.subject}${targetEnrollment.course.courseCode}`
      analytics.courseRemoved(courseKey, targetEnrollment.course.subject)
    }
    
    setCourseEnrollments(prev => 
      prev.filter(enrollment => enrollment.courseId !== enrollmentId)
    )
  }

  const handleSectionChange = (enrollmentId: string, sectionType: string, newSectionId: string) => {
    // Check if there are conflicts before section change (for conflict resolution tracking)
    const hasConflicts = calendarEvents.some(event => event.hasConflict)
    if (hasConflicts) {
      setLastResolutionMethod('section_cycling')
    }
    
    setCourseEnrollments(prev => 
      prev.map(enrollment => {
        if (enrollment.courseId !== enrollmentId) return enrollment
        
        // Use smart auto-completion to handle section changes with hierarchical logic
        const updatedSections = autoCompleteEnrollmentSections(
          enrollment,
          sectionType as SectionType,
          newSectionId,
          enrollment.course,
          currentTerm
        )
        
        return {
          ...enrollment,
          selectedSections: updatedSections
        }
      })
    )
  }

  const handleAddCourse = (course: InternalCourse, termName: string, localSelections: Map<string, string>) => {
    const courseKey = `${course.subject}${course.courseCode}`
    
    // Convert local selections to actual section objects directly
    const sectionTypes = parseSectionTypes(course, termName)
    const selectedSectionsForCourse: InternalSection[] = []
    
    for (const [sectionType, sectionId] of localSelections) {
      const typeGroup = sectionTypes.find(tg => tg.type === sectionType)
      if (typeGroup) {
        const section = typeGroup.sections.find(s => s.id === sectionId)
        if (section) {
          selectedSectionsForCourse.push(section)
        }
      }
    }
    
    if (selectedSectionsForCourse.length === 0) {
      return // No valid sections selected
    }
    
    // Check if course is already enrolled
    const existingEnrollmentIndex = courseEnrollments.findIndex(enrollment => 
      enrollment.course.subject === course.subject && enrollment.course.courseCode === course.courseCode
    )
    
    
    if (existingEnrollmentIndex >= 0) {
      // Update existing enrollment with new sections
      setCourseEnrollments(prev => 
        prev.map((enrollment, index) => 
          index === existingEnrollmentIndex 
            ? { ...enrollment, selectedSections: selectedSectionsForCourse }
            : enrollment
        )
      )
    } else {
      // Add new enrollment
      const assignedColor = getDeterministicColor(courseKey)
      
      const newEnrollment: CourseEnrollment = {
        courseId: courseKey,
        course,
        selectedSections: selectedSectionsForCourse,
        color: assignedColor,
        isVisible: true
      }
      
      setCourseEnrollments(prev => [...prev, newEnrollment])
    }
    
    // Track course enrollment for product analytics
    analytics.courseAdded(`${course.subject}${course.courseCode}`, course.subject, termName)
    
    // Clear global section selections for this course after adding/updating
    const newSectionsMap = new Map(selectedSections)
    Array.from(selectedSections.keys()).forEach(key => {
      if (key.startsWith(`${courseKey}_`)) {
        newSectionsMap.delete(key)
      }
    })
    setSelectedSections(newSectionsMap)
  }

  // Store fresh course data for sync validation
  const [freshCourseData, setFreshCourseData] = useState<InternalCourse[] | null>(null)

  // Handle data updates from CourseSearch - just update timestamp and store fresh data
  const handleDataUpdate = useCallback((timestamp: Date, allFreshCourses?: InternalCourse[]) => {
    setLastDataUpdate(timestamp)
    console.log(`📊 Course data loaded from: ${timestamp.toLocaleString()}`)

    // Store fresh course data for one-time sync after localStorage restore
    if (allFreshCourses) {
      setFreshCourseData(allFreshCourses) // Store fresh data for sync
      setLastSyncTimestamp(timestamp) // Mark when fresh data arrived
      console.log(`📋 Fresh course data available: ${allFreshCourses.length} courses`)
    }
  }, [])

  // One-time sync that runs after both data loading and localStorage restore complete
  useEffect(() => {
    // Only sync if we have all required data: fresh courses, localStorage enrollments, and sync timestamp
    if (!lastSyncTimestamp || !freshCourseData || courseEnrollments.length === 0) {
      return
    }

    // Check if we've already synced this data load
    if (lastDataUpdate && lastSyncTimestamp.getTime() === lastDataUpdate.getTime()) {
      console.log('📋 Sync already completed for this data load, skipping')
      return
    }

    console.log('🔄 Running one-time sync to validate localStorage courses against fresh catalog data')

    // Perform sync validation
    const syncedEnrollments = courseEnrollments.map(enrollment => {
      const courseKey = `${enrollment.course.subject}${enrollment.course.courseCode}`

      // Find fresh course data
      const freshCourse = freshCourseData.find(course =>
        `${course.subject}${course.courseCode}` === courseKey
      )

      if (!freshCourse) {
        console.warn(`⚠️ Course ${courseKey} no longer exists in fresh data`)
        return {
          ...enrollment,
          isInvalid: true,
          invalidReason: 'Course no longer available',
          lastSynced: lastSyncTimestamp
        }
      }

      // Use the enrollment's stored term for validation
      const enrollmentTerm = enrollment.termName
      if (!enrollmentTerm) {
        console.warn(`⚠️ Course ${courseKey}: No term information in enrollment`)
        return enrollment
      }

      const termData = freshCourse.terms.find(t => t.termName === enrollmentTerm)
      if (!termData) {
        console.warn(`⚠️ Course ${courseKey}: Term "${enrollmentTerm}" not found in fresh data`)
        return {
          ...enrollment,
          isInvalid: true,
          invalidReason: 'Course not available in current term',
          lastSynced: lastSyncTimestamp
        }
      }

      // Update sections with fresh data
      const syncedSections = enrollment.selectedSections.map(oldSection => {
        const freshSection = termData.sections.find(s => s.id === oldSection.id)

        if (!freshSection) {
          console.warn(`⚠️ Section ${oldSection.sectionCode} no longer exists for ${courseKey}`)
          return { ...oldSection, isInvalid: true }
        }

        // Return fresh section data with updated availability
        return freshSection
      })

      // Check if any sections are invalid
      const hasInvalidSections = syncedSections.some(s => s.isInvalid)

      return {
        ...enrollment,
        course: freshCourse, // Always use fresh course data
        selectedSections: syncedSections,
        isInvalid: hasInvalidSections,
        invalidReason: hasInvalidSections ? 'Some sections no longer available' : undefined,
        lastSynced: lastSyncTimestamp
      }
    })

    // Apply synced enrollments if there were changes
    const hasChanges = syncedEnrollments.some((synced, index) =>
      JSON.stringify(synced) !== JSON.stringify(courseEnrollments[index])
    )

    if (hasChanges) {
      const invalidCount = syncedEnrollments.filter(e => e.isInvalid).length
      if (invalidCount > 0) {
        console.warn(`⚠️ ${invalidCount} enrollments have invalid data after sync`)
      } else {
        console.log(`✅ Successfully synced ${syncedEnrollments.length} enrollments`)
      }

      setCourseEnrollments(syncedEnrollments)
    } else {
      console.log(`✅ All ${courseEnrollments.length} enrollments remain valid after sync`)
    }

    // Mark this data load as synced
    setLastSyncTimestamp(lastDataUpdate)

  }, [lastSyncTimestamp, freshCourseData, courseEnrollments, lastDataUpdate])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-2">

        {/* Top Section - Calendar + Shopping Cart */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 max-w-7xl mx-auto mb-4">
          {/* Calendar (3/4 width - more space) */}
          <div className="lg:col-span-3">
            <div className="h-[800px]">
              <WeeklyCalendar
                events={calendarEvents}
                unscheduledSections={getUnscheduledSections(courseEnrollments)}
                selectedTerm={currentTerm}
                availableTerms={availableTerms}
                selectedEnrollment={selectedEnrollment}
                onTermChange={handleTermChange}
                onToggleVisibility={handleToggleVisibility}
                onSelectEnrollment={handleSelectEnrollment}
              />
            </div>
          </div>

          {/* Shopping Cart (1/4 width - more compact) */}
          <div>
            <ShoppingCart 
              courseEnrollments={courseEnrollments}
              calendarEvents={calendarEvents}
              selectedEnrollment={selectedEnrollment}
              currentTerm={currentTerm}
              lastDataUpdate={lastDataUpdate}
              onToggleVisibility={handleToggleVisibility}
              onRemoveCourse={handleRemoveCourse}
              onSelectEnrollment={handleSelectEnrollment}
              onSectionChange={handleSectionChange}
              onShowCourseDetails={handleShowCourseDetails}
            />
          </div>
        </div>

        {/* Bottom Section - Course Search (Full Width) */}
        <div className="max-w-7xl mx-auto" data-course-search>
          <Card className="gap-0">
            <CardHeader>
              <div className="space-y-2">
                <div>
                  <CardTitle>Search & Add Courses</CardTitle>
                  <CardDescription>
                    Search by course code, title, or instructor name. Click subjects below to filter.
                  </CardDescription>
                </div>
                
                {/* Available Subjects - Modern Toggle Interface */}
                <div className="space-y-2">
                  {/* Desktop layout: title and controls in one row */}
                  <SubjectFilterControls
                    layout="horizontal"
                    availableSubjects={availableSubjects}
                    selectedSubjects={selectedSubjects}
                    showSelectedOnly={showSelectedOnly}
                    subjectSearchTerm={subjectSearchTerm}
                    onToggleShowSelected={() => setShowSelectedOnly(!showSelectedOnly)}
                    onClearAll={() => {
                      setSelectedSubjects(new Set())
                      setSubjectSearchTerm('')
                    }}
                    onSubjectSearchChange={setSubjectSearchTerm}
                    className="hidden sm:flex"
                  />

                  {/* Mobile layout: title and controls stacked */}
                  <SubjectFilterControls
                    layout="vertical"
                    availableSubjects={availableSubjects}
                    selectedSubjects={selectedSubjects}
                    showSelectedOnly={showSelectedOnly}
                    subjectSearchTerm={subjectSearchTerm}
                    onToggleShowSelected={() => setShowSelectedOnly(!showSelectedOnly)}
                    onClearAll={() => {
                      setSelectedSubjects(new Set())
                      setSubjectSearchTerm('')
                    }}
                    onSubjectSearchChange={setSubjectSearchTerm}
                    className="sm:hidden"
                  />
                  <div className="flex gap-2 flex-wrap">
                    {availableSubjects.length > 0 ? (
                      (() => {
                        // Apply both search filter and selection filter
                        let subjectsToShow = availableSubjects
                        
                        // Apply search filter first
                        if (subjectSearchTerm.trim()) {
                          subjectsToShow = subjectsToShow.filter(subject => 
                            subject.toLowerCase().includes(subjectSearchTerm.toLowerCase().trim())
                          )
                        }
                        
                        // Then apply selection filter if needed
                        if (showSelectedOnly) {
                          subjectsToShow = subjectsToShow.filter(subject => selectedSubjects.has(subject))
                        }
                        
                        if (subjectsToShow.length === 0) {
                          if (showSelectedOnly) {
                            return (
                              <div className="text-xs text-gray-500">
                                No subjects selected. Select some subjects or click &ldquo;Show All&rdquo; to see available options.
                              </div>
                            )
                          } else if (subjectSearchTerm.trim()) {
                            return (
                              <div className="text-xs text-gray-500">
                                No subjects found matching &ldquo;{subjectSearchTerm}&rdquo;. Try a different search term.
                              </div>
                            )
                          }
                        }
                        
                        return subjectsToShow.map((subject) => (
                          <SubjectToggle
                            key={subject}
                            subject={subject}
                            isSelected={selectedSubjects.has(subject)}
                            onSubjectToggle={(subject: string) => {
                              const newSelection = new Set(selectedSubjects)
                              if (newSelection.has(subject)) {
                                newSelection.delete(subject)
                              } else {
                                newSelection.add(subject)
                              }
                              setSelectedSubjects(newSelection)
                              
                              // Track subject exploration for UX optimization
                              analytics.subjectToggled(subject)
                            }}
                          />
                        ))
                      })()
                    ) : (
                      <div className="text-xs text-gray-500">Discovering subjects...</div>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <CourseSearch 
              onAddCourse={handleAddCourse}           // Event handler prop
              onRemoveCourse={handleRemoveCourse}     // Event handler prop
              courseEnrollments={courseEnrollments}   // Data prop / State prop
              currentTerm={currentTerm}               // Data prop / State prop
              availableTerms={availableTerms}         // Data prop
              onTermChange={handleTermChange}         // Event handler prop
              selectedSections={selectedSections}     // Data prop / State prop
              onSelectedSectionsChange={setSelectedSections}  // Callback prop / State setter prop
              onScrollToCart={handleScrollToCart}             // Scroll to cart handler prop (selection + scroll)
              onSearchControlReady={(setSearchTerm) => { setSearchTermRef.current = setSearchTerm }}      // Callback to get search control
              onDataUpdate={handleDataUpdate}         // Data freshness callback
              selectedSubjects={selectedSubjects}     // Subject filter state
              onAvailableSubjectsUpdate={setAvailableSubjects} // Available subjects callback
              />
            </CardContent>
          </Card>
        </div>
        
        {/* Inspired Footer */}
        <footer className="mt-16 mb-8 text-center">
          <div className="space-y-2">
            <div className="text-sm text-slate-400 italic font-light tracking-wide">
              <a
                href="https://www.youtube.com/watch?v=YS2KB_cFrTo"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-slate-600 transition-colors duration-200"
              >
                &ldquo;There&apos;s more to explore here.&rdquo;
              </a>
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Crafted by{' '}
              <a
                href="https://www.youtube.com/@EagleZhen"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-600 hover:text-slate-900 transition-colors duration-200"
              >
                EZ
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

// Persistent Subject Filter Toggle Component
function SubjectToggle({ 
  subject, 
  isSelected,
  onSubjectToggle 
}: { 
  subject: string
  isSelected: boolean
  onSubjectToggle: (subject: string) => void 
}) {
  return (
    <Button
      variant={isSelected ? "default" : "outline"}
      size="sm"
      onClick={() => onSubjectToggle(subject)}
      className="h-6 px-2 text-xs font-mono font-normal border-1"
      title={isSelected ? `Remove ${subject} filter` : `Filter by ${subject} courses`}
    >
      {subject}
    </Button>
  )
}

// Reusable Subject Filter Controls Component
function SubjectFilterControls({
  layout = 'horizontal',
  availableSubjects,
  selectedSubjects,
  showSelectedOnly,
  subjectSearchTerm,
  onToggleShowSelected,
  onClearAll,
  onSubjectSearchChange,
  className
}: {
  layout?: 'horizontal' | 'vertical'
  availableSubjects: string[]
  selectedSubjects: Set<string>
  showSelectedOnly: boolean
  subjectSearchTerm: string
  onToggleShowSelected: () => void
  onClearAll: () => void
  onSubjectSearchChange: (term: string) => void
  className?: string
}) {
  const isVertical = layout === 'vertical'
  const hasSubjects = selectedSubjects.size > 0 || availableSubjects.length > 0
  
  return (
    <div className={`${isVertical ? 'space-y-2' : 'text-sm font-medium text-gray-700 items-center gap-3'} ${className || ''}`}>
      <div className={`flex items-center gap-3 ${isVertical ? 'flex-col items-start' : ''}`}>
        <div className={isVertical ? 'text-sm font-medium text-gray-700' : ''}>
          Available Subjects {availableSubjects.length > 0 && `(${showSelectedOnly ? selectedSubjects.size : availableSubjects.length})`}
        </div>
        
        {/* Compact search input */}
        {hasSubjects && (
          <input
            type="text"
            placeholder="Search subjects..."
            value={subjectSearchTerm}
            onChange={(e) => onSubjectSearchChange(e.target.value)}
            className="h-6 px-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 w-32"
          />
        )}
      </div>
      
      {/* Show controls when subjects are selected OR when there are available subjects */}
      {hasSubjects && (
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleShowSelected}
            className="h-5 px-2 text-xs font-normal text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-full cursor-pointer"
            title={showSelectedOnly ? "Show all subjects" : "Show selected subjects only"}
          >
            {showSelectedOnly ? "Show All" : "Show Selected Only"}
          </Button>
          {selectedSubjects.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={onClearAll}
              className="h-5 px-2 text-xs font-normal cursor-pointer"
              title="Clear all subject filters and search"
            >
              ✕ Clear Subjects
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
