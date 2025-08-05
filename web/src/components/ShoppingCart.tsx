'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff, Trash2, Settings, AlertTriangle } from 'lucide-react'

interface SelectedCourse {
  id: string
  subject: string
  courseCode: string
  title: string
  section: string
  time: string
  location: string
  instructor: string
  credits: string
  color: string
  isVisible: boolean
  hasConflict: boolean
}

interface ShoppingCartProps {
  selectedCourses: SelectedCourse[]
  onToggleVisibility: (courseId: string) => void
  onRemoveCourse: (courseId: string) => void
  onEditCourse?: (courseId: string) => void
}

export default function ShoppingCart({ 
  selectedCourses, 
  onToggleVisibility, 
  onRemoveCourse,
  onEditCourse 
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
    <Card className="h-fit">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">My Schedule</CardTitle>
          <Badge variant="secondary" className="text-sm">
            {selectedCourses.length} courses
          </Badge>
        </div>
        {conflictCount > 0 && (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <AlertTriangle className="w-4 h-4" />
            <span>{conflictCount} conflict{conflictCount > 1 ? 's' : ''} found</span>
          </div>
        )}
      </CardHeader>
      
      <CardContent className="space-y-3">
        {selectedCourses.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">📚</div>
            <p>No courses selected</p>
            <p className="text-sm">Search and add courses to get started</p>
          </div>
        ) : (
          selectedCourses.map((course) => (
            <div
              key={course.id}
              className={`
                border rounded-lg p-3 transition-all
                ${course.hasConflict 
                  ? 'border-red-200 bg-red-50' 
                  : 'border-gray-200 bg-white'
                }
                ${!course.isVisible ? 'opacity-60' : ''}
              `}
            >
              {/* Course Header */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">
                      {course.subject}{course.courseCode}
                    </span>
                    {course.hasConflict && (
                      <AlertTriangle className="w-3 h-3 text-red-500" />
                    )}
                  </div>
                  <p className="text-xs text-gray-600 truncate">
                    {course.title}
                  </p>
                </div>
                
                {/* Color indicator */}
                <div 
                  className={`w-3 h-3 rounded-full ${course.color} flex-shrink-0`}
                />
              </div>

              {/* Course Details */}
              <div className="space-y-1 mb-3">
                <p className="text-xs text-gray-700">
                  <span className="font-medium">{course.section.replace('--', '')}</span>
                </p>
                <p className="text-xs text-gray-600">
                  {course.time}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {course.location}
                </p>
                {course.instructor && (
                  <p className="text-xs text-gray-500 truncate">
                    {course.instructor}
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleVisibility(course.id)}
                    className="h-7 px-2 text-xs"
                  >
                    {course.isVisible ? (
                      <>
                        <Eye className="w-3 h-3 mr-1" />
                        Hide
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3 h-3 mr-1" />
                        Show
                      </>
                    )}
                  </Button>
                  
                  {onEditCourse && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEditCourse(course.id)}
                      className="h-7 px-2 text-xs"
                    >
                      <Settings className="w-3 h-3 mr-1" />
                      Edit
                    </Button>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveCourse(course.id)}
                  className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))
        )}

        {/* Conflict Resolution Actions */}
        {conflictCount > 0 && (
          <div className="border-t pt-3 mt-4">
            <div className="flex flex-col gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full text-xs"
                disabled // Future feature
              >
                🔧 Auto-Resolve Conflicts
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full text-xs"
                disabled // Future feature
              >
                📋 View Conflict Details
              </Button>
            </div>
          </div>
        )}

        {/* Schedule Summary */}
        {selectedCourses.length > 0 && (
          <div className="border-t pt-3 mt-4">
            <div className="text-xs text-gray-600 space-y-1">
              <div className="flex justify-between">
                <span>Total courses:</span>
                <span className="font-medium">{selectedCourses.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Visible on calendar:</span>
                <span className="font-medium">{visibleCourses.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Total credits:</span>
                <span className="font-medium">
                  {selectedCourses.reduce((sum, course) => 
                    sum + parseFloat(course.credits || '0'), 0
                  ).toFixed(1)}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}