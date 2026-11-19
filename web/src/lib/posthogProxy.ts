// Ad blockers match PostHog's paths on any domain, so the browser sends each
// path as one scrambled token, which the proxy Function decodes.

export const PROXY_PREFIX = '/x8m2k'

// Tokens use only base64url, so a plain path with `/` or `.` is never decoded.
const TOKEN = /^[\w-]+$/
// Printable ASCII, which any URL path is. The plain words old tabs send
// (`decide`, `engage`) decode to a byte ≥ 0x80.
const PATH = /^[!-~]+$/

// XOR with our route name, so our tokens differ from other sites'. Not a secret.
function scramble(text: string) {
  return Array.from(text, (char, i) =>
    String.fromCharCode(char.charCodeAt(0) ^ PROXY_PREFIX.charCodeAt(i % PROXY_PREFIX.length))
  ).join('')
}

export function encodeProxyPath(url: URL): URL {
  const prefix = `${PROXY_PREFIX}/`
  if (!url.pathname.startsWith(prefix)) return url

  const token = btoa(scramble(url.pathname.slice(prefix.length)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  const encoded = new URL(url)
  encoded.pathname = prefix + token
  return encoded
}

// The token comes from the browser, so bad input returns null.
export function decodeProxyPath(token: string): string | null {
  if (!TOKEN.test(token)) return null
  let bytes: string
  try {
    bytes = atob(token.replace(/-/g, '+').replace(/_/g, '/'))
  } catch {
    return null
  }
  const path = scramble(bytes)
  return PATH.test(path) ? path : null
}
