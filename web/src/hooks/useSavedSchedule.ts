'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { CourseEnrollment, InternalCourse } from '@/lib/types'
import { getDeterministicColor, syncCart } from '@/lib/courseUtils'
import { loadSchedule, commitSchedule } from '@/lib/scheduleStorage'
import type { ScheduleLoad, ScheduleCommit, StorageProblem } from '@/lib/scheduleStorage'
import { analytics } from '@/lib/analytics'

export type ReadySchedule = Extract<ScheduleLoad, { status: 'ready' }> & {
  term: string
  saveStatus: 'saved' | 'pending' | 'failed' | 'refused'
  saveProblem?: StorageProblem
}
export type SavedSchedule =
  | { term: string; status: 'loading' }
  | ({ term: string } & Extract<ScheduleLoad, { status: 'blocked' }>)
  | ReadySchedule

type ScheduleState = { active: SavedSchedule; pending: Record<string, ReadySchedule> }
type Action =
  | { type: 'switch'; term: string }
  | { type: 'loaded'; expected: SavedSchedule; cart: SavedSchedule }
  | { type: 'edit'; term: string; update: (previous: CourseEnrollment[]) => CourseEnrollment[] }
  | { type: 'sync'; term: string; courses: InternalCourse[]; scrapedAt: Date }
  | { type: 'save-result'; snapshot: ReadySchedule; result: ScheduleCommit }
  | { type: 'retry'; term: string }
  | { type: 'reload-result'; expected: ReadySchedule; cart: SavedSchedule }

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
      return cart === action.expected && cart.term === action.cart.term && cart.status === 'loading'
        ? { ...state, active: action.cart }
        : state
    case 'edit': {
      if (cart.term !== action.term || cart.status !== 'ready') return state
      const enrollments = action.update(cart.enrollments)
      return enrollments === cart.enrollments
        ? state
        : {
            ...state,
            active: {
              ...cart,
              enrollments,
              saveStatus: cart.saveStatus === 'refused' ? 'refused' : 'pending',
            },
          }
    }
    case 'sync': {
      if (cart.term !== action.term || cart.status !== 'ready') return state
      const stamp = action.scrapedAt.getTime()
      if (cart.catalogStamp !== undefined && stamp <= cart.catalogStamp) return state
      const enrollments = syncCart(cart.enrollments, action.courses, cart.term, action.scrapedAt)
      return {
        ...state,
        active: {
          ...cart,
          enrollments,
          catalogStamp: stamp,
          saveStatus:
            enrollments === cart.enrollments || cart.saveStatus === 'refused'
              ? cart.saveStatus
              : 'pending',
        },
      }
    }
    case 'save-result': {
      const owner =
        cart.term === action.snapshot.term && cart.status === 'ready'
          ? cart
          : state.pending[action.snapshot.term]
      if (!owner || owner.revision !== action.snapshot.revision) return state
      const { result } = action
      const updated: ReadySchedule =
        result.status === 'saved'
          ? {
              ...owner,
              revision: result.revision,
              saveStatus: owner.enrollments === action.snapshot.enrollments ? 'saved' : 'pending',
              saveProblem: undefined,
            }
          : { ...owner, saveStatus: result.status, saveProblem: result }
      const pending = { ...state.pending }
      if (owner === cart) return { active: updated, pending }
      if (updated.saveStatus === 'saved') delete pending[owner.term]
      else pending[owner.term] = updated
      return { active: cart, pending }
    }
    case 'retry':
      return cart.term === action.term && cart.status === 'ready' && cart.saveStatus === 'failed'
        ? { ...state, active: { ...cart, saveStatus: 'pending', saveProblem: undefined } }
        : state
    case 'reload-result': {
      if (cart !== action.expected || cart.status !== 'ready') return state
      if (action.cart.status === 'blocked') {
        return { ...state, active: { ...cart, saveStatus: 'refused', saveProblem: action.cart } }
      }
      if (action.cart.status !== 'ready') return state
      const pending = { ...state.pending }
      delete pending[cart.term]
      return { active: action.cart, pending }
    }
  }
}

