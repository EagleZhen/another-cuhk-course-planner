import { SUBJECT_TITLES, SUBJECTS_BY_YEAR } from './generated/subjects'

/**
 * Get full subject title for display
 */
export function getSubjectTitle(subjectCode: string): string {
  return SUBJECT_TITLES[subjectCode] || subjectCode
}

/**
 * Get the subject codes offered in an academic year (e.g. '2025-26').
 */
export function getSubjectCodesForYear(year: string): readonly string[] {
  return SUBJECTS_BY_YEAR[year] ?? []
}
