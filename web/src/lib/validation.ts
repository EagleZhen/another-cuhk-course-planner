// Runtime validation schemas and transformation functions
// Isolated boundary between external data and internal types

import { z } from 'zod'
import type { InternalCourse, InternalTerm, InternalSection, InternalMeeting, SectionAvailability, SectionType } from './types'

// External data schemas (for runtime validation)
const ExternalMeetingSchema = z.object({
  time: z.string().optional().default('TBD'),
  location: z.string().optional().default('TBD'),
  instructor: z.string().optional().default('TBD'),
  dates: z.string().optional().default('TBD')
})

const ExternalAvailabilitySchema = z.object({
  capacity: z.string().optional().default('0'),
  enrolled: z.string().optional().default('0'),
  status: z.string().optional().default('Unknown'),
  available_seats: z.string().optional().default('0')
})

const ExternalSectionSchema = z.object({
  section: z.string(),
  meetings: z.array(ExternalMeetingSchema).optional().default([]),
  availability: ExternalAvailabilitySchema.optional().default({
    capacity: '0',
    enrolled: '0',
    status: 'Unknown',
    available_seats: '0'
  }),
  class_attributes: z.string().default("") // Language of instruction
})

const ExternalTermSchema = z.object({
  term_code: z.string(),
  term_name: z.string(),
  schedule: z.array(ExternalSectionSchema).optional().default([])
})

const ExternalCourseSchema = z.object({
  subject: z.string(),
  course_code: z.string(),
  title: z.string(),
  credits: z.string().optional(),
  description: z.string().optional(),
  enrollment_requirement: z.string().optional(),
  terms: z.array(ExternalTermSchema).optional().default([])
})

// Course data file schema
const ExternalCourseDataSchema = z.object({
  metadata: z.object({
    subject: z.string(),
    total_courses: z.number()
  }),
  courses: z.array(ExternalCourseSchema)
})

// Type inference from schemas
export type ExternalCourseData = z.infer<typeof ExternalCourseDataSchema>
export type ExternalCourse = z.infer<typeof ExternalCourseSchema>

// Section type parsing and validation
function parseSectionType(sectionCode: string): SectionType {
  // Pattern 1: --TYPE or -XXX-TYPE
  const dashTypeMatch = sectionCode.match(/-+(?:[A-Z]\d+-)?(LEC|TUT|LAB|EXR|SEM|PRJ|WKS|PRA|FLD)/)
  if (dashTypeMatch) {
    return dashTypeMatch[1] as SectionType
  }
  
  // Pattern 2: TYPE at start (like "LEC A", "TUT 1")
  const startTypeMatch = sectionCode.match(/^(LEC|TUT|LAB|EXR|SEM|PRJ|WKS|PRA|FLD)/)
  if (startTypeMatch) {
    return startTypeMatch[1] as SectionType
  }
  
  return 'OTHER'
}

// Transform external availability to internal
function transformAvailability(external: z.infer<typeof ExternalAvailabilitySchema>): SectionAvailability {
  const capacity = parseInt(external.capacity) || 0
  const enrolled = parseInt(external.enrolled) || 0
  const availableSeats = parseInt(external.available_seats)
  
  let status: SectionAvailability['status'] = 'Unknown'
  if (external.status === 'Open') status = 'Open'
  else if (external.status === 'Closed') status = 'Closed' 
  else if (external.status === 'Waitlist') status = 'Waitlist'
  
  return {
    capacity,
    enrolled,
    status,
    availableSeats
  }
}

// Transform external meeting to internal
function transformMeeting(external: z.infer<typeof ExternalMeetingSchema>): InternalMeeting {
  return {
    time: external.time || 'TBD',
    location: external.location || 'TBD',
    instructor: external.instructor || 'TBD',
    dates: external.dates || 'TBD'
  }
}

// Transform external section to internal
function transformSection(external: z.infer<typeof ExternalSectionSchema>, courseKey: string): InternalSection {
  const sectionType = parseSectionType(external.section)
  const meetings = (external.meetings || []).map(transformMeeting)
  const availability = transformAvailability(external.availability)
  
  return {
    id: `${courseKey}_${external.section}`,
    sectionCode: external.section,
    sectionType,
    meetings,
    availability,
    classAttributes: (external.class_attributes || "").trim() // Transform to camelCase, clean whitespace
  }
}

// Transform external term to internal
function transformTerm(external: z.infer<typeof ExternalTermSchema>, courseKey: string): InternalTerm {
  const sections = (external.schedule || []).map(section => 
    transformSection(section, courseKey)
  )
  
  return {
    termCode: external.term_code,
    termName: external.term_name,
    sections
  }
}

// Main transformation function: External course -> Internal course
export function transformExternalCourse(external: unknown): InternalCourse {
  // Runtime validation with detailed error reporting
  try {
    const validated = ExternalCourseSchema.parse(external)
    const courseKey = `${validated.subject}${validated.course_code}`
    
    // Transform to internal types
    const terms = (validated.terms || []).map(term => 
      transformTerm(term, courseKey)
    )
    
    // Parse and validate credits
    let credits = 3.0 // Default value
    if (validated.credits) {
      const parsed = parseFloat(validated.credits)
      if (!isNaN(parsed) && parsed > 0) {
        credits = parsed
      }
    }
    
    return {
      subject: validated.subject,
      courseCode: validated.course_code,
      title: validated.title,
      credits,
      description: validated.description,
      enrollmentRequirement: validated.enrollment_requirement,
      terms
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Course validation failed:', error.issues)
      throw new Error(`Invalid course data: ${error.issues.map((e) => e.message).join(', ')}`)
    }
    throw error
  }
}

// Validate and transform course data file
export function transformExternalCourseData(external: unknown): { 
  metadata: { subject: string; totalCourses: number }
  courses: InternalCourse[] 
} {
  try {
    const validated = ExternalCourseDataSchema.parse(external)
    
    const courses = validated.courses.map(transformExternalCourse)
    
    return {
      metadata: {
        subject: validated.metadata.subject,
        totalCourses: validated.metadata.total_courses
      },
      courses
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Course data validation failed:', error.issues)
      throw new Error(`Invalid course data file: ${error.issues.map((e) => e.message).join(', ')}`)
    }
    throw error
  }
}

// Validation-only function for debugging
export function validateExternalCourse(external: unknown): boolean {
  try {
    ExternalCourseSchema.parse(external)
    return true
  } catch {
    return false
  }
}