'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { CourseEnrollment, InternalCourse } from '@/lib/types'
import { getDeterministicColor, syncCart } from '@/lib/courseUtils'
import { readStoredEnrollments, serializeStoredSchedule } from '@/lib/storedSchedule'
import { analytics } from '@/lib/analytics'

export type ReadySchedule = {
  term: string
  status: 'ready'
  enrollments: CourseEnrollment[]
  envelope: Record<string, unknown>
  saveStatus: 'saved' | 'pending' | 'failed'
  saveError?: unknown
  catalogStamp?: string
}
export type SavedSchedule =
  | { term: string; status: 'loading' }
  | {
      term: string
      status: 'blocked'
      reason: 'read_failed' | 'invalid_data' | 'unsupported_version'
      raw?: string
      version?: number
      error?: unknown
    }
  | ReadySchedule

type ScheduleState = { active: SavedSchedule; pending: Record<string, ReadySchedule> }
type Action =
  | { type: 'switch'; term: string }
  | { type: 'loaded'; cart: SavedSchedule }
  | { type: 'edit'; term: string; update: (previous: CourseEnrollment[]) => CourseEnrollment[] }
  | { type: 'sync'; term: string; courses: InternalCourse[]; scrapedAt: Date }
  | { type: 'save-result'; snapshot: ReadySchedule; outcome: 'saved' | 'failed'; error?: unknown }
  | { type: 'retry'; term: string }

export function createScheduleState(term: string): ScheduleState {
  return { active: { term, status: 'loading' }, pending: {} }
}

export function scheduleReducer(state: ScheduleState, action: Action): ScheduleState {
  const cart = state.active
  switch (action.type) {
    case 'switch': {
      if (cart.term === action.term) return state
      const pending = { ...state.pending }
      if (cart.status === 'ready' && cart.saveStatus !== 'saved') pending[cart.term] = cart
      const active = pending[action.term] ?? { term: action.term, status: 'loading' as const }
      delete pending[action.term]
      return { active, pending }
    }
    case 'loaded':
      return cart.term === action.cart.term && cart.status === 'loading'
        ? { ...state, active: action.cart }
        : state
    case 'edit': {
      if (cart.term !== action.term || cart.status !== 'ready') return state
      const enrollments = action.update(cart.enrollments)
      return enrollments === cart.enrollments
        ? state
        : {
            ...state,
            active: { ...cart, enrollments, saveStatus: 'pending', saveError: undefined },
          }
    }
    case 'sync': {
      if (cart.term !== action.term || cart.status !== 'ready') return state
      const stamp = action.scrapedAt.toISOString()
      if (cart.catalogStamp === stamp) return state
      const enrollments = syncCart(cart.enrollments, action.courses, cart.term, action.scrapedAt)
      return {
        ...state,
        active: {
          ...cart,
          enrollments,
          catalogStamp: stamp,
          saveStatus: enrollments === cart.enrollments ? cart.saveStatus : 'pending',
        },
      }
    }
    case 'save-result': {
      const pending = { ...state.pending }
      const result = { ...action.snapshot, saveStatus: action.outcome, saveError: action.error }
      if (pending[action.snapshot.term] === action.snapshot) {
        if (action.outcome === 'saved') delete pending[action.snapshot.term]
        else pending[action.snapshot.term] = result
      }
      if (cart !== action.snapshot && state.pending[action.snapshot.term] !== action.snapshot)
        return state
      return { active: cart === action.snapshot ? result : cart, pending }
    }
    case 'retry':
      return cart.term === action.term && cart.status === 'ready' && cart.saveStatus === 'failed'
        ? { ...state, active: { ...cart, saveStatus: 'pending', saveError: undefined } }
        : state
  }
}

