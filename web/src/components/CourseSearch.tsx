'use client'

import { useState, useEffect, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronDown, ChevronUp, Plus, X, Info, Trash2, Search, ShoppingCart, Users, Clock } from 'lucide-react'
import { parseSectionTypes, isCourseEnrollmentComplete, getUniqueMeetings, getSectionPrefix, categorizeCompatibleSections, getSelectedSectionsForCourse, clearIncompatibleLowerSelections, getSectionTypePriority, formatTimeCompact, formatInstructorCompact, getAvailabilityBadges, type InternalCourse, type CourseEnrollment, type SectionType } from '@/lib/courseUtils'
import { transformExternalCourseData } from '@/lib/validation'

// Using clean internal types only


interface CourseSearchProps {
  onAddCourse: (course: InternalCourse, sectionsMap: Map<string, string>) => void
  onRemoveCourse: (courseKey: string) => void
  courseEnrollments: CourseEnrollment[]
  currentTerm: string
  availableTerms?: string[]
  onTermChange?: (term: string) => void
  selectedSections: Map<string, string>
  onSelectedSectionsChange: (sections: Map<string, string>) => void
  onSelectEnrollment?: (enrollmentId: string | null) => void
  onSearchControlReady?: (setSearchTerm: (term: string) => void) => void
  onDataUpdate?: (timestamp: Date, allCourses?: InternalCourse[]) => void // Callback when data is loaded
  selectedSubjects?: Set<string> // Subject filter
  onSubjectFiltersChange?: (subjects: Set<string>) => void
  onAvailableSubjectsUpdate?: (subjects: string[]) => void // Callback when subjects are discovered
}

