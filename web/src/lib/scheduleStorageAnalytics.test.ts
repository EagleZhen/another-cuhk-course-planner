import { beforeEach, describe, expect, it, vi } from 'vitest'
import posthog from 'posthog-js'
import { analytics } from './analytics'
vi.mock('posthog-js', () => ({ default: { capture: vi.fn(), captureException: vi.fn() } }))

beforeEach(() => vi.clearAllMocks())

describe('storage problem reporting', () => {
  it('tracks an expected refusal without creating an exception', () => {
    analytics.scheduleStorageProblem({
      operation: 'restore',
      reason: 'unsupported_version',
      term: '2026-27 Term 1',
      version: 4,
    })
    expect(posthog.capture).toHaveBeenCalledWith('schedule_storage_blocked', {
      operation: 'restore',
      reason: 'unsupported_version',
      term: '2026-27 Term 1',
      stored_version: 4,
      build_id: 'unknown',
    })
    expect(posthog.captureException).not.toHaveBeenCalled()
  })
  it('reports an unexpected failure with its original error and allowlisted context', () => {
    const error = new Error('Storage denied')
    analytics.scheduleStorageProblem({
      operation: 'save',
      reason: 'write_failed',
      term: '2026-27 Term 1',
      error,
    })
    expect(posthog.captureException).toHaveBeenCalledWith(error, {
      error_context: 'schedule_storage',
      operation: 'save',
      reason: 'write_failed',
      term: '2026-27 Term 1',
      stored_version: undefined,
      build_id: 'unknown',
    })
  })
  it('never lets an analytics failure escape into persistence', () => {
    vi.mocked(posthog.capture).mockImplementationOnce(() => {
      throw Error('analytics unavailable')
    })
    expect(() =>
      analytics.scheduleStorageProblem({
        operation: 'restore',
        reason: 'invalid_data',
        term: '2026-27 Term 1',
      })
    ).not.toThrow()
  })
})

it('treats a known quota refusal as an outcome rather than a new crash', () => {
  const error = new Error('quota')
  error.name = 'QuotaExceededError'
  analytics.scheduleStorageProblem({
    operation: 'save',
    reason: 'write_failed',
    term: '2026-27 Term 1',
    error,
  })
  expect(posthog.capture).toHaveBeenCalledWith(
    'schedule_storage_blocked',
    expect.objectContaining({ reason: 'write_failed' })
  )
  expect(posthog.captureException).not.toHaveBeenCalled()
})

it('reports a revision conflict with its storage layer and no schedule contents', () => {
  const problem = {
    operation: 'save' as const,
    reason: 'revision_conflict' as const,
    term: '2026-27 Term 1',
    storageKind: 'record' as const,
    raw: 'private schedule contents',
  }
  analytics.scheduleStorageProblem(problem)
  expect(posthog.capture).toHaveBeenCalledWith('schedule_storage_blocked', {
    operation: 'save',
    reason: 'revision_conflict',
    term: '2026-27 Term 1',
    stored_version: undefined,
    storage_kind: 'record',
    build_id: 'unknown',
  })
  expect(posthog.captureException).not.toHaveBeenCalled()
})
