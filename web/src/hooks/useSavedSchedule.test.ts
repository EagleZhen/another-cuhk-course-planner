import { describe, expect, it } from 'vitest'
import { createScheduleState, scheduleReducer } from './useSavedSchedule'
import { readStoredEnrollments, serializeStoredSchedule } from '../lib/storedSchedule'
import { transformExternalCourseData } from '../lib/validation'

const term = '2026-27 Term 1'
const other = '2026-27 Term 2'
const course = transformExternalCourseData({
  metadata: { subject: 'ACCT', total_courses: 1 },
  courses: [{ subject: 'ACCT', course_code: '1111', title: 'Accounting', credits: '3', terms: [] }],
}).courses[0]
const enrollments = [
  { courseId: 'ACCT1111', course, selectedSections: [], color: 'blue', isVisible: true },
]
const loaded = () => {
  const initial = createScheduleState(term)
  return scheduleReducer(initial, {
    type: 'loaded',
    expected: initial.active,
    cart: {
      term,
      status: 'ready',
      enrollments,
      envelope: {},
      saveStatus: 'saved',
      revision: 'base',
    },
  })
}

describe('owned saved schedules', () => {
  it('loading alone grants no save authority', () => {
    expect(loaded().active).toMatchObject({ term, status: 'ready', saveStatus: 'saved' })
    const loading = createScheduleState(term)
    expect(scheduleReducer(loading, { type: 'edit', term, update: () => enrollments })).toBe(
      loading
    )
  })

  it('does not pair the next term with outgoing contents or accept its stale callback', () => {
    const switched = scheduleReducer(loaded(), { type: 'switch', term: other })
    expect(switched.active).toEqual({ term: other, status: 'loading' })
    expect(scheduleReducer(switched, { type: 'edit', term, update: () => [] })).toBe(switched)
    expect(
      scheduleReducer(switched, {
        type: 'loaded',
        expected: loaded().active,
        cart: loaded().active,
      })
    ).toBe(switched)
  })

  it('a failed load stays blocked even if an edit or sync is attempted', () => {
    const initial = createScheduleState(term)
    const blocked = scheduleReducer(initial, {
      type: 'loaded',
      expected: initial.active,
      cart: { term, status: 'blocked', reason: 'invalid_data', raw: 'original' },
    })
    expect(scheduleReducer(blocked, { type: 'edit', term, update: () => enrollments })).toBe(
      blocked
    )
    expect(
      scheduleReducer(blocked, { type: 'sync', term, courses: [course], scrapedAt: new Date() })
    ).toBe(blocked)
  })

  it('retains failed edits under their owner while another term loads', () => {
    let state = scheduleReducer(loaded(), { type: 'edit', term, update: () => [] })
    const snapshot = state.active
    if (snapshot.status !== 'ready') throw Error('expected ready')
    state = scheduleReducer(state, {
      type: 'save-result',
      snapshot,
      result: { status: 'failed', reason: 'write_failed' },
    })
    state = scheduleReducer(state, { type: 'switch', term: other })
    expect(state.pending[term]).toMatchObject({ term, enrollments: [], saveStatus: 'failed' })
    state = scheduleReducer(state, { type: 'switch', term })
    expect(state.active).toMatchObject({ term, enrollments: [], saveStatus: 'failed' })
  })

  it('a completed outgoing save updates only that pending owner', () => {
    let state = scheduleReducer(loaded(), { type: 'edit', term, update: () => [] })
    const snapshot = state.active
    if (snapshot.status !== 'ready') throw Error('expected ready')
    state = scheduleReducer(state, { type: 'switch', term: other })
    state = scheduleReducer(state, {
      type: 'save-result',
      snapshot,
      result: { status: 'saved', revision: 'next' },
    })
    expect(state.active).toEqual({ term: other, status: 'loading' })
    expect(state.pending[term]).toBeUndefined()
  })

  it('empty edits round-trip through the actual save producer without dropping metadata', () => {
    const raw = serializeStoredSchedule([], { futureEnvelope: 'keep' })
    expect(readStoredEnrollments(JSON.parse(raw))).toMatchObject({
      status: 'ready',
      enrollments: [],
      envelope: { futureEnvelope: 'keep' },
    })
  })
})

it('a save failure is explicit even without an error payload', () => {
  const course = transformExternalCourseData({
    metadata: { subject: 'ACCT', total_courses: 1 },
    courses: [{ subject: 'ACCT', course_code: '1111', title: 'Accounting', terms: [] }],
  }).courses[0]
  const initial = createScheduleState(term)
  const state = scheduleReducer(initial, {
    type: 'loaded',
    expected: initial.active,
    cart: {
      term,
      status: 'ready',
      enrollments: [
        { courseId: 'ACCT1111', course, selectedSections: [], color: '', isVisible: true },
      ],
      envelope: {},
      saveStatus: 'pending',
      revision: 'base',
    },
  })
  if (state.active.status !== 'ready') throw Error('expected ready')
  expect(
    scheduleReducer(state, {
      type: 'save-result',
      snapshot: state.active,
      result: { status: 'failed', reason: 'write_failed' },
    }).active
  ).toMatchObject({ saveStatus: 'failed' })
})

