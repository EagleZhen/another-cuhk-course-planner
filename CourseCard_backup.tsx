// Clean, maintainable CourseCard component

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronDown, ChevronUp, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react'
import { formatInstructorCompact, type InternalCourse, type CourseEnrollment } from '@/lib/courseUtils'

// Reusable components for better maintainability

// Course Info Component (reused in both desktop and mobile)
function CourseInfo({ 
  course, 
  instructors, 
  onSearchReviews, 
  onSearchInstructor,
  showReviewsButton = true 
}: {
  course: InternalCourse
  instructors: string[]
  onSearchReviews: (course: InternalCourse) => void
  onSearchInstructor: (instructor: string) => void
  showReviewsButton?: boolean
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <CardTitle className="text-lg">
          {course.subject}{course.courseCode}
        </CardTitle>
        {showReviewsButton && (
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
        )}
      </div>
      <CardDescription className="text-base font-medium text-gray-700">
        {course.title}
      </CardDescription>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <Badge variant="outline">{course.credits} credits</Badge>
        {course.gradingBasis && (
          <Badge variant="outline" className="text-xs">
            {course.gradingBasis}
          </Badge>
        )}
        {instructors.length > 0 && (
          <>
            {instructors.slice(0, 3).map(instructor => {
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
            {instructors.length > 3 && (
              <Badge variant="secondary" className="text-xs text-gray-600">
                +{instructors.length - 3} more
              </Badge>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Action Buttons Component (reused in both layouts)
function CourseActions({
  isAdded,
  isEnrollmentComplete,
  hasSelectionsChanged,
  onAddCourse,
  onRemoveCourse,
  onGoToCart,
  expanded,
  onToggleExpanded,
  layout = 'horizontal' // 'horizontal' | 'vertical'
}: {
  isAdded: boolean
  isEnrollmentComplete: boolean
  hasSelectionsChanged: boolean
  onAddCourse: () => void
  onRemoveCourse: () => void
  onGoToCart: () => void
  expanded: boolean
  onToggleExpanded: () => void
  layout?: 'horizontal' | 'vertical'
}) {
  const isVertical = layout === 'vertical'
  
  if (isAdded) {
    return (
      <div className={`flex ${isVertical ? 'flex-col' : 'items-center'} gap-2`}>
        {/* Replace/Added status button */}
        <Button
          variant={hasSelectionsChanged && isEnrollmentComplete ? "default" : "secondary"}
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            if (hasSelectionsChanged && isEnrollmentComplete) {
              onAddCourse()
            }
          }}
          disabled={!hasSelectionsChanged || !isEnrollmentComplete}
          className={`cursor-pointer ${isVertical ? '' : 'min-w-[80px]'}`}
          title={hasSelectionsChanged && isEnrollmentComplete
            ? "Replace course with new section selections" 
            : "Course already added to cart"}
        >
          {hasSelectionsChanged && isEnrollmentComplete ? "Replace Cart" : "Added ✓"}
        </Button>
        
        {isVertical ? (
          // Vertical layout: Go to Cart and Remove in same row
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onGoToCart()
              }}
              className="flex-1 cursor-pointer"
              title="Go to course in shopping cart"
            >
              <ShoppingCart className="w-3 h-3 mr-1" />
              Go to Cart
            </Button>
            
            <Button
              variant="destructive"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onRemoveCourse()
              }}
              className="flex-1 cursor-pointer"
              title="Remove course from cart"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Remove
            </Button>
          </div>
        ) : (
          // Horizontal layout: all buttons in one row
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onGoToCart()
              }}
              className="min-w-[80px] cursor-pointer"
              title="Go to course in shopping cart"
            >
              <ShoppingCart className="w-3 h-3 mr-1" />
              Go to Cart
            </Button>
            
            <Button
              variant="destructive"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onRemoveCourse()
              }}
              className="min-w-[70px] cursor-pointer"
              title="Remove course from cart"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Remove
            </Button>
          </>
        )}
        
        {/* Expand button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpanded()
          }}
          className={`cursor-pointer ${isVertical ? '' : 'w-8 h-8 p-0'}`}
          title={expanded ? "Hide sections" : "Show sections"}
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {isVertical && <span className="ml-2">{expanded ? "Hide Sections" : "Show Sections"}</span>}
        </Button>
      </div>
    )
  } else {
    return (
      <div className={`flex ${isVertical ? 'flex-col' : 'items-center'} gap-2`}>
        <Button
          variant="default"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            onAddCourse()
          }}
          disabled={!isEnrollmentComplete}
          className={`cursor-pointer ${isVertical ? '' : 'min-w-[80px]'}`}
          title={isEnrollmentComplete ? "Add course to cart" : "Select sections to add to cart"}
        >
          <Plus className="w-3 h-3 mr-1" />
          {isEnrollmentComplete ? "Add to Cart" : "Select Sections"}
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpanded()
          }}
          className={`cursor-pointer ${isVertical ? '' : 'w-8 h-8 p-0'}`}
          title={expanded ? "Hide sections" : "Show sections"}
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {isVertical && <span className="ml-2">{expanded ? "Hide Sections" : "Show Sections"}</span>}
        </Button>
      </div>
    )
  }
}

export { CourseInfo, CourseActions }