import { describe, it, expect } from 'vitest'
import { CURRENT_ACADEMIC_YEAR, DEFAULT_CURRENT_TERM } from './constants'
import { SUBJECTS_BY_YEAR } from './generated/subjects'
import { TERMS_BY_YEAR } from './generated/terms'

describe('DEFAULT_CURRENT_TERM', () => {
  it('is one of the generated available terms', () => {
    // A rollover that changes the terms without updating the default would open
    // the app on a term with no data. Fail here instead.
    const availableTerms = Object.values(TERMS_BY_YEAR).flat()
    expect(availableTerms).toContain(DEFAULT_CURRENT_TERM)
  })
})

describe('CURRENT_ACADEMIC_YEAR', () => {
  it('has published data (is a key in the generated manifests)', () => {
    // The app eager-loads this year's subjects. A rollover to a year with no
    // published data would 404 every fetch; fail here instead.
    expect(Object.keys(TERMS_BY_YEAR)).toContain(CURRENT_ACADEMIC_YEAR)
    expect(Object.keys(SUBJECTS_BY_YEAR)).toContain(CURRENT_ACADEMIC_YEAR)
  })
})
