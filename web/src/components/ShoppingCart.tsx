'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff, Trash2, AlertTriangle } from 'lucide-react'
import { type Course } from '@/lib/courseUtils'

interface ShoppingCartProps {
  selectedCourses: Course[]
  onToggleVisibility: (courseId: string) => void
  onRemoveCourse: (courseId: string) => void
}

export default function ShoppingCart({ 
  selectedCourses, 
  onToggleVisibility, 
  onRemoveCourse
}: ShoppingCartProps) {
  const visibleCourses = selectedCourses.filter(course => course.isVisible)
  const conflictCount = selectedCourses.filter(course => course.hasConflict).length

  const handleToggleVisibility = (courseId: string) => {
    onToggleVisibility(courseId)
  }

  const handleRemoveCourse = (courseId: string) => {
    onRemoveCourse(courseId)
  }

  return (
    <Card className="h-[650px] flex flex-col">
      <CardHeader className="pb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">My Schedule</CardTitle>
          <div className="flex items-center gap-2">
            {conflictCount > 0 && (
              <AlertTriangle className="w-3 h-3 text-red-500" />
            )}
            <Badge variant="secondary" className="text-xs">
              {selectedCourses.length}
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 overflow-hidden p-3">
        {selectedCourses.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-2xl mb-2">📚</div>
            <p className="text-sm">No courses selected</p>
            <p className="text-xs opacity-70">Add courses to get started</p>
          </div>
        ) : (
          <div className="space-y-2 overflow-y-auto h-full pr-1">
            {selectedCourses.map((course) => (
              <div
                key={course.id}
                className={`
                  border rounded p-2 transition-all
                  ${course.hasConflict 
                    ? 'border-red-200 bg-red-50' 
                    : 'border-gray-200 bg-white'
                  }
                  ${!course.isVisible ? 'opacity-60' : ''}
                `}
              >
                {/* Compact Course Info */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div 
                      className={`w-2 h-2 rounded-full ${course.color} flex-shrink-0`}
                    />
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-xs">
                        {course.subject}{course.courseCode}
                      </span>
                    </div>
                    {/* Always reserve space for conflict indicator to prevent layout shifts */}
                    <div className="w-3 h-3 flex-shrink-0">
                      {course.hasConflict && (
                        <AlertTriangle className="w-3 h-3 text-red-500" />
                      )}
                    </div>
                    <span className="text-[12px] text-gray-500 font-medium">
                      {course.credits} credits
                    </span>
                  </div>
                  
                  {/* Quick Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleVisibility(course.id)}
                      className="h-5 w-5 p-0"
                      title={course.isVisible ? 'Hide' : 'Show'}
                    >
                      {course.isVisible ? (
                        <Eye className="w-3 h-3" />
                      ) : (
                        <EyeOff className="w-3 h-3" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveCourse(course.id)}
                      className="h-5 w-5 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                      title="Remove"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {/* Course Title */}
                <p className="text-xs text-gray-600 truncate mb-1 pl-4">
                  {course.title}
                </p>

                {/* Essential Info - Single Line */}
                <div className="text-xs text-gray-500 pl-4">
                  <span className="font-medium">{course.section.replace('--', '')}</span>
                  <span className="mx-1">•</span>
                  <span>{course.time}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      
      {/* Schedule Summary - Outside scrollable area */}
      {selectedCourses.length > 0 && (
        <div className="border-t px-3 py-2 flex-shrink-0">
          <div className="flex justify-between text-xs text-gray-600">
            <span>{visibleCourses.length}/{selectedCourses.length} visible</span>
            <span>
              {selectedCourses.reduce((sum, course) => 
                sum + parseFloat(course.credits || '0'), 0
              ).toFixed(1)} credits
            </span>
            {conflictCount > 0 && (
              <span className="text-red-500">{conflictCount} conflicts</span>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}