function loadSchedule(term: string): SavedSchedule {
  let raw: string | null
  try {
    raw = localStorage.getItem(`schedule_${term}`)
  } catch (error) {
    return { term, status: 'blocked', reason: 'read_failed', error }
  }
  if (raw === null)
    return {
      term,
      status: 'ready',
      enrollments: [],
      envelope: {},
      saveStatus: 'saved',
    }
  let result
  try {
    result = readStoredEnrollments(JSON.parse(raw))
  } catch {
    return { term, status: 'blocked', reason: 'invalid_data', raw }
  }
  if (result.status === 'blocked') return { term, ...result, raw }
  const enrollments = result.enrollments.map((enrollment) => {
    const id = `${enrollment.course.subject}${enrollment.course.courseCode}`
    return {
      ...enrollment,
      courseId: enrollment.courseId.includes('_') ? id : enrollment.courseId,
      color: getDeterministicColor(id),
    }
  })
  return {
    term,
    status: 'ready',
    enrollments,
    envelope: result.envelope,
    saveStatus: 'saved',
  }
}

export function useSavedSchedule(initialTerm: string) {
  const [state, dispatch] = useReducer(scheduleReducer, initialTerm, createScheduleState)
  const cart = state.active
  const attempted = useRef(new WeakSet<ReadySchedule>())
  const reported = useRef(new Set<string>())

  useEffect(() => {
    if (cart.status === 'loading') dispatch({ type: 'loaded', cart: loadSchedule(cart.term) })
  }, [cart])

  useEffect(() => {
    if (cart.status !== 'ready' || cart.saveStatus !== 'pending' || attempted.current.has(cart))
      return
    attempted.current.add(cart)
    try {
      // Destination comes from this snapshot's owner, never a separate selected-term value.
      localStorage.setItem(
        `schedule_${cart.term}`,
        serializeStoredSchedule(cart.enrollments, cart.envelope)
      )
      dispatch({ type: 'save-result', snapshot: cart, outcome: 'saved' })
    } catch (error) {
      dispatch({ type: 'save-result', snapshot: cart, outcome: 'failed', error })
    }
  }, [cart])

  const pending = { ...state.pending }
  if (cart.status === 'ready') {
    if (cart.saveStatus !== 'saved') pending[cart.term] = cart
    else delete pending[cart.term]
  }
  const unsaved = Object.values(pending)
  const hasUnsaved = unsaved.length > 0

  useEffect(() => {
    const problems =
      cart.status === 'blocked'
        ? [cart]
        : Object.values(state.pending).concat(cart.status === 'ready' ? [cart] : [])
    for (const problem of problems) {
      if (problem.status === 'ready' && problem.saveStatus !== 'failed') continue
      const reason = problem.status === 'blocked' ? problem.reason : 'write_failed'
      const operation = problem.status === 'blocked' ? 'restore' : 'save'
      const key = `${operation}|${problem.term}`
      if (reported.current.has(key)) continue
      reported.current.add(key)
      analytics.scheduleStorageProblem({
        operation,
        reason,
        term: problem.term,
        version: problem.status === 'blocked' ? problem.version : undefined,
        error: problem.status === 'blocked' ? problem.error : problem.saveError,
      })
    }
    if (cart.status === 'ready') reported.current.delete(`restore|${cart.term}`)
    if (cart.status === 'ready' && cart.saveStatus === 'saved')
      reported.current.delete(`save|${cart.term}`)
  }, [cart, state.pending])

  useEffect(() => {
    if (!hasUnsaved) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasUnsaved])

  const selectTerm = useCallback((term: string) => dispatch({ type: 'switch', term }), [])
  const updateEnrollments = useCallback(
    (update: (previous: CourseEnrollment[]) => CourseEnrollment[]) =>
      dispatch({ type: 'edit', term: cart.term, update }),
    [cart.term]
  )
  const synchronize = useCallback(
    (courses: InternalCourse[], scrapedAt: Date) =>
      dispatch({ type: 'sync', term: cart.term, courses, scrapedAt }),
    [cart.term]
  )
  const retrySave = useCallback(() => dispatch({ type: 'retry', term: cart.term }), [cart.term])
  return { cart, unsaved, selectTerm, updateEnrollments, synchronize, retrySave }
}
