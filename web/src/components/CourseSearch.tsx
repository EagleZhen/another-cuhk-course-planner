'use client'

import { useState, useEffect, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronDown, ChevronUp, Plus, X, Info, Trash2, Search, ShoppingCart } from 'lucide-react'
import { parseSectionTypes, isCourseEnrollmentComplete, getUniqueMeetings, getSectionPrefix, categorizeCompatibleSections, getSelectedSectionsForCourse, clearIncompatibleLowerSelections, getSectionTypePriority, formatTimeCompact, formatInstructorCompact, type InternalCourse, type CourseEnrollment, type SectionType } from '@/lib/courseUtils'
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
  onSearchControlReady
}: CourseSearchProps) {
  const [searchTerm, setSearchTerm] = useState('')
  
  // Expose search function to parent
  useEffect(() => {
    if (onSearchControlReady) {
      onSearchControlReady(setSearchTerm)
    }
  }, [onSearchControlReady])
  const [loading, setLoading] = useState(false)
  const [allCourses, setAllCourses] = useState<InternalCourse[]>([])
  const [isTermDropdownOpen, setIsTermDropdownOpen] = useState(false)

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

  // Load course data on component mount
  useEffect(() => {
    const loadCourseData = async () => {
      setLoading(true)
      try {
        // First, try to load index/manifest to get available subjects
        let availableSubjects: string[] = []
        
        try {
          const indexResponse = await fetch('/data/index.json')
          if (indexResponse.ok) {
            const indexData = await indexResponse.json()
            availableSubjects = indexData.subjects?.map((s: { code: string }) => s.code) || []
            console.log(`Found ${availableSubjects.length} subjects from index`)
          }
        } catch {
          console.warn('No index.json found, using fallback subject discovery')
        }

        // Fallback: try common subjects if no index available
        if (availableSubjects.length === 0) {
          const commonSubjects = [
            'CSCI', 'AIST', 'PHYS', 'ENGG', 'CENG', 'FINA', 
            'UGCP', 'UGFN', 'UGFH', 'UGEA', 'UGEB', 'UGEC', 'UGED'
          ]
          availableSubjects = commonSubjects
        }

        const allCoursesData: InternalCourse[] = []
        let successCount = 0

        // Load each subject with clean filename (no timestamp)
        for (const subject of availableSubjects) {
          try {
            const response = await fetch(`/data/${subject}.json`)
            if (response.ok) {
              const rawData = await response.json()
              
              // Validate data structure
              if (rawData.courses && Array.isArray(rawData.courses)) {
                const transformedData = transformExternalCourseData(rawData)
                allCoursesData.push(...transformedData.courses)
                successCount++
                console.log(`✅ Loaded ${transformedData.courses.length} courses from ${subject}`)
              } else {
                console.warn(`Invalid data structure in ${subject}.json`)
              }
            } else {
              console.warn(`Failed to load ${subject}.json: ${response.status}`)
            }
          } catch (error) {
            console.warn(`Failed to load ${subject} data:`, error)
          }
        }

        console.log(`📚 Loaded ${allCoursesData.length} total courses from ${successCount}/${availableSubjects.length} subjects`)
        setAllCourses(allCoursesData)
        
      } catch (error) {
        console.error('Failed to load course data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadCourseData()
  }, [])

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
    const termFilteredCourses = allCourses.filter(course => 
      course.terms.some(term => term.termName === currentTerm)
    )
    
    if (!searchTerm.trim()) {
      return termFilteredCourses.slice(0, 10) // Show first 10 by default
    }

    const searchLower = searchTerm.toLowerCase()
    const filtered = termFilteredCourses.filter(course => {
      // Create full course code without space for searching
      const fullCourseCode = `${course.subject}${course.courseCode}`.toLowerCase()
      
      return (
        fullCourseCode.includes(searchLower) ||
        course.courseCode.toLowerCase().includes(searchLower) ||
        course.title.toLowerCase().includes(searchLower) ||
        course.subject.toLowerCase().includes(searchLower) ||
        course.terms.some(term =>
          term.sections.some(section =>
            section.meetings.some(meeting =>
              meeting.instructor.toLowerCase().includes(searchLower)
            )
          )
        )
      )
    })

    return filtered.slice(0, 20) // Limit to 20 results
  }, [searchTerm, allCourses, currentTerm])

  return (
    <div className="space-y-4">
      {/* Search Input with Term Filter Hint */}
      <div className="w-full space-y-2">
        <Input
          type="text"
          placeholder="Search courses (e.g., CSCI3180, Software Engineering, Yu Bei)"
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
        </div>
      </div>

      {/* Search Results */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-8 text-gray-500">
            Loading course data...
          </div>
        ) : searchResults.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {searchTerm ? 'No courses found' : 'No courses available'}
          </div>
        ) : (
          <>
            <div className="text-sm text-gray-600 mb-3">
              Showing {searchResults.length} course{searchResults.length !== 1 ? 's' : ''}
              {searchTerm && ` matching "${searchTerm}"`}
            </div>
            {searchResults.map((course, index) => (
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
                    const targetCourse = searchResults.find(c => `${c.subject}${c.courseCode}` === courseKey)
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
      section.meetings.map(meeting => meeting.instructor)
    ) || []
  )).filter(Boolean)

  return (
    <Card 
      className={`transition-all duration-200 ${
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
                className="h-6 px-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
                title={`Search Google for "${course.subject} ${course.courseCode}" reviews`}
              >
                <Search className="w-3 h-3 mr-1" />
                Reviews
              </Button>
            </div>
            <CardDescription className="text-base font-medium text-gray-700 mt-1">
              {course.title}
            </CardDescription>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary">{course.credits} credits</Badge>
              <Badge variant="outline" className="text-xs">
                {currentTerm}
              </Badge>
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
          <div className="space-y-4">
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
                            ? 'border-2 border-blue-500 bg-blue-50 shadow-md ring-1 ring-blue-200 cursor-pointer' 
                            : isIncompatible 
                              ? 'border border-gray-200 bg-gray-50 opacity-40 cursor-not-allowed grayscale' 
                              : 'border border-green-200 bg-green-50 hover:border-green-300 hover:bg-green-100 cursor-pointer shadow-sm'
                        }`}
                        onClick={() => !isIncompatible && onSectionToggle(courseKey, typeGroup.type, section.id)}
                        title={isIncompatible ? `Incompatible with selected ${sectionPrefix || 'universal'}-cohort sections` : undefined}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-medium">{section.sectionCode}</span>
                          </div>
                          
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge 
                              variant={section.availability.status === 'Open' ? 'default' : 'secondary'}
                              className="text-xs"
                              title={`${section.availability.status}: ${section.availability.availableSeats} seats available out of ${section.availability.capacity}`}
                            >
                              {section.availability.availableSeats}/{section.availability.capacity}
                            </Badge>
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
                        
                        {/* Teaching Language - section level */}
                        {section.classAttributes && (
                          <div className="flex items-center gap-1 text-gray-500 text-[10px] mb-2">
                            <span>🌐</span>
                            <span className="truncate" title={`Language of instruction: ${section.classAttributes}`}>
                              {section.classAttributes}
                            </span>
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
