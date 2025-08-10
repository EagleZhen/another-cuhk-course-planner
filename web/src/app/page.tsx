'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import CourseSearch from '@/components/CourseSearch'
import WeeklyCalendar from '@/components/WeeklyCalendar'
import ShoppingCart from '@/components/ShoppingCart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { detectConflicts, enrollmentsToCalendarEvents, getSelectedSectionsForCourse, getDeterministicColor, autoCompleteEnrollmentSections, getUnscheduledSections, type InternalCourse, type CourseEnrollment, type SectionType } from '@/lib/courseUtils'

// Color assignment is now handled in courseUtils.ts

export default function Home() {
  // Reference to CourseSearch's setSearchTerm function
  const setSearchTermRef = useRef<((term: string) => void) | null>(null)
  // Available terms
  const availableTerms = [
    "2025-26 Term 1",
    "2025-26 Term 2", 
    "2025-26 Term 3",
    "2025-26 Term 4",
    "2025-26 Summer Session"
  ]
  
  // Current term state
  const [currentTerm, setCurrentTerm] = useState("2025-26 Term 1")
  
  // Current data format version for localStorage migration
  const SCHEDULE_DATA_VERSION = 1
  
  const [courseEnrollments, setCourseEnrollments] = useState<CourseEnrollment[]>([])
  const [selectedSections, setSelectedSections] = useState<Map<string, string>>(new Map())
  const [selectedEnrollment, setSelectedEnrollment] = useState<string | null>(null)
  const [lastDataUpdate, setLastDataUpdate] = useState<Date | null>(null)
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<Date | null>(null)
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set())
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([])

  // Auto-restore schedule from localStorage when term changes
  useEffect(() => {
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
    } catch (error) {
      console.error('Failed to restore schedule:', error)
      // Clear corrupted localStorage data
      localStorage.removeItem(`schedule_${currentTerm}`)
      setCourseEnrollments([])
    }
  }, [currentTerm, SCHEDULE_DATA_VERSION])

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
  useEffect(() => {
    try {
      if (courseEnrollments.length > 0) {
        const scheduleData = {
          version: SCHEDULE_DATA_VERSION,
          enrollments: courseEnrollments,
          savedAt: new Date().toISOString()
        }
        localStorage.setItem(`schedule_${currentTerm}`, JSON.stringify(scheduleData))
      } else {
        // Remove empty schedule from localStorage to keep it clean
        localStorage.removeItem(`schedule_${currentTerm}`)
      }
    } catch (error) {
      console.error('Failed to save schedule:', error)
    }
  }, [courseEnrollments, currentTerm])

  // Convert enrollments to calendar events with conflict detection
  const calendarEvents = useMemo(() => {
    // Generate events from enrollments
    const events = enrollmentsToCalendarEvents(courseEnrollments)
    
    // Detect conflicts and return
    return detectConflicts(events)
  }, [courseEnrollments])

  // Handle term change - localStorage will handle schedule restoration
  const handleTermChange = (newTerm: string) => {
    setCurrentTerm(newTerm)
    // localStorage useEffect will automatically restore/clear schedule for new term
  }

  const handleToggleVisibility = (enrollmentId: string) => {
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
    
    // If an enrollment is being selected, scroll to shopping cart
    if (enrollmentId) {
      // Use setTimeout to ensure the selection happens first, then scroll
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
    
    // No auto-clear timeout - selection persists for section cycling
  }


  const handleRemoveCourse = (enrollmentId: string) => {
    setCourseEnrollments(prev => 
      prev.filter(enrollment => enrollment.courseId !== enrollmentId)
    )
  }

  const handleSectionChange = (enrollmentId: string, sectionType: string, newSectionId: string) => {
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

  const handleAddCourse = (course: InternalCourse, sectionsMap: Map<string, string>) => {
    const courseKey = `${course.subject}${course.courseCode}`
    
    // Get selected sections for this course
    const selectedSectionsForCourse = getSelectedSectionsForCourse(course, currentTerm, sectionsMap)
    
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
    
    // Clear section selections for this course after adding/updating
    const newSectionsMap = new Map(sectionsMap)
    Array.from(sectionsMap.keys()).forEach(key => {
      if (key.startsWith(`${courseKey}_`)) {
        newSectionsMap.delete(key)
      }
    })
    setSelectedSections(newSectionsMap)
  }

  // Handle data updates from CourseSearch - update timestamp and sync enrollments
  const handleDataUpdate = useCallback((timestamp: Date, allFreshCourses?: InternalCourse[]) => {
    setLastDataUpdate(timestamp)
    console.log(`📊 Course data loaded from: ${timestamp.toLocaleString()}`)
    
    // Background sync: Update existing enrollments with fresh data
    // Use callback form to avoid dependency on courseEnrollments
    setCourseEnrollments(currentEnrollments => {
      if (!allFreshCourses || currentEnrollments.length === 0) {
        return currentEnrollments // No changes needed
      }
      
      // Prevent duplicate syncs for same timestamp
      if (lastSyncTimestamp && Math.abs(timestamp.getTime() - lastSyncTimestamp.getTime()) < 1000) {
        console.log('🔄 Skipping duplicate sync (< 1 second apart)')
        return currentEnrollments
      }
      
      console.log('🔄 Background syncing shopping cart with fresh course data...')
      
      const syncedEnrollments = currentEnrollments.map(enrollment => {
        const courseKey = `${enrollment.course.subject}${enrollment.course.courseCode}`
        
        // Find fresh course data
        const freshCourse = allFreshCourses.find(course => 
          `${course.subject}${course.courseCode}` === courseKey
        )
        
        if (!freshCourse) {
          console.warn(`⚠️ Course ${courseKey} no longer exists in fresh data`)
          // Mark as invalid but preserve for user to see
          return {
            ...enrollment,
            isInvalid: true,
            invalidReason: 'Course no longer available'
          }
        }
        
        // Find fresh sections for current term
        const termData = freshCourse.terms.find(t => t.termName === currentTerm)
        if (!termData) {
          return {
            ...enrollment,
            isInvalid: true,
            invalidReason: 'Course not available in current term'
          }
        }
        
        // Update sections with fresh data
        const syncedSections = enrollment.selectedSections.map(oldSection => {
          const freshSection = termData.sections.find(s => s.id === oldSection.id)
          
          if (!freshSection) {
            console.warn(`⚠️ Section ${oldSection.sectionCode} no longer exists for ${courseKey}`)
            // Keep old section but mark as invalid
            return { ...oldSection, isInvalid: true }
          }
          
          // Merge fresh data with preserved user choices
          return {
            ...freshSection, // Fresh section data (classAttributes, availability, etc.)
            // Preserve any user-specific state if needed in future
          }
        })
        
        // Check if any sections are invalid
        const hasInvalidSections = syncedSections.some(s => s.isInvalid)
        
        return {
          ...enrollment,
          course: freshCourse,           // Always use fresh course data
          selectedSections: syncedSections,
          isInvalid: hasInvalidSections,
          invalidReason: hasInvalidSections ? 'Some sections no longer available' : undefined,
          lastSynced: timestamp,         // Track when we last synced this enrollment
        }
      })
      
      // Log sync results
      const invalidCount = syncedEnrollments.filter(e => e.isInvalid).length
      if (invalidCount > 0) {
        console.warn(`⚠️ ${invalidCount} enrollments have invalid data`)
      } else {
        console.log(`✅ Successfully synced ${syncedEnrollments.length} enrollments`)
      }
      
      // Update sync timestamp after successful sync
      setLastSyncTimestamp(timestamp)
      
      return syncedEnrollments
    })
  }, [currentTerm, lastSyncTimestamp]) // Add lastSyncTimestamp to dependencies

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-4">

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
            />
          </div>
        </div>

        {/* Bottom Section - Course Search (Full Width) */}
        <div className="max-w-7xl mx-auto">
          <Card>
            <CardHeader>
              <div className="space-y-4">
                <div>
                  <CardTitle>Search & Add Courses</CardTitle>
                  <CardDescription>
                    Search by course code, title, or instructor name. Click subjects below to filter.
                  </CardDescription>
                </div>
                
                {/* Available Subjects - Modern Toggle Interface */}
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-700">
                    Available Subjects {availableSubjects.length > 0 && `(${availableSubjects.length})`}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {availableSubjects.length > 0 ? (
                      availableSubjects.map((subject) => (
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
                          }}
                        />
                      ))
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
              onSelectEnrollment={handleSelectEnrollment}     // Event handler prop
              onSearchControlReady={(setSearchTerm) => { setSearchTermRef.current = setSearchTerm }}      // Callback to get search control
              onDataUpdate={handleDataUpdate}         // Data freshness callback
              selectedSubjects={selectedSubjects}     // Subject filter state
              onSubjectFiltersChange={setSelectedSubjects}   // Subject filter callback
              onAvailableSubjectsUpdate={setAvailableSubjects} // Available subjects callback
              />
            </CardContent>
          </Card>
        </div>
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
      className={`h-7 px-3 text-xs font-medium cursor-pointer transition-all duration-200 ${
        isSelected ? 'bg-blue-600 text-white hover:bg-blue-700' : 'hover:bg-blue-50 hover:border-blue-300'
      }`}
      title={isSelected ? `Remove ${subject} filter` : `Filter by ${subject} courses`}
    >
      {subject}
      {isSelected && ' ✓'}
    </Button>
  )
}
