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
const loaded = () =>
  scheduleReducer(createScheduleState(term), {
    type: 'loaded',
    cart: {
      term,
      status: 'ready',
      enrollments,
      envelope: {},
      saveStatus: 'saved',
    },
  })

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
    expect(scheduleReducer(switched, { type: 'loaded', cart: loaded().active })).toBe(switched)
  })

  it('a failed load stays blocked even if an edit or sync is attempted', () => {
    const blocked = scheduleReducer(createScheduleState(term), {
      type: 'loaded',
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
      outcome: 'failed',
    })
    state = scheduleReducer(state, { type: 'switch', term: other })
    expect(state.pending[term]).toMatchObject({ term, enrollments: [], saveStatus: 'failed' })
    state = scheduleReducer(state, { type: 'switch', term })
    expect(state.active).toMatchObject({ term, enrollments: [], saveStatus: 'failed' })
  })

  it('an older save result cannot acknowledge a newer edit', () => {
    let state = scheduleReducer(loaded(), { type: 'edit', term, update: () => [] })
    const snapshot = state.active
    if (snapshot.status !== 'ready') throw Error('expected ready')
    state = scheduleReducer(state, { type: 'edit', term, update: () => enrollments })
    expect(scheduleReducer(state, { type: 'save-result', snapshot, outcome: 'saved' })).toBe(state)
  })

  it('a completed outgoing save updates only that pending owner', () => {
    let state = scheduleReducer(loaded(), { type: 'edit', term, update: () => [] })
    const snapshot = state.active
    if (snapshot.status !== 'ready') throw Error('expected ready')
    state = scheduleReducer(state, { type: 'switch', term: other })
    state = scheduleReducer(state, { type: 'save-result', snapshot, outcome: 'saved' })
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
  const state = scheduleReducer(createScheduleState(term), {
    type: 'loaded',
    cart: {
      term,
      status: 'ready',
      enrollments: [
        { courseId: 'ACCT1111', course, selectedSections: [], color: '', isVisible: true },
      ],
      envelope: {},
      saveStatus: 'pending',
    },
  })
  if (state.active.status !== 'ready') throw Error('expected ready')
  expect(
    scheduleReducer(state, {
      type: 'save-result',
      snapshot: state.active,
      outcome: 'failed',
    }).active
  ).toMatchObject({ saveStatus: 'failed' })
})

it('a retried save cannot resurrect older pending edits on a later term visit', () => {
  let state = scheduleReducer(loaded(), { type: 'edit', term, update: () => [] })
  if (state.active.status !== 'ready') throw Error('expected ready')
  state = scheduleReducer(state, {
    type: 'save-result',
    snapshot: state.active,
    outcome: 'failed',
  })
  state = scheduleReducer(state, { type: 'switch', term: other })
  state = scheduleReducer(state, { type: 'switch', term })
  state = scheduleReducer(state, { type: 'retry', term })
  if (state.active.status !== 'ready') throw Error('expected ready')
  state = scheduleReducer(state, { type: 'save-result', snapshot: state.active, outcome: 'saved' })
  state = scheduleReducer(state, { type: 'switch', term: other })
  state = scheduleReducer(state, { type: 'switch', term })
  expect(state.active).toEqual({ term, status: 'loading' })
})

it('ignores an outgoing edit callback after the next owner is already ready', () => {
  let state = scheduleReducer(loaded(), { type: 'switch', term: other })
  state = scheduleReducer(state, {
    type: 'loaded',
    cart: {
      term: other,
      status: 'ready',
      enrollments,
      envelope: {},
      saveStatus: 'saved',
    },
  })
  expect(scheduleReducer(state, { type: 'edit', term, update: () => [] })).toBe(state)
})
