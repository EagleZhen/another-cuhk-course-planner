import type { CaptureResult } from 'posthog-js'

export interface ClientExceptionContext {
  page_visibility: DocumentVisibilityState
  navigation_type: string
  time_since_page_load_ms: number
}

export function getClientExceptionContext(): ClientExceptionContext {
  const [navigation] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]

  return {
    page_visibility: document.visibilityState,
    navigation_type: navigation?.type ?? 'unknown',
    time_since_page_load_ms: Math.round(performance.now()),
  }
}

export function preparePostHogEvent(
  event: CaptureResult | null,
  exceptionContext?: ClientExceptionContext
): CaptureResult | null {
  if (!event) return null

  const properties = { ...event.properties }
  const currentUrl = properties.$current_url
  if (typeof currentUrl === 'string') {
    properties.$current_url = currentUrl.split('?')[0]
  }

  if (event.event === '$exception' && exceptionContext) {
    Object.assign(properties, exceptionContext)
  }

  return { ...event, properties }
}
