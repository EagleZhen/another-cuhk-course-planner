import { describe, it, expect } from 'vitest'
import { DEFAULT_CURRENT_TERM } from './constants'
import { TERMS_BY_YEAR } from './generated/terms'

describe('DEFAULT_CURRENT_TERM', () => {
  it('is one of the generated available terms', () => {
    // A rollover that changes the terms without updating the default would open
    // the app on a term with no data. Fail here instead.
    const availableTerms = Object.values(TERMS_BY_YEAR).flat()
    expect(availableTerms).toContain(DEFAULT_CURRENT_TERM)
  })
})
