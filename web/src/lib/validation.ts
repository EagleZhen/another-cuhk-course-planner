// Runtime validation schemas and transformation functions
// Isolated boundary between external data and internal types

import { z } from 'zod'
import type { InternalCourse, InternalTerm, InternalSection, InternalMeeting, SectionAvailability, SectionType } from './types'
import { SECTION_TYPE_CONFIG } from './types'

// External data schemas (for runtime validation)
const ExternalMeetingSchema = z.object({
  time: z.string().optional().default('TBA'),
  location: z.string().optional().default('TBA'),
  instructor: z.string().optional().default('TBA'),
  dates: z.string().optional().default('TBA')
})

const ExternalAvailabilitySchema = z.object({
  capacity: z.string().optional().default('0'),
  enrolled: z.string().optional().default('0'),
  status: z.string().optional().default('Unknown'),
  available_seats: z.string().optional().default('0'),
  waitlist_capacity: z.string().optional().default('0'),
  waitlist_total: z.string().optional().default('0')
})

const ExternalSectionSchema = z.object({
  section: z.string(),
  meetings: z.array(ExternalMeetingSchema).optional().default([]),
  availability: ExternalAvailabilitySchema.optional().default({
    capacity: '0',
    enrolled: '0',
    status: 'Unknown',
    available_seats: '0',
    waitlist_capacity: '0',
    waitlist_total: '0'
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
  course_attributes: z.string().optional(),
  grading_basis: z.string().optional(),
  terms: z.array(ExternalTermSchema).optional().default([]),
  // Course Outcome fields (snake_case from scraper)
  learning_outcomes: z.string().optional(),
  course_syllabus: z.string().optional(),
  assessment_types: z.record(z.string(), z.string()).optional(),
  feedback_evaluation: z.string().optional(),
  required_readings: z.string().optional(),
  recommended_readings: z.string().optional()
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

// Section type parsing and validation - now configuration-driven
function parseSectionType(sectionCode: string): SectionType {
  // Build regex patterns dynamically from configuration
  const allAliases = Object.entries(SECTION_TYPE_CONFIG)
    .flatMap(([type, config]) => config.aliases.map(alias => ({ alias, type })))
  
  const aliasPattern = allAliases.map(({ alias }) => alias).join('|')
  
  // Pattern 1: --TYPE or -XXX-TYPE (e.g., "--LEC", "-D01-DIS")
  const dashPattern = new RegExp(`-+(?:[A-Z]\\d+-)?(${aliasPattern})`)
  const dashMatch = sectionCode.match(dashPattern)
  if (dashMatch) {
    const foundAlias = dashMatch[1]
    // Find which type this alias belongs to
    const typeEntry = allAliases.find(({ alias }) => alias === foundAlias)
    return typeEntry?.type as SectionType || 'UNK'
  }
  
  // Pattern 2: TYPE at start (like "LEC A", "TUT 1")
  const startPattern = new RegExp(`^(${aliasPattern})`)
  const startMatch = sectionCode.match(startPattern)
  if (startMatch) {
    const foundAlias = startMatch[1]
    // Find which type this alias belongs to
    const typeEntry = allAliases.find(({ alias }) => alias === foundAlias)
    return typeEntry?.type as SectionType || 'UNK'
  }
  
  // Log unrecognized section codes for debugging and pattern improvement
  console.warn(`⚠️ Unrecognized section code pattern: "${sectionCode}"`)
  return 'UNK'
}

// Transform external availability to internal
function transformAvailability(external: z.infer<typeof ExternalAvailabilitySchema>): SectionAvailability {
  const capacity = parseInt(external.capacity) || 0
  const enrolled = parseInt(external.enrolled) || 0
  const availableSeats = parseInt(external.available_seats)
  const waitlistCapacity = parseInt(external.waitlist_capacity) || 0
  const waitlistTotal = parseInt(external.waitlist_total) || 0
  
  let status: SectionAvailability['status'] = 'Unknown'
  if (external.status === 'Open') status = 'Open'
  else if (external.status === 'Closed') status = 'Closed'
  else if (external.status === 'Waitlisted') status = 'Waitlisted'
  
  return {
    capacity,
    enrolled,
    status,
    availableSeats,
    waitlistCapacity,
    waitlistTotal
  }
}

// Transform external meeting to internal
function transformMeeting(external: z.infer<typeof ExternalMeetingSchema>): InternalMeeting {
  return {
    time: external.time || 'TBA',
    location: external.location || 'TBA',
    instructor: external.instructor || 'TBA',
    dates: external.dates || 'TBA'
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
    let credits = 0.0 // Default value
    if (validated.credits) {
      const parsed = parseFloat(validated.credits)
      if (!isNaN(parsed) && parsed >= 0) {
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
      courseAttributes: validated.course_attributes,
      gradingBasis: validated.grading_basis,
      terms,
      // Course Outcome fields (snake_case → camelCase transformation)
      learningOutcomes: validated.learning_outcomes,
      courseSyllabus: validated.course_syllabus,
      assessmentTypes: validated.assessment_types,
      feedbackEvaluation: validated.feedback_evaluation,
      requiredReadings: validated.required_readings,
      recommendedReadings: validated.recommended_readings
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