'use client'

import { useState, useEffect, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronDown, ChevronUp, Plus, X, Info } from 'lucide-react'
import { parseSectionTypes, isCourseEnrollmentComplete, type InternalCourse, type CourseEnrollment } from '@/lib/courseUtils'
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
                  } else {
                    // Set new selection (replaces any existing selection for this type)
                    newMap.set(selectionKey, sectionId)
                  }
                  
                  onSelectedSectionsChange(newMap)
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
            {sectionTypes.map(typeGroup => (
              <div key={typeGroup.type}>
                <h4 className="flex items-center gap-2 font-medium text-sm text-gray-700 mb-2">
                  <span>{typeGroup.icon}</span>
                  <span>{typeGroup.displayName}</span>
                  <Badge variant="outline" className="text-xs">
                    Pick 1
                  </Badge>
                </h4>
                
                <div className="space-y-1">
                  {typeGroup.sections.map(section => {
                    const isSelected = selectedSections.get(`${courseKey}_${typeGroup.type}`) === section.id
                    const meeting = section.meetings[0] // Show first meeting
                    
                    return (
                      <div 
                        key={section.id}
                        className={`flex items-center justify-between p-2 rounded border transition-all ${
                          isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => onSectionToggle(courseKey, typeGroup.type, section.id)}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`w-3 h-3 rounded-full border-2 ${
                            isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                          }`} />
                          <span className="font-mono text-sm font-medium">{section.sectionCode}</span>
                          <span className="text-sm text-gray-600 truncate">
                            {meeting?.time || 'TBD'}
                          </span>
                          <span className="text-sm text-gray-500 truncate">
                            {meeting?.instructor || 'TBD'}
                          </span>
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
                    )
                  })}
                </div>
              </div>
            ))}

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