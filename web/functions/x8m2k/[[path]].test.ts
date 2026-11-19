import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeProxyPath, PROXY_PREFIX } from '../../src/lib/posthogProxy'
import { onRequest } from './[[path]]'

const upstream = vi.fn(() => Promise.resolve(new Response('ok')))

beforeEach(() => vi.stubGlobal('fetch', upstream))
afterEach(() => {
  vi.unstubAllGlobals()
  upstream.mockClear()
})

// onRequest reads only these two; the cast stands in for the rest of the Pages
// context (env, waitUntil, next, …), which never runs.
async function proxy(path: string | string[] | undefined, request: Request) {
  await onRequest({ request, params: { path } } as unknown as Parameters<typeof onRequest>[0])
  return upstream.mock.calls[0] as unknown as [url: string, init: RequestInit]
}

function proxyGet(path: string | string[] | undefined, url = 'https://planner.test/x8m2k/e') {
  return proxy(path, new Request(url))
}

describe('the proxied URL', () => {
  it('joins catch-all segments', async () => {
    const [url] = await proxyGet(['i', 'v0', 'e'])
    expect(url).toBe('https://us.i.posthog.com/i/v0/e')
  })

  it('accepts a single segment as a bare string', async () => {
    const [url] = await proxyGet('flags')
    expect(url).toBe('https://us.i.posthog.com/flags')
  })

  it('proxies the bare path, where there is no segment at all', async () => {
    const [url] = await proxyGet(undefined)
    expect(url).toBe('https://us.i.posthog.com/')
  })

  it('preserves the query string', async () => {
    const [url] = await proxyGet('flags', 'https://planner.test/x8m2k/flags?v=2&ver=1.433.4')
    expect(url).toBe('https://us.i.posthog.com/flags?v=2&ver=1.433.4')
  })
})

describe('the upstream host', () => {
  const assets = 'https://us-assets.i.posthog.com'
  const ingest = 'https://us.i.posthog.com'

  it.each([
    ['static/1.433.4/exception-autocapture.js', assets],
    ['array/phc_test/config.js', assets],
    ['e', ingest],
    // The prefix is anchored: `static/` deeper in the path is not an asset.
    ['e/static/x', ingest],
  ])('serves %s from %s', async (path, expected) => {
    const [url] = await proxyGet(path.split('/'))
    expect(url).toBe(`${expected}/${path}`)
  })
})

describe('an encoded path', () => {
  const assets = 'https://us-assets.i.posthog.com'
  const ingest = 'https://us.i.posthog.com'

  it.each([
    ['i/v0/e/', ingest],
    ['e/', ingest],
    ['flags/?v=2', ingest],
    ['array/phc_test/config.js', assets],
    ['static/1.447.7/web-vitals.js', assets],
  ])('reaches PostHog as %s on %s', async (sdkPath, host) => {
    const encoded = encodeProxyPath(new URL(`https://planner.test${PROXY_PREFIX}/${sdkPath}`))
    encoded.searchParams.append('retry_count', '1') // the SDK adds this after the rewrite
    // What the catch-all route hands the Function for this URL.
    const segments = encoded.pathname.slice(`${PROXY_PREFIX}/`.length).split('/')

    const [url] = await proxyGet(segments, encoded.href)

    const expected = new URL(`${host}/${sdkPath}`)
    expected.searchParams.append('retry_count', '1')
    expect(url).toBe(expected.href)
  })
})

describe('a plain path from a tab loaded before encoding', () => {
  it.each([
    'e',
    's',
    'flags',
    'decide',
    'batch',
    'engage',
    'i/v0/e',
    'e/static/x',
    'static/1.433.4/exception-autocapture.js',
    'array/phc_test/config',
    'array/phc_test/config.js',
  ])('forwards %s unchanged', async (path) => {
    const [url] = await proxyGet(path.split('/'))
    expect(new URL(url).pathname).toBe(`/${path}`)
  })
})

describe('the proxied request', () => {
  it('forwards method, headers and body unchanged', async () => {
    const request = new Request('https://planner.test/x8m2k/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
      body: '{"event":"$pageview"}',
    })

    const [, init] = await proxy(['e'], request)

    expect(init.method).toBe('POST')
    expect(init.headers).toBe(request.headers)
    expect(init.body).toBe(request.body)
  })

  it('follows redirects server-side, so the browser never sees PostHog', async () => {
    const [, init] = await proxyGet(['e'])
    expect(init.redirect).toBe('follow')
  })
})