it('a retried save cannot resurrect older pending edits on a later term visit', () => {
  let state = scheduleReducer(loaded(), { type: 'edit', term, update: () => [] })
  if (state.active.status !== 'ready') throw Error('expected ready')
  state = scheduleReducer(state, {
    type: 'save-result',
    snapshot: state.active,
    result: { status: 'failed', reason: 'write_failed' },
  })
  state = scheduleReducer(state, { type: 'switch', term: other })
  state = scheduleReducer(state, { type: 'switch', term })
  state = scheduleReducer(state, { type: 'retry', term })
  if (state.active.status !== 'ready') throw Error('expected ready')
  state = scheduleReducer(state, {
    type: 'save-result',
    snapshot: state.active,
    result: { status: 'saved', revision: 'next' },
  })
  state = scheduleReducer(state, { type: 'switch', term: other })
  state = scheduleReducer(state, { type: 'switch', term })
  expect(state.active).toEqual({ term, status: 'loading' })
})

it('ignores an outgoing edit callback after the next owner is already ready', () => {
  let state = scheduleReducer(loaded(), { type: 'switch', term: other })
  state = scheduleReducer(state, {
    type: 'loaded',
    expected: state.active,
    cart: {
      term: other,
      status: 'ready',
      enrollments,
      envelope: {},
      saveStatus: 'saved',
      revision: 'base',
    },
  })
  expect(scheduleReducer(state, { type: 'edit', term, update: () => [] })).toBe(state)
})

it('rejects a previous load attempt after leaving and returning to the same term', () => {
  const initial = createScheduleState(term)
  const firstAttempt = initial.active
  let state = scheduleReducer(initial, { type: 'switch', term: other })
  state = scheduleReducer(state, { type: 'switch', term })
  expect(
    scheduleReducer(state, { type: 'loaded', expected: firstAttempt, cart: loaded().active })
  ).toBe(state)
})

it('advances the base revision after committing an older edit without acknowledging newer contents', () => {
  let state = scheduleReducer(loaded(), { type: 'edit', term, update: () => [] })
  const snapshot = state.active
  if (snapshot.status !== 'ready') throw Error('expected ready')
  state = scheduleReducer(state, { type: 'edit', term, update: () => enrollments })
  const completed = scheduleReducer(state, {
    type: 'save-result',
    snapshot,
    result: { status: 'saved', revision: 'next' },
  })
  expect(completed.active).toMatchObject({ saveStatus: 'pending', revision: 'next', enrollments })
})

it('advances a pending inactive owner without replacing its newer contents', () => {
  let state = scheduleReducer(loaded(), { type: 'edit', term, update: () => [] })
  const snapshot = state.active
  if (snapshot.status !== 'ready') throw Error('expected ready')
  state = scheduleReducer(state, { type: 'edit', term, update: () => enrollments })
  state = scheduleReducer(state, { type: 'switch', term: other })
  state = scheduleReducer(state, {
    type: 'save-result',
    snapshot,
    result: { status: 'saved', revision: 'next' },
  })
  expect(state.active).toEqual({ term: other, status: 'loading' })
  expect(state.pending[term]).toMatchObject({
    revision: 'next',
    enrollments,
    saveStatus: 'pending',
  })
})

it('keeps editing after a refused write without silently resuming autosave', () => {
  let state = scheduleReducer(loaded(), { type: 'edit', term, update: () => [] })
  if (state.active.status !== 'ready') throw Error('expected ready')
  state = scheduleReducer(state, {
    type: 'save-result',
    snapshot: state.active,
    result: { status: 'refused', reason: 'revision_conflict' },
  })
  state = scheduleReducer(state, { type: 'edit', term, update: () => enrollments })
  expect(state.active).toMatchObject({
    saveStatus: 'refused',
    enrollments,
    saveProblem: { reason: 'revision_conflict' },
  })
})

it('keeps pending contents when a confirmed replacement cannot be read', () => {
  const state = loaded()
  if (state.active.status !== 'ready') throw Error('expected ready')
  const result = scheduleReducer(state, {
    type: 'reload-result',
    expected: state.active,
    cart: { term, status: 'blocked', reason: 'unsupported_version' },
  })
  expect(result.active).toMatchObject({ status: 'ready', enrollments, saveStatus: 'refused' })
})

it('does not discard edits made while a replacement is loading', () => {
  let state = loaded()
  const expected = state.active
  if (expected.status !== 'ready') throw Error('expected ready')
  state = scheduleReducer(state, { type: 'edit', term, update: () => [] })
  expect(scheduleReducer(state, { type: 'reload-result', expected, cart: loaded().active })).toBe(
    state
  )
})
