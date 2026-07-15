// The single source of truth for which courses match the user's filters. Pure: no React,
// no shuffle, no result limiting (those stay with the caller). Each dimension is a
// predicate builder, so a new filter is one builder plus one criteria field.

import type { AcademicCareer, CourseEnrollment, InternalCourse, InternalSection } from './types'
import { getDayIndex, hasConflictFreeEnrollment, isActiveEnrollment } from './courseUtils'

/** The user's active selections. An empty/blank field means "no constraint". */
export interface CourseFilterCriteria {
  searchTerm: string // raw; trimmed/lowercased here
  subjects: Set<string> // empty = all subjects
  days: Set<number> // 0=Mon..6=Sun; empty = all days
  credits: Set<number> // empty = all credit values
  levels: Set<number> // leading course-code digit; empty = all levels
  careers: Set<AcademicCareer> // empty = all academic careers
  noConflictOnly: boolean
}

/** Ambient facts a predicate needs but the user didn't explicitly select. */
export interface CourseFilterContext {
  term: string
  enrollments: CourseEnrollment[]
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

const buildCreditsPredicate: PredicateBuilder = (criteria) =>
  criteria.credits.size === 0 ? TRUE : (course) => criteria.credits.has(course.credits)

const buildLevelPredicate: PredicateBuilder = (criteria) =>
  criteria.levels.size === 0
    ? TRUE
    : (course) => {
        const level = courseLevel(course)
        return level !== undefined && criteria.levels.has(level)
      }

const buildCareerPredicate: PredicateBuilder = (criteria) =>
  criteria.careers.size === 0
    ? TRUE
    : (course) => course.career !== undefined && criteria.careers.has(course.career)

const buildNoConflictPredicate: PredicateBuilder = (criteria, context) => {
  if (!criteria.noConflictOnly) return TRUE

  const baselineSections: InternalSection[] = []
  const sectionsByCourseId = new Map<string, Set<InternalSection>>()

  for (const enrollment of context.enrollments) {
    if (!isActiveEnrollment(enrollment)) continue

    const courseId = `${enrollment.course.subject}${enrollment.course.courseCode}`
    const ownSections = sectionsByCourseId.get(courseId) ?? new Set<InternalSection>()
    sectionsByCourseId.set(courseId, ownSections)

    for (const section of enrollment.selectedSections) {
      baselineSections.push(section)
      ownSections.add(section)
    }
  }

  return (course) => {
    const courseId = `${course.subject}${course.courseCode}`
    const ownSections = sectionsByCourseId.get(courseId)
    const baselineWithoutCourse = ownSections
      ? baselineSections.filter((section) => !ownSections.has(section))
      : baselineSections

    return hasConflictFreeEnrollment(course, baselineWithoutCourse, context.term)
  }
}

/** One filterable dimension. Adding a filter = append an entry here. */
export type FilterKey =
  'term' | 'subject' | 'keyword' | 'day' | 'credits' | 'level' | 'career' | 'noConflict'

const BUILDERS: ReadonlyArray<{ key: FilterKey; build: PredicateBuilder }> = [
  { key: 'term', build: buildTermPredicate },
  { key: 'subject', build: buildSubjectPredicate },
  { key: 'keyword', build: buildKeywordPredicate },
  { key: 'day', build: buildDayPredicate },
  { key: 'credits', build: buildCreditsPredicate },
  { key: 'level', build: buildLevelPredicate },
  { key: 'career', build: buildCareerPredicate },
  { key: 'noConflict', build: buildNoConflictPredicate },
]

function composePredicates(
  criteria: CourseFilterCriteria,
  context: CourseFilterContext,
  exclude?: FilterKey
): CoursePredicate[] {
  return BUILDERS.filter((b) => b.key !== exclude)
    .map((b) => b.build(criteria, context))
    .filter((p) => p !== TRUE)
}

/**
 * Filter courses by all active criteria, optionally skipping one dimension.
 * Skipping a dimension powers its "available values" controls (e.g. the day chips filter
 * by everything except days, so selecting a day can't hide the chips to change it).
 * Order-preserving and deterministic.
 */
export function filterCoursesExcept(
  courses: InternalCourse[],
  criteria: CourseFilterCriteria,
  context: CourseFilterContext,
  exclude?: FilterKey
): InternalCourse[] {
  const predicates = composePredicates(criteria, context, exclude)
  return courses.filter((course) => predicates.every((p) => p(course)))
}

/** Filter courses by all active criteria. */
export function filterCourses(
  courses: InternalCourse[],
  criteria: CourseFilterCriteria,
  context: CourseFilterContext
): InternalCourse[] {
  return filterCoursesExcept(courses, criteria, context)
}

/**
 * A chip filter, described by its engine key and how to read its value(s) off a course.
 * The predicate itself already lives in the engine (keyed by `key`); this adds only the
 * value extractor that `availableValues` needs.
 */
export interface ChipDimension<T> {
  key: FilterKey
  valuesOf: (course: InternalCourse, context: CourseFilterContext) => T[]
}

/**
 * The values this dimension's chips should offer: those present in the data after every
 * OTHER filter applies, plus any currently-selected values so a selected chip never
 * vanishes (which would strand the user with results they can't unfilter).
 */
export function availableValues<T>(
  dimension: ChipDimension<T>,
  courses: InternalCourse[],
  criteria: CourseFilterCriteria,
  context: CourseFilterContext,
  selected: Iterable<T> = []
): T[] {
  const matched = filterCoursesExcept(courses, criteria, context, dimension.key)
  const values = new Set<T>(selected)
  for (const course of matched) {
    for (const value of dimension.valuesOf(course, context)) values.add(value)
  }
  return [...values]
}

/** A course's credit value. */
export const creditsDimension: ChipDimension<number> = {
  key: 'credits',
  valuesOf: (course) => [course.credits],
}

/** A course's level, derived from the leading digit of its code. */
export function courseLevel(course: InternalCourse): number | undefined {
  const level = Number(course.courseCode[0])
  return Number.isInteger(level) && level >= 1 && level <= 9 ? level : undefined
}

/** A course's numeric level; courses without a leading digit contribute no chip. */
export const levelDimension: ChipDimension<number> = {
  key: 'level',
  valuesOf: (course) => {
    const level = courseLevel(course)
    return level !== undefined ? [level] : []
  },
}

/** A course's academic career; courses without one contribute no chip. */
export const careerDimension: ChipDimension<AcademicCareer> = {
  key: 'career',
  valuesOf: (course) => (course.career ? [course.career] : []),
}

/** Day indices (0=Mon..6=Sun) a course meets on, in its current term. */
export const dayDimension: ChipDimension<number> = {
  key: 'day',
  valuesOf: (course, context) => {
    const indices: number[] = []
    for (const section of termSectionsOf(course, context.term)) {
      for (const meeting of section.meetings) {
        const dayIndex = getDayIndex(meeting.time)
        if (dayIndex !== -1) indices.push(dayIndex)
      }
    }
    return indices
  },
}

/**
 * Has the user narrowed the catalog at all? Drives the default result limit (10 vs 100) and
 * shuffle-vs-code-order landing. Deliberately excludes `term` (always active) and `careers`:
 * career is a resting-state population selector (it defaults to Undergraduate), so choosing a
 * career is "which catalog am I browsing", not "I'm hunting for something specific" — only the
 * latter should switch off the shuffled 10-course landing.
 */
export function hasActiveFilters(criteria: CourseFilterCriteria): boolean {
  return (
    Boolean(criteria.searchTerm.trim()) ||
    criteria.subjects.size > 0 ||
    criteria.days.size > 0 ||
    criteria.credits.size > 0 ||
    criteria.levels.size > 0 ||
    criteria.noConflictOnly
  )
}