export default function CourseSearch({ 
  onAddCourse,
  onRemoveCourse, 
  courseEnrollments,
  currentTerm,
  availableTerms = [],
  onTermChange,
  selectedSections,
  onSelectedSectionsChange,
  onSelectEnrollment,
  onSearchControlReady,
  onDataUpdate,
  selectedSubjects = new Set(),
  onSubjectFiltersChange,
  onAvailableSubjectsUpdate
}: CourseSearchProps) {
  const [searchTerm, setSearchTerm] = useState('')
  
  // Expose search function to parent
  useEffect(() => {
    if (onSearchControlReady) {
      onSearchControlReady(setSearchTerm)
    }
  }, [onSearchControlReady])

  const [loading, setLoading] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState({ loaded: 0, total: 0, currentSubject: '' })
  const [performanceStats, setPerformanceStats] = useState<{
    totalLoadTime?: number
    subjectLoadTimes: { subject: string, time: number, size: number }[]
    totalDataSize: number
  }>({
    subjectLoadTimes: [],
    totalDataSize: 0
  })
  const [allCourses, setAllCourses] = useState<InternalCourse[]>([])
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([])
  const [isTermDropdownOpen, setIsTermDropdownOpen] = useState(false)
  const [hasDataLoaded, setHasDataLoaded] = useState(false)

  // Calculate subjects that actually have courses in current term
  const subjectsWithCourses = useMemo(() => {
    if (availableSubjects.length === 0 || allCourses.length === 0) {
      return []
    }
    
    const subjectsInTerm = new Set<string>()
    allCourses.forEach(course => {
      if (course.terms.some(term => term.termName === currentTerm)) {
        subjectsInTerm.add(course.subject)
      }
    })
    
    // Filter available subjects to only include those with courses in current term
    return availableSubjects.filter(subject => subjectsInTerm.has(subject))
  }, [availableSubjects, allCourses, currentTerm])

  // Notify parent when available subjects are discovered
  useEffect(() => {
    if (subjectsWithCourses.length > 0 && onAvailableSubjectsUpdate) {
      onAvailableSubjectsUpdate(subjectsWithCourses)
    }
  }, [subjectsWithCourses, onAvailableSubjectsUpdate])

  // Helper function to check if course is already enrolled
  const isCourseAdded = (course: InternalCourse) => {
    return courseEnrollments.some(enrollment => 
      enrollment.course.subject === course.subject && enrollment.course.courseCode === course.courseCode
    )
  }

  // Helper function to get enrolled course for comparison
  const getEnrolledCourse = (course: InternalCourse): CourseEnrollment | null => {
    return courseEnrollments.find(enrollment => 
      enrollment.course.subject === course.subject && enrollment.course.courseCode === course.courseCode
    ) || null
  }

  // Helper function to check if current selections differ from enrolled selections
  const hasSelectionsChanged = (course: InternalCourse): boolean => {
    const enrolled = getEnrolledCourse(course)
    if (!enrolled) return false
    
    const currentSelections = getSelectedSectionsForCourse(course, currentTerm, selectedSections)
    
    // Compare section IDs
    if (currentSelections.length !== enrolled.selectedSections.length) return true
    
    return currentSelections.some(currentSection => 
      !enrolled.selectedSections.some(enrolledSection => 
        enrolledSection.id === currentSection.id
      )
    )
  }

  // Load course data on component mount and when term changes
  useEffect(() => {
    // Skip loading if data is already loaded this session for this term
    if (hasDataLoaded) {
      console.log('📦 Course data already loaded this session, skipping reload')
      return
    }

    const loadCourseData = async () => {
      setLoading(true)
      
      // Performance tracking
      const startTime = performance.now()
      const subjectLoadTimes: { subject: string, time: number, size: number }[] = []
      let totalDataSize = 0
      
      try {
        // Dynamically discover available subjects by fetching the directory index
        console.log(`📂 Discovering available subjects from data directory...`)
        setLoadingProgress({ loaded: 0, total: 1, currentSubject: 'Discovering subjects...' })
        
        let discoveredSubjects: string[] = []
        
        try {
          // Try to fetch the term-specific index (most accurate)
          const termIndexResponse = await fetch(`/data/Index ${currentTerm}.json`)
          if (termIndexResponse.ok) {
            const termIndexData = await termIndexResponse.json()
            if (Array.isArray(termIndexData.metadata?.subjects)) {
              discoveredSubjects = termIndexData.metadata.subjects.sort()
              console.log(`📂 Loaded ${discoveredSubjects.length} subjects from term-specific index (${currentTerm}): ${discoveredSubjects.join(', ')}`)
            }
          }
        } catch {
          console.log(`📂 Failed to load term-specific index for ${currentTerm}`)
        }
        
        // If no subjects found, something is wrong
        if (discoveredSubjects.length === 0) {
          console.error(`❌ No subjects found for term: ${currentTerm}`)
          console.error(`   Make sure the index file exists: /data/Index ${currentTerm}.json`)
          throw new Error(`No subjects available for ${currentTerm}`)
        }
        
        console.log(`📂 Discovered ${discoveredSubjects.length} available subjects: ${discoveredSubjects.join(', ')}`)
        
        // Store discovered subjects for parent component
        setAvailableSubjects(discoveredSubjects)
        const availableSubjects: string[] = [...discoveredSubjects]

        setLoadingProgress({ loaded: 0, total: availableSubjects.length, currentSubject: '' })

        const allCoursesData: InternalCourse[] = []
        const scrapingTimestamps: Date[] = []
        let successCount = 0

        // Load each subject file with performance tracking
        for (let i = 0; i < availableSubjects.length; i++) {
          const subject = availableSubjects[i]
          setLoadingProgress({ loaded: i, total: availableSubjects.length, currentSubject: subject })
          
          const subjectStartTime = performance.now()
          
          try {
            const response = await fetch(`/data/${subject}.json`)
            if (response.ok) {
              const rawData = await response.json()
              const subjectEndTime = performance.now()
              
              // Calculate approximate data size (rough estimate)
              const dataSize = JSON.stringify(rawData).length
              totalDataSize += dataSize
              
              const loadTime = subjectEndTime - subjectStartTime
              subjectLoadTimes.push({ 
                subject, 
                time: Math.round(loadTime), 
                size: Math.round(dataSize / 1024) // KB
              })
              
              // Extract scraping timestamp from metadata
              if (rawData.metadata?.scraped_at) {
                try {
                  const scrapedAt = new Date(rawData.metadata.scraped_at)
                  scrapingTimestamps.push(scrapedAt)
                  console.log(`📅 ${subject} scraped at: ${scrapedAt.toLocaleString()}`)
                } catch {
                  console.warn(`Invalid scraped_at timestamp in ${subject}.json:`, rawData.metadata.scraped_at)
                }
              }
              
              // Validate data structure
              if (rawData.courses && Array.isArray(rawData.courses)) {
                const transformedData = transformExternalCourseData(rawData)
                allCoursesData.push(...transformedData.courses)
                successCount++
                console.log(`✅ ${subject}: ${transformedData.courses.length} courses, ${Math.round(dataSize / 1024)}KB, ${Math.round(loadTime)}ms`)
              } else {
                console.warn(`Invalid data structure in ${subject}.json`)
              }
            } else {
              console.warn(`Failed to load ${subject}.json: ${response.status}`)
              subjectLoadTimes.push({ subject, time: 0, size: 0 })
            }
          } catch (error) {
            console.warn(`Failed to load ${subject} data:`, error)
            subjectLoadTimes.push({ subject, time: 0, size: 0 })
          }
        }

        // Calculate total load time and log performance summary
        const totalLoadTime = performance.now() - startTime
        
        console.log(`📚 Loaded ${allCoursesData.length} total courses from ${successCount}/${availableSubjects.length} subjects`)
        console.log(`⚡ Performance Summary:`)
        console.log(`   Total load time: ${Math.round(totalLoadTime)}ms (${(totalLoadTime/1000).toFixed(1)}s)`)
        console.log(`   Total data size: ${Math.round(totalDataSize / 1024)}KB (${(totalDataSize / 1024 / 1024).toFixed(1)}MB)`)
        console.log(`   Average per subject: ${Math.round(totalLoadTime / availableSubjects.length)}ms`)
        
        // Log detailed per-subject performance
        if (subjectLoadTimes.length > 0) {
          console.log(`   Per-subject breakdown:`)
          subjectLoadTimes
            .filter(s => s.time > 0)
            .sort((a, b) => b.time - a.time) // Sort by load time (slowest first)
            .forEach(s => console.log(`     ${s.subject}: ${s.time}ms, ${s.size}KB`))
        }
        
        // Store performance stats for potential UI display
        setPerformanceStats({
          totalLoadTime: Math.round(totalLoadTime),
          subjectLoadTimes,
          totalDataSize: Math.round(totalDataSize / 1024) // KB
        })
        
        if (successCount === 0) {
          console.error('❌ No course data could be loaded - check that /data/ files exist')
        }
        
        setAllCourses(allCoursesData)
        setHasDataLoaded(true) // Mark data as loaded for this session
        
        // Find the oldest scraping timestamp and notify parent
        if (scrapingTimestamps.length > 0 && onDataUpdate) {
          const oldestTimestamp = new Date(Math.min(...scrapingTimestamps.map(d => d.getTime())))
          console.log(`🕒 Oldest data from: ${oldestTimestamp.toLocaleString()} (${scrapingTimestamps.length} files checked)`)
          onDataUpdate(oldestTimestamp, allCoursesData) // Pass both timestamp and fresh course data for sync
        }
        
      } catch (error) {
        console.error('Failed to load course data:', error)
      } finally {
        setLoading(false)
        setLoadingProgress({ loaded: 0, total: 0, currentSubject: '' })
      }
    }

    loadCourseData()
  }, [onDataUpdate, currentTerm, hasDataLoaded]) // Re-run when term changes to get term-specific subjects

  // Real-time search with useMemo for performance, filtered by current term
  // Helper function to open Google search for course reviews
  const searchCourseReviews = (course: InternalCourse) => {
    const query = `CUHK ${course.subject} ${course.courseCode} review`
    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`
    window.open(googleSearchUrl, '_blank', 'noopener,noreferrer')
  }

  // Helper function to open Google search for instructor
  const searchInstructor = (instructorName: string) => {
    const query = `${instructorName}`
    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`
    window.open(googleSearchUrl, '_blank', 'noopener,noreferrer')
  }

  const searchResults = useMemo(() => {
    // First filter by term - only show courses available in current term
    let filteredCourses = allCourses.filter(course => 
      course.terms.some(term => term.termName === currentTerm)
    )
    
    // Apply subject filter if any subjects are selected
    if (selectedSubjects.size > 0) {
      filteredCourses = filteredCourses.filter(course => 
        selectedSubjects.has(course.subject)
      )
    }
    
    // Determine if user has applied any filters or search
    const hasFiltersOrSearch = searchTerm.trim() || selectedSubjects.size > 0
    
    // Apply search term filter if provided
    let finalCourses = filteredCourses
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase()
      finalCourses = filteredCourses.filter(course => {
        // Create full course code without space for searching
        const fullCourseCode = `${course.subject}${course.courseCode}`.toLowerCase()
        
        return (
          fullCourseCode.includes(searchLower) ||
          course.courseCode.toLowerCase().includes(searchLower) ||
          course.title.toLowerCase().includes(searchLower) ||
          course.terms.some(term =>
            term.sections.some(section =>
              section.meetings.some(meeting =>
                meeting.instructor.toLowerCase().includes(searchLower)
              )
            )
          )
        )
      })
    }

    // Simple limiting logic based on user intent
    const limit = hasFiltersOrSearch ? 100 : 10

    return {
      courses: finalCourses.slice(0, limit),
      total: finalCourses.length,
      isLimited: finalCourses.length > limit
    }
  }, [searchTerm, allCourses, currentTerm, selectedSubjects])

  return (
    <div className="space-y-4">
      {/* Sticky Search Input with Term Filter Hint */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 pb-4 -mx-4 px-4 pt-4">
        <div className="w-full space-y-2">
          <Input
            type="text"
            placeholder="Search courses (e.g., UGFH1000, In Dialogue with Humanity, YU Bei)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <Info className="w-3 h-3" />
            <span>Showing courses available in</span>
            {availableTerms.length > 0 && onTermChange ? (
              <div className="relative">
                <button
                  onClick={() => setIsTermDropdownOpen(!isTermDropdownOpen)}
                  className={`inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer ${isTermDropdownOpen ? 'relative z-50' : ''}`}
                  title="Click to change term"
                >
                  <span>{currentTerm}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                
                {isTermDropdownOpen && (
                  <>
                    {/* Backdrop */}
                    <div 
                      className="fixed inset-0 z-40 cursor-pointer" 
                      onClick={() => setIsTermDropdownOpen(false)}
                    />
                    
                    {/* Dropdown */}
                    <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-md shadow-lg min-w-[200px]">
                      <div className="py-1">
                        {availableTerms.map(term => (
                          <button
                            key={term}
                            type="button"
                            className={`block w-full text-left px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer ${
                              term === currentTerm ? 'bg-blue-50 text-blue-600' : 'text-gray-900'
                            }`}
                            onClick={() => {
                              onTermChange?.(term)
                              setIsTermDropdownOpen(false)
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
            ) : (
              <strong>{currentTerm}</strong>
            )}
            {selectedSubjects.size > 0 && (
              <>
                <span>filtered by</span>
                <span className="font-semibold text-blue-600">
                  {Array.from(selectedSubjects).sort().join(', ')}
                </span>
                <span>({selectedSubjects.size} subject{selectedSubjects.size !== 1 ? 's' : ''})</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Search Results with Natural Flow */}
      <div className="space-y-3 pb-8">
        {loading ? (
          <div className="text-center py-8 text-gray-500">
            <div className="space-y-2">
              <div>Loading course data...</div>
              {loadingProgress.total > 0 && (
                <>
                  <div className="text-sm">
                    {loadingProgress.currentSubject && (
                      <div>Loading {loadingProgress.currentSubject}...</div>
                    )}
                    <div>
                      {loadingProgress.loaded}/{loadingProgress.total} subjects
                      {loadingProgress.total > 0 && (
                        <span className="ml-2">
                          ({Math.round((loadingProgress.loaded / loadingProgress.total) * 100)}%)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mx-auto max-w-xs">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-200" 
                      style={{ 
                        width: `${loadingProgress.total > 0 ? (loadingProgress.loaded / loadingProgress.total) * 100 : 0}%` 
                      }}
                    ></div>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : searchResults.courses.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {searchTerm ? 'No courses found' : 'No courses available'}
          </div>
        ) : (
          <>
            <div className="text-sm text-gray-600 mb-3">
              Showing {searchResults.courses.length} course{searchResults.courses.length !== 1 ? 's' : ''}
              {searchResults.total > searchResults.courses.length && (
                <span className="font-medium"> of {searchResults.total} total</span>
              )}
              {searchTerm && ` matching "${searchTerm}"`}
            </div>
            
            {/* Show helpful message when results are limited */}
            {searchResults.isLimited && (
              <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                <div className="flex items-start gap-2">
                  <span className="text-amber-600 text-3xl">💡</span>
                  <div>
                    <strong>Too many results to display.</strong>
                    <br />
                    <span className="text-amber-600">Try searching for specific course codes or adding more subject filters to narrow results.</span>
                  </div>
                </div>
              </div>
            )}
            
            <div className="space-y-3">
              {searchResults.courses.map((course, index) => (
                <CourseCard
                  key={`${course.subject}-${course.courseCode}-${index}`} 
                  course={course}
                  currentTerm={currentTerm}
                  selectedSections={selectedSections}
                  onSearchReviews={searchCourseReviews}
                  onSearchInstructor={searchInstructor}
                  onSectionToggle={(courseKey, sectionType, sectionId) => {
                    const newMap = new Map(selectedSections)
                    const selectionKey = `${courseKey}_${sectionType}`
                    
                    if (newMap.get(selectionKey) === sectionId) {
                      // Remove selection
                      newMap.delete(selectionKey)
                      onSelectedSectionsChange(newMap)
                    } else {
                      // Set new selection (replaces any existing selection for this type)
                      newMap.set(selectionKey, sectionId)
                      
                      // Find the course to get section types for cascade clearing
                      const targetCourse = searchResults.courses.find(c => `${c.subject}${c.courseCode}` === courseKey)
                      if (targetCourse) {
                        const sectionTypes = parseSectionTypes(targetCourse, currentTerm)
                        // Clear any lower-priority incompatible selections
                        const clearedMap = clearIncompatibleLowerSelections(
                          newMap, 
                          courseKey, 
                          sectionType as SectionType, // Type assertion for section type compatibility
                          sectionId, 
                          sectionTypes, 
                          targetCourse, 
                          currentTerm
                        )
                        onSelectedSectionsChange(clearedMap)
                      } else {
                        onSelectedSectionsChange(newMap)
                      }
                    }
                  }}
                  onAddCourse={onAddCourse}
                  onRemoveCourse={onRemoveCourse}
                  isAdded={isCourseAdded(course)}
                  hasSelectionsChanged={hasSelectionsChanged(course)}
                  onSelectEnrollment={onSelectEnrollment}
                  courseEnrollments={courseEnrollments}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function CourseCard({ 
  course, 
  currentTerm, 
  selectedSections, 
  onSearchReviews,
  onSearchInstructor,
  onSectionToggle, 
  onAddCourse,
  onRemoveCourse, 
  isAdded,
  hasSelectionsChanged,
  onSelectEnrollment,
  courseEnrollments
}: { 
  course: InternalCourse
  currentTerm: string
  selectedSections: Map<string, string>
  onSearchReviews: (course: InternalCourse) => void
  onSearchInstructor: (instructorName: string) => void
  onSectionToggle: (courseKey: string, sectionType: string, sectionId: string) => void
  onAddCourse: (course: InternalCourse, sectionsMap: Map<string, string>) => void
  onRemoveCourse: (courseKey: string) => void
  isAdded: boolean
  hasSelectionsChanged: boolean
  onSelectEnrollment?: (enrollmentId: string | null) => void
  courseEnrollments: CourseEnrollment[]
}) {
  const [expanded, setExpanded] = useState(false)
  const courseKey = `${course.subject}${course.courseCode}`
  const sectionTypes = parseSectionTypes(course, currentTerm)
  
  // Get enrolled course for this course
  const enrolledCourse = courseEnrollments.find(enrollment => 
    enrollment.course.subject === course.subject && enrollment.course.courseCode === course.courseCode
  )
  const isEnrollmentComplete = isCourseEnrollmentComplete(course, currentTerm, selectedSections)

  // Get unique instructors from current term
  const currentTermData = course.terms.find(term => term.termName === currentTerm)
  const instructors = Array.from(new Set(
    currentTermData?.sections.flatMap(section =>
      section.meetings.flatMap(meeting => {
        // Split instructor names by comma if multiple instructors are listed together
        const instructorString = meeting.instructor || ''
        return instructorString.split(',').map(name => name.trim()).filter(Boolean)
      })
    ) || []
  )).filter(Boolean)

  return (
    <Card 
      className={`py-5 gap-0 transition-all duration-200 ${
        !expanded 
          ? 'hover:shadow-lg hover:bg-gray-50 cursor-pointer' 
          : 'shadow-md'
      }`}
      onClick={!expanded ? () => setExpanded(true) : undefined}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">
                {course.subject}{course.courseCode}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onSearchReviews(course)
                }}
                className="h-6 px-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 cursor-pointer"
                title={`Search Google for "${course.subject} ${course.courseCode}" reviews`}
              >
                <Search className="w-3 h-3 mr-1" />
                Reviews
              </Button>
            </div>
            <CardDescription className="text-base font-medium text-gray-700 mt-1">
              {course.title}
            </CardDescription>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="outline">{course.credits} credits</Badge>
              {course.gradingBasis && (
                <Badge variant="outline" className="text-xs">
                  {course.gradingBasis}
                </Badge>
              )}
              {/* Show instructors as badges with smart truncation */}
              {instructors.length > 0 && (
                <>
                  {instructors.slice(0, 4).map(instructor => {
                    const formattedInstructor = formatInstructorCompact(instructor)
                    return (
                      <Badge 
                        key={formattedInstructor}
                        variant="secondary" 
                        className="text-xs text-gray-700 hover:text-gray-900 hover:bg-gray-200 cursor-pointer transition-colors"
                        onClick={(e) => {
                          e.stopPropagation()
                          onSearchInstructor(formattedInstructor)
                        }}
                        title={`Search Google for "${formattedInstructor}"`}
                      >
                        {formattedInstructor}
                      </Badge>
                    )
                  })}
                  {instructors.length > 4 && (
                    <Badge 
                      variant="outline" 
                      className="text-xs text-gray-500"
                      title={`Additional instructors: ${instructors.slice(4).map(i => formatInstructorCompact(i)).join(', ')}`}
                    >
                      +{instructors.length - 4} more
                    </Badge>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-2">
            {isAdded ? (
              <>
                {/* Remove button for enrolled courses */}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveCourse(courseKey)
                  }}
                  className="min-w-[70px] cursor-pointer"
                  title="Remove course from cart"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Remove
                </Button>
                
                {/* Go to Cart button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (onSelectEnrollment && enrolledCourse) {
                      onSelectEnrollment(enrolledCourse.courseId)
                    }
                  }}
                  className="min-w-[80px] cursor-pointer"
                  title="Go to course in shopping cart"
                >
                  <ShoppingCart className="w-3 h-3 mr-1" />
                  Go to Cart
                </Button>
                
                {/* Replace/Added status button - for courses already in cart */}
                <Button
                  variant={hasSelectionsChanged && isEnrollmentComplete ? "default" : "secondary"}
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (hasSelectionsChanged && isEnrollmentComplete) {
                      onAddCourse(course, selectedSections)
                    }
                  }}
                  disabled={!hasSelectionsChanged || !isEnrollmentComplete}
                  className="min-w-[80px] cursor-pointer"
                  title={hasSelectionsChanged && isEnrollmentComplete
                    ? "Replace course with new section selections" 
                    : "Course already added to cart"}
                >
                  {hasSelectionsChanged && isEnrollmentComplete ? "Replace Cart" : "Added ✓"}
                </Button>
              </>
            ) : (
              /* Add button for non-enrolled courses */
              <Button
                variant={isEnrollmentComplete ? "default" : "secondary"}
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  if (isEnrollmentComplete) {
                    onAddCourse(course, selectedSections)
                  }
                }}
                disabled={!isEnrollmentComplete}
                className="min-w-[80px] cursor-pointer"
                title={!isEnrollmentComplete ? "Select required sections to add course (some types may not have compatible options)" : "Add course to cart"}
              >
                {isEnrollmentComplete ? "Add to Cart" : "Select Sections"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                setExpanded(!expanded)
              }}
              className="w-8 h-8 p-0 cursor-pointer"
              title={expanded ? "Hide sections" : "Show sections"}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <div className="space-y-4 pt-3 border-t">
            {/* Section Selection */}
            {sectionTypes.map(typeGroup => {
              // Get currently selected sections for this course to check compatibility
              const currentlySelectedSections = getSelectedSectionsForCourse(course, currentTerm, selectedSections)
              
              // Only constrain by HIGHER priority selections (hierarchical flow)
              const higherPrioritySelections = currentlySelectedSections.filter(s => {
                const sPriority = getSectionTypePriority(s.sectionType, sectionTypes)
                return sPriority < typeGroup.priority  // Lower number = higher priority
              })
              
              // Categorize sections as compatible/incompatible based on higher priority selections only
              const { compatible, incompatible, hasNoCompatible } = categorizeCompatibleSections(
                typeGroup.sections, 
                higherPrioritySelections
              )
              
              // Note: Higher priority sections can always be changed freely (implemented in logic above)
              
              return (
                <div key={typeGroup.type}>
                  <h4 className="flex items-center gap-2 font-medium text-sm text-gray-700 mb-2">
                    <span>{typeGroup.icon}</span>
                    <span>{typeGroup.displayName}</span>
                    <Badge variant="outline" className="text-xs">
                      Pick 1
                    </Badge>
                    {/* Show positive availability messaging */}
                    {hasNoCompatible ? (
                      <Badge variant="secondary" className="text-xs">
                        No compatible options
                      </Badge>
                    ) : compatible.length < typeGroup.sections.length ? (
                      <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50">
                        {compatible.length} available
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-blue-700 border-blue-300 bg-blue-50">
                        All {typeGroup.sections.length} available
                      </Badge>
                    )}
                  </h4>
                
                {/* Display sections horizontally for easy comparison - 4 columns on large screens */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {typeGroup.sections.map(section => {
                    const isSelected = selectedSections.get(`${courseKey}_${typeGroup.type}`) === section.id
                    const isIncompatible = incompatible.includes(section)
                    const sectionPrefix = getSectionPrefix(section.sectionCode)
                    
                    return (
                      <div 
                        key={section.id}
                        className={`p-2 rounded transition-all ${
                          isSelected 
                            ? 'border border-blue-500 bg-blue-50 shadow-md ring-1 ring-blue-200 cursor-pointer' 
                            : isIncompatible 
                              ? 'border border-gray-200 opacity-40 cursor-not-allowed grayscale' 
                              : 'border border-green-200 hover:border-green-500 hover:bg-green-50 cursor-pointer shadow-sm'
                        }`}
                        onClick={() => !isIncompatible && onSectionToggle(courseKey, typeGroup.type, section.id)}
                        title={isIncompatible ? `Incompatible with selected ${sectionPrefix || 'universal'}-cohort sections` : undefined}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-medium">{section.sectionCode}</span>
                          </div>
                          
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-6 h-6 p-0"
                              title={isSelected ? "Remove selection" : "Select this section"}
                            >
                              {isSelected ? (
                                <X className="w-3 h-3 text-red-500" />
                              ) : (
                                <Plus className="w-3 h-3 text-gray-500" />
                              )}
                            </Button>
                          </div>
                        </div>
                        
                        {/* Teaching Language + Availability - section level */}
                        {(section.classAttributes || getAvailabilityBadges(section.availability).length > 0) && (
                          <div className="flex items-center justify-between mb-2 gap-2">
                            {section.classAttributes ? (
                              <div className="flex items-center gap-1 text-gray-500 text-[12px] min-w-0 flex-1">
                                <span className="flex-shrink-0">🌐</span>
                                <span className="truncate" title={`Language of instruction: ${section.classAttributes}`}>
                                  {section.classAttributes}
                                </span>
                              </div>
                            ) : <div className="flex-1" />}
                            
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {getAvailabilityBadges(section.availability).map((badge) => (
                                <Badge
                                  key={badge.type}
                                  className={`text-[10px] ${badge.style.className} flex items-center gap-1`}
                                  title={badge.type === 'availability' 
                                    ? `${section.availability.status}: ${section.availability.availableSeats} seats available out of ${section.availability.capacity}`
                                    : `Waitlist: ${section.availability.waitlistTotal} people waiting (capacity: ${section.availability.waitlistCapacity})`
                                  }
                                >
                                  {badge.type === 'availability' ? (
                                    <><Users className="w-2.5 h-2.5" />{badge.text}</>
                                  ) : (
                                    <><Clock className="w-2.5 h-2.5" />{badge.text}</>
                                  )}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Meetings displayed compactly with time+instructor on same row */}
                        <div className="space-y-1">
                          {getUniqueMeetings(section.meetings).map((meeting, index) => {
                            const formattedTime = formatTimeCompact(meeting?.time || 'TBD')
                            const formattedInstructor = formatInstructorCompact(meeting?.instructor || 'TBD')
                            const location = meeting?.location || 'TBD'
                            
                            return (
                              <div key={index} className="bg-white border border-gray-200 rounded px-2 py-1.5 shadow-sm">
                                <div className="flex items-center justify-between text-[11px] gap-2">
                                  <span className="font-medium font-mono text-gray-900 flex-shrink-0">{formattedTime}</span>
                                  <span 
                                    className="text-gray-600 truncate text-right flex-1 min-w-0"
                                    title={formattedInstructor}
                                  >
                                    {formattedInstructor}
                                  </span>
                                </div>
                                {location !== 'TBD' && (
                                  <div className="flex items-center gap-1 text-gray-500 text-[10px] mt-1">
                                    <span>📍</span>
                                    <span className="truncate" title={location}>{location}</span>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              )
            })}

            {/* Course Details */}
            <div className="border-t pt-4 space-y-3">
              {/* Description */}
              {course.description && (
                <div>
                  <h4 className="font-semibold text-sm text-gray-700 mb-1">Description</h4>
                  <p className="text-sm text-gray-600">{course.description}</p>
                </div>
              )}

              {/* Instructors */}
              {instructors.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm text-gray-700 mb-1">Instructors</h4>
                  <div className="flex flex-wrap gap-1">
                    {instructors.map(instructor => {
                      const formattedInstructor = formatInstructorCompact(instructor)
                      return (
                        <Badge 
                          key={formattedInstructor}
                          variant="outline" 
                          className="text-xs hover:bg-gray-100 cursor-pointer transition-colors"
                          onClick={(e) => {
                            e.stopPropagation()
                            onSearchInstructor(formattedInstructor)
                          }}
                          title={`Search Google for "${formattedInstructor}"`}
                        >
                          {formattedInstructor}
                        </Badge>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Prerequisites */}
              {course.enrollmentRequirement && (
                <div>
                  <h4 className="font-semibold text-sm text-gray-700 mb-1">Prerequisites</h4>
                  <p className="text-sm text-gray-600">{course.enrollmentRequirement}</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
