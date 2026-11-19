import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeProxyPath, encodeProxyPath, PROXY_PREFIX } from './posthogProxy'

// Mixed case like a real key, so its token needs base64's `+` and `/` swapped.
// Picked for the current key: re-pick it if PROXY_PREFIX changes.
const CONFIG_PATH = 'array/phc_FakeForTest/config.js'

// Paths posthog-js 1.447.7 requests under `api_host`, before `rewriteRequestPath`.
const SDK_PATHS = ['i/v0/e/', 'e/', 'flags/', CONFIG_PATH, 'static/1.447.7/web-vitals.js']

function encode(path: string) {
  return encodeProxyPath(new URL(`https://planner.test${PROXY_PREFIX}/${path}`)).pathname
}

function tokenFor(path: string) {
  return encode(path).slice(`${PROXY_PREFIX}/`.length)
}

describe('an encoded path', () => {
  it.each(SDK_PATHS)('keeps PostHog vocabulary out of %s', (path) => {
    const token = tokenFor(path)
    for (const word of ['flags', 'array', 'phc_', 'static', 'posthog']) {
      expect(token).not.toContain(word)
    }
  })

  it('uses URL-safe base64', () => {
    const token = tokenFor(CONFIG_PATH)
    expect(token).toContain('-')
    expect(token).toContain('_')
  })

  it.each(SDK_PATHS)('is scrambled, not plain base64, for %s', (path) => {
    const plain = btoa(path).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(tokenFor(path)).not.toBe(plain)
  })

  // uBlock's `/?compression=*&ip=` needs a `/` right before the query.
  it.each(SDK_PATHS)('does not end in a slash for %s', (path) => {
    expect(encode(path)).not.toMatch(/\/$/)
  })

  it('leaves URLs outside the proxy alone', () => {
    const url = 'https://planner.test/data/2026-27/CSCI.json'
    expect(encodeProxyPath(new URL(url)).href).toBe(url)
  })

  it('decodes back for every character a URL path can hold', () => {
    // Printable ASCII, minus `?` and `#`, which end the path.
    const chars = Array.from({ length: 94 }, (_, i) => String.fromCharCode(33 + i))
      .filter((c) => c !== '?' && c !== '#')
      .join('')
    const pathname = encode(chars)
    const original = new URL(`https://planner.test${PROXY_PREFIX}/${chars}`).pathname

    expect(decodeProxyPath(pathname.slice(`${PROXY_PREFIX}/`.length))).toBe(
      original.slice(`${PROXY_PREFIX}/`.length)
    )
  })
})

// The Function's folder name is its route, so renaming one without the other
// sends every request to a 404.
it('matches the Function folder', () => {
  const fn = new URL(`../../functions${PROXY_PREFIX}/[[path]].ts`, import.meta.url)
  expect(existsSync(fn)).toBe(true)
})
