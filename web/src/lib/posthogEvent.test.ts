import type { CaptureResult } from 'posthog-js'
import { describe, expect, it } from 'vitest'
import { preparePostHogEvent, type ClientExceptionContext } from './posthogEvent'

const exceptionContext: ClientExceptionContext = {
  page_visibility: 'hidden',
  navigation_type: 'reload',
  time_since_page_load_ms: 1500,
}

function event(name: string, properties: CaptureResult['properties'] = {}): CaptureResult {
  return {
    uuid: '00000000-0000-4000-8000-000000000000',
    event: name,
    properties,
  }
}

describe('preparePostHogEvent', () => {
  it('keeps null events dropped', () => {
    expect(preparePostHogEvent(null, exceptionContext)).toBeNull()
  })

  it('removes query parameters from captured URLs', () => {
    expect(
      preparePostHogEvent(
        event('$pageview', {
          $current_url: 'https://example.com/planner?utm_source=test#calendar',
        }),
        exceptionContext
      )?.properties.$current_url
    ).toBe('https://example.com/planner')
  })

  it('adds client context to exceptions', () => {
    expect(
      preparePostHogEvent(
        event('$exception', { error_context: 'screenshot_export' }),
        exceptionContext
      )?.properties
    ).toEqual({
      error_context: 'screenshot_export',
      ...exceptionContext,
    })
  })

  it('does not enrich ordinary events', () => {
    const original = event('screenshot_taken', { source: 'calendar' })

    expect(preparePostHogEvent(original, exceptionContext)).toEqual(original)
  })
})