function ownedSchedule(term: string, loaded: ScheduleLoad): SavedSchedule {
  if (loaded.status === 'blocked') return { ...loaded, term }
  return {
    ...loaded,
    term,
    saveStatus: 'saved',
    enrollments: loaded.enrollments.map((enrollment) => {
      const id = `${enrollment.course.subject}${enrollment.course.courseCode}`
      return {
        ...enrollment,
        courseId: enrollment.courseId.includes('_') ? id : enrollment.courseId,
        color: getDeterministicColor(id),
      }
    }),
  }
}

export function useSavedSchedule(initialTerm: string) {
  const [state, dispatch] = useReducer(scheduleReducer, initialTerm, createScheduleState)
  const cart = state.active
  const inFlight = useRef(new Map<string, { snapshot: ReadySchedule; result?: ScheduleCommit }>())
  const reported = useRef(new Set<string>())

  useEffect(() => {
    if (cart.status !== 'loading') return
    void loadSchedule(cart.term).then((loaded) => {
      const result = ownedSchedule(cart.term, loaded)
      dispatch({ type: 'loaded', expected: cart, cart: result })
    })
  }, [cart])

  useEffect(() => {
    // Keep the flight until React applies its result; an urgent edit may render first.
    for (const [term, flight] of inFlight.current) {
      if (!flight.result) continue
      const owner = cart.term === term && cart.status === 'ready' ? cart : state.pending[term]
      if (
        !owner ||
        owner.revision !== flight.snapshot.revision ||
        owner.saveProblem === flight.result
      ) {
        inFlight.current.delete(term)
      }
    }
    const candidates = Object.values(state.pending).concat(cart.status === 'ready' ? [cart] : [])
    for (const snapshot of candidates) {
      if (snapshot.saveStatus !== 'pending' || inFlight.current.has(snapshot.term)) continue
      const flight: { snapshot: ReadySchedule; result?: ScheduleCommit } = { snapshot }
      inFlight.current.set(snapshot.term, flight)
      void commitSchedule(
        snapshot.term,
        snapshot.revision,
        snapshot.enrollments,
        snapshot.envelope,
        snapshot.catalogStamp
      ).then((result) => {
        flight.result = result
        dispatch({ type: 'save-result', snapshot, result })
      })
    }
  }, [cart, state.pending])

  const pending = { ...state.pending }
  if (cart.status === 'ready' && cart.saveStatus !== 'saved') pending[cart.term] = cart
  const unsaved = Object.values(pending)
  const hasUnsaved = unsaved.length > 0

  useEffect(() => {
    const problems = Object.values(state.pending).concat(cart.status === 'ready' ? [cart] : [])
    const failures: { term: string; operation: 'restore' | 'save'; problem: StorageProblem }[] =
      problems.flatMap((owner) =>
        owner.saveProblem && owner.saveStatus !== 'pending'
          ? [{ term: owner.term, operation: 'save' as const, problem: owner.saveProblem }]
          : []
      )
    if (cart.status === 'blocked')
      failures.push({ term: cart.term, operation: 'restore', problem: cart })
    for (const { term, operation, problem } of failures) {
      const key = `${operation}|${term}`
      if (reported.current.has(key)) continue
      reported.current.add(key)
      analytics.scheduleStorageProblem({
        operation,
        term,
        reason: problem.reason,
        version: problem.version,
        storageKind: problem.layer,
        error: problem.error,
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
  const reloadSaved = useCallback(() => {
    if (cart.status !== 'ready' || cart.saveStatus !== 'refused') return
    void loadSchedule(cart.term).then((loaded) => {
      dispatch({ type: 'reload-result', expected: cart, cart: ownedSchedule(cart.term, loaded) })
    })
  }, [cart])
  return { cart, unsaved, selectTerm, updateEnrollments, synchronize, retrySave, reloadSaved }
}
