'use client'

import { useState, useEffect, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronDown, ChevronUp, Plus, X, Info } from 'lucide-react'
import { parseSectionTypes, isCourseEnrollmentComplete, getUniqueMeetings, getSectionPrefix, categorizeCompatibleSections, getSelectedSectionsForCourse, clearIncompatibleLowerSelections, getSectionTypePriority, type InternalCourse, type CourseEnrollment } from '@/lib/courseUtils'
import { transformExternalCourseData } from '@/lib/validation'

// Using clean internal types only


interface CourseSearchProps {
  onAddCourse: (course: InternalCourse, sectionsMap: Map<string, string>) => void
  courseEnrollments: CourseEnrollment[]
  currentTerm: string
  selectedSections: Map<string, string>
  onSelectedSectionsChange: (sections: Map<string, string>) => void
}

export default function CourseSearch({ 
  onAddCourse, 
  courseEnrollments, 
  currentTerm, 
  selectedSections, 
  onSelectedSectionsChange 
}: CourseSearchProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(false)
  const [allCourses, setAllCourses] = useState<InternalCourse[]>([])

  // Helper function to check if course is already enrolled
  const isCourseAdded = (course: InternalCourse) => {
    return courseEnrollments.some(enrollment => 
      enrollment.course.subject === course.subject && enrollment.course.courseCode === course.courseCode
    )
  }

  // Load course data on component mount
  useEffect(() => {
    const loadCourseData = async () => {
      setLoading(true)
      try {
        const subjects = ['CSCI', 'AIST', 'PHYS', 'FINA']
        const allCoursesData: InternalCourse[] = []

        for (const subject of subjects) {
          try {
            const response = await fetch(`/data/${subject}_20250804_002506.json`)
            if (response.ok) {
              const rawData = await response.json()
              const transformedData = transformExternalCourseData(rawData)
              allCoursesData.push(...transformedData.courses)
            }
          } catch (error) {
            console.warn(`Failed to load ${subject} data:`, error)
          }
        }

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
          placeholder="Search courses (e.g., CSCI3100, Software Engineering, CHEONG Chi Hong)"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full"
        />
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <Info className="w-3 h-3" />
          <span>Showing courses available in <strong>{currentTerm}</strong></span>
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
                        sectionType, 
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
                isAdded={isCourseAdded(course)}
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
  onSectionToggle, 
  onAddCourse, 
  isAdded 
}: { 
  course: InternalCourse
  currentTerm: string
  selectedSections: Map<string, string>
  onSectionToggle: (courseKey: string, sectionType: string, sectionId: string) => void
  onAddCourse: (course: InternalCourse, sectionsMap: Map<string, string>) => void
  isAdded: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const courseKey = `${course.subject}${course.courseCode}`
  const sectionTypes = parseSectionTypes(course, currentTerm)
  const isEnrollmentComplete = isCourseEnrollmentComplete(course, currentTerm, selectedSections)

  // Get unique instructors from current term
  const currentTermData = course.terms.find(term => term.termName === currentTerm)
  const instructors = Array.from(new Set(
    currentTermData?.sections.flatMap(section =>
      section.meetings.map(meeting => meeting.instructor)
    ) || []
  )).filter(Boolean)

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">
              {course.subject}{course.courseCode}
            </CardTitle>
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
            <Button
              variant={isEnrollmentComplete ? "default" : "secondary"}
              size="sm"
              onClick={() => isEnrollmentComplete && onAddCourse(course, selectedSections)}
              disabled={!isEnrollmentComplete || isAdded}
              className="min-w-[80px]"
              title={!isEnrollmentComplete ? "Select one section from each type to add course" : isAdded ? "Already added" : "Add course to cart"}
            >
              {isAdded ? "Added ✓" : isEnrollmentComplete ? "Add to Cart" : "Select Sections"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="w-8 h-8 p-0"
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
              
              // Determine if this section type can be changed freely
              const canChangeFreely = typeGroup.priority <= 1 || higherPrioritySelections.length === 0
              
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
                    {/* Priority indicator for higher-priority types */}
                    {typeGroup.priority === 0 && (
                      <Badge variant="outline" className="text-xs text-purple-700 border-purple-300 bg-purple-50">
                        Choose first
                      </Badge>
                    )}
                  </h4>
                
                {/* Display sections horizontally for easy comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {typeGroup.sections.map(section => {
                    const isSelected = selectedSections.get(`${courseKey}_${typeGroup.type}`) === section.id
                    const isIncompatible = incompatible.includes(section)
                    const sectionPrefix = getSectionPrefix(section.sectionCode)
                    
                    return (
                      <div 
                        key={section.id}
                        className={`p-2 rounded border transition-all ${
                          isSelected 
                            ? 'border-blue-500 bg-blue-50' 
                            : isIncompatible 
                              ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed' 
                              : 'border-gray-200 hover:border-gray-300 cursor-pointer'
                        }`}
                        onClick={() => !isIncompatible && onSectionToggle(courseKey, typeGroup.type, section.id)}
                        title={isIncompatible ? `Incompatible with selected ${sectionPrefix || 'universal'}-cohort sections` : undefined}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full border-2 ${
                              isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                            }`} />
                            <span className="font-mono text-sm font-medium">{section.sectionCode}</span>
                          </div>
                          
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge 
                              variant={section.availability.status === 'Open' ? 'default' : 'secondary'}
                              className="text-xs"
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
                        
                        {/* Meetings displayed vertically within each section */}
                        <div className="space-y-2">
                          {getUniqueMeetings(section.meetings).map((meeting, index) => (
                            <div key={index} className="text-xs bg-white border border-gray-200 rounded-md px-3 py-2 shadow-sm">
                              <div className="font-mono font-semibold text-gray-900 mb-1">
                                {meeting?.time || 'TBD'}
                              </div>
                              <div className="flex items-center justify-between text-gray-600">
                                <span className="flex items-center gap-1" title={meeting?.location || 'TBD'}>
                                  <span className="text-gray-400">📍</span>
                                  {meeting?.location || 'TBD'}
                                </span>
                                <span className="text-right font-medium" title={meeting?.instructor || 'TBD'}>
                                  {meeting?.instructor || 'TBD'}
                                </span>
                              </div>
                            </div>
                          ))}
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
                    {instructors.map(instructor => (
                      <Badge key={instructor} variant="outline" className="text-xs">
                        {instructor}
                      </Badge>
                    ))}
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