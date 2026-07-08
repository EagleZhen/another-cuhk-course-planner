import { SUBJECT_TITLES } from './generated/subjects'

/**
 * Get full subject title for display
 */
export function getSubjectTitle(subjectCode: string): string {
  return SUBJECT_TITLES[subjectCode] || subjectCode
}

/**
 * Get all available subject codes
 */
export function getAllSubjectCodes(): string[] {
  return Object.keys(SUBJECT_TITLES)
}
