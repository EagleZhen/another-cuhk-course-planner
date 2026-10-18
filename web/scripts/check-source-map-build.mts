// Runs the real build/CLI against a local API; real upload and symbolication need PostHog.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'

const web = resolve(import.meta.dirname, '..')
const releaseId = '00000000-0000-4000-8000-000000000001'
const apiKey = 'phx_local_build_check'
const noProxy = process.env.NO_PROXY || process.env.no_proxy || ''
let releaseResolved = false
let mapsPrepared = false
let apiFailure: unknown

const server = createServer(async (request, response) => {
  try {
    const release = request.url?.match(
      /^\/api\/projects\/1\/error_tracking\/releases\/hash\/([a-f0-9]+)\/?$/
    )
    response.setHeader('Content-Type', 'application/json')
    if (request.method === 'GET' && release) {
      releaseResolved = true
      response.end(
        JSON.stringify({
          id: releaseId,
          hash_id: release[1],
          version: 'build-check',
          project: 'planner',
        })
      )
      return
    }

    assert.equal(request.method, 'POST', 'Unexpected PostHog API method')
    assert.equal(
      request.url?.replace(/\/$/, ''),
      '/api/projects/1/error_tracking/symbol_sets/bulk_check_upload',
      'Unexpected PostHog API endpoint'
    )
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(chunk)
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    assert(Array.isArray(payload.symbol_sets), 'Missing symbol_sets in preparation request')
    if (payload.symbol_sets.length > 0) mapsPrepared = true

    // Treat symbols as already present; no source files are uploaded.
    response.end(JSON.stringify({ chunk_ids_to_upload: [] }))
  } catch (error) {
    apiFailure ??= error
    response.statusCode = 400
    response.end(JSON.stringify({ detail: String(error) }))
  }
})

server.listen(0, '127.0.0.1')
await once(server, 'listening')
try {
  const address = server.address()
  assert(address && typeof address !== 'string')
  await new Promise<void>((done, reject) => {
    const build = spawn('npm', ['run', 'build'], {
      cwd: web,
      stdio: 'inherit',
      env: {
        ...process.env,
        NO_PROXY: [noProxy, '127.0.0.1'].filter(Boolean).join(','),
        POSTHOG_BUILD_CHECK_HOST: `http://127.0.0.1:${address.port}`,
        POSTHOG_PERSONAL_API_KEY: apiKey,
        POSTHOG_PROJECT_ID: '1',
        POSTHOG_RELEASE_ID: '',
        POSTHOG_RELEASE_MODE: 'event',
        POSTHOG_CLI_DRY_RUN: 'false',
        NEXT_PUBLIC_POSTHOG_KEY: '',
      },
    })
    build.once('error', reject)
    build.once('exit', (code, signal) => {
      if (code === 0) done()
      else reject(new Error(`Source-map build failed (${signal ?? code})`))
    })
  })
  if (apiFailure) throw apiFailure
  assert(releaseResolved, 'Release resolution was bypassed')
  assert(mapsPrepared, 'No source maps prepared')

  const files = await readdir(resolve(web, 'out'), { recursive: true, withFileTypes: true })
  assert(
    !files.some((file) => file.isFile() && file.name.endsWith('.map')),
    'Public source map in out/'
  )
  console.log(
    'Source-map build check passed: release resolved, source maps prepared, no public maps.'
  )
} finally {
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done()))
  )
}
