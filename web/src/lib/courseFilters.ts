// The single source of truth for which courses match the user's filters. Pure: no React,
// no shuffle, no result limiting (those stay with the caller). Each dimension is a
// predicate builder, so a new filter is one builder plus one criteria field.

import type { InternalCourse, InternalSection } from './types'
import { getDayIndex } from './courseUtils'

/** The user's active selections. An empty/blank field means "no constraint". */
export interface CourseFilterCriteria {
  searchTerm: string // raw; trimmed/lowercased here
  subjects: Set<string> // empty = all subjects
  days: Set<number> // 0=Mon..6=Sun; empty = all days
}

/** Ambient facts a predicate needs but the user didn't explicitly select. */
export interface CourseFilterContext {
  term: string
  // enrollments: CourseEnrollment[]  // added by the #188 no-conflict filter later
}

type CoursePredicate = (course: InternalCourse) => boolean
type PredicateBuilder = (
  criteria: CourseFilterCriteria,
  context: CourseFilterContext
) => CoursePredicate

/** Shared "matches everything" predicate; filtered out before composition. */
const TRUE: CoursePredicate = () => true

/** The one place term sections are resolved. */
export function termSectionsOf(course: InternalCourse, term: string): InternalSection[] {
  return course.terms.find((t) => t.termName === term)?.sections ?? []
}

/** True if any of the section's meetings falls on a day in `days`. */
export function sectionMatchesDays(section: InternalSection, days: Set<number>): boolean {
  return section.meetings.some((meeting) => {
    const dayIndex = getDayIndex(meeting.time)
    return dayIndex !== -1 && days.has(dayIndex)
  })
}

/**
 * Single source of truth for keyword matching. `query` must already be lowercased.
 * Matches course code (e.g. "csci1020" or just "1020"), title, description, and
 * instructor names in the given term.
 */
export function courseMatchesKeyword(course: InternalCourse, query: string, term: string): boolean {
  // `courseCode` is a suffix of `fullCode`, so matching it is covered by fullCode.
  const fullCode = `${course.subject}${course.courseCode}`.toLowerCase()
  if (
    fullCode.includes(query) ||
    course.title.toLowerCase().includes(query) ||
    (course.description?.toLowerCase().includes(query) ?? false)
  ) {
    return true
  }
  return termSectionsOf(course, term).some((section) =>
    section.meetings.some((meeting) => meeting.instructors.toLowerCase().includes(query))
  )
}

const buildTermPredicate: PredicateBuilder = (_criteria, context) => (course) =>
  course.terms.some((t) => t.termName === context.term)

const buildSubjectPredicate: PredicateBuilder = (criteria) =>
  criteria.subjects.size === 0 ? TRUE : (course) => criteria.subjects.has(course.subject)

const buildKeywordPredicate: PredicateBuilder = (criteria, context) => {
  const query = criteria.searchTerm.trim().toLowerCase()
  if (!query) return TRUE
  return (course) => courseMatchesKeyword(course, query, context.term)
}

const buildDayPredicate: PredicateBuilder = (criteria, context) =>
  criteria.days.size === 0
    ? TRUE
    : (course) =>
        termSectionsOf(course, context.term).some((section) =>
          sectionMatchesDays(section, criteria.days)
        )

// Every course-level dimension. Adding a filter = append one builder here.
const ALL_BUILDERS: PredicateBuilder[] = [
  buildTermPredicate,
  buildSubjectPredicate,
  buildKeywordPredicate,
  buildDayPredicate,
]

function composePredicates(
  builders: PredicateBuilder[],
  criteria: CourseFilterCriteria,
  context: CourseFilterContext
): CoursePredicate[] {
  return builders.map((build) => build(criteria, context)).filter((p) => p !== TRUE)
}

/** Filter courses by all active criteria. Order-preserving and deterministic. */
export function filterCourses(
  courses: InternalCourse[],
  criteria: CourseFilterCriteria,
  context: CourseFilterContext
): InternalCourse[] {
  const predicates = composePredicates(ALL_BUILDERS, criteria, context)
  return courses.filter((course) => predicates.every((p) => p(course)))
}

/** Filter by everything except days — used to compute which days still have matches, without the day filter feeding back on itself. */
export function filterCoursesExceptDays(
  courses: InternalCourse[],
  criteria: CourseFilterCriteria,
  context: CourseFilterContext
): InternalCourse[] {
  const builders = ALL_BUILDERS.filter((b) => b !== buildDayPredicate)
  const predicates = composePredicates(builders, criteria, context)
  return courses.filter((course) => predicates.every((p) => p(course)))
}

/** Has the user narrowed the catalog at all? Drives the default result limit. Excludes `term`, which is always active. */
export function hasActiveFilters(criteria: CourseFilterCriteria): boolean {
  return Boolean(criteria.searchTerm.trim()) || criteria.subjects.size > 0 || criteria.days.size > 0
}
