import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'planner-source-maps-'))
  await mkdir(join(directory, 'scripts'))
  await mkdir(join(directory, 'out'))
  await copyFile(
    resolve('scripts/finalize-source-maps.mts'),
    join(directory, 'scripts/finalize-source-maps.mts')
  )
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

async function asset(name: string, content: string) {
  const path = join(directory, 'out', name)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

function finalize(keyed = true) {
  return spawnSync(process.execPath, [join(directory, 'scripts/finalize-source-maps.mts')], {
    env: { ...process.env, POSTHOG_PERSONAL_API_KEY: keyed ? 'test-key' : '' },
    encoding: 'utf8',
  })
}

test('accepts native debugId instrumentation in a keyed export', async () => {
  await asset('app.js', "console.log('app')\n//# debugId=d45f51e5-3347-465c-8d73-bd474ab0445b\n")

  expect(finalize().status).toBe(0)
})

test('rejects a keyed export containing only legacy chunkId instrumentation', async () => {
  await asset('app.js', "console.log('app')\n//# chunkId=d45f51e5-3347-465c-8d73-bd474ab0445b\n")

  expect(finalize().status).toBe(1)
})

test('rejects a keyed export without instrumentation, including marker-like strings', async () => {
  await asset('app.js', 'console.log("//# debugId=example")\n')

  expect(finalize().status).toBe(1)
})

test('allows an unkeyed export without instrumentation', async () => {
  await asset('app.js', 'console.log("app")\n')

  expect(finalize(false).status).toBe(0)
})

test('removes remaining maps and local references even when a map was already deleted', async () => {
  await asset('chunks/app.js', 'console.log("app")\n//# sourceMappingURL=app.js.map\n')
  await asset('chunks/app.css', 'body{}/*# sourceMappingURL=app.css.map */')
  await asset('chunks/app.css.map', '{}')

  expect(finalize(false).status).toBe(0)
  expect((await readdir(join(directory, 'out/chunks'))).sort()).toEqual(['app.css', 'app.js'])
  expect(await readFile(join(directory, 'out/chunks/app.js'), 'utf8')).not.toContain(
    'sourceMappingURL'
  )
  expect(await readFile(join(directory, 'out/chunks/app.css'), 'utf8')).not.toContain(
    'sourceMappingURL'
  )
})

test.each([
  'console.log("//# sourceMappingURL=missing.map")\n',
  'console.log("/*# sourceMappingURL=missing.map */")\n',
])('preserves source-map-like text inside JavaScript: %s', async (content) => {
  await asset('app.js', content)

  expect(finalize(false).status).toBe(0)
  expect(await readFile(join(directory, 'out/app.js'), 'utf8')).toBe(content)
})

test.each([
  'data:application/json;base64,e30=',
  'https://example.com/app.js.map',
  '//example.com/app.js.map',
])('preserves a nonlocal source-map reference: %s', async (url) => {
  const content = `console.log("app")\n//# sourceMappingURL=${url}\n`
  await asset('app.js', content)

  expect(finalize(false).status).toBe(0)
  expect(await readFile(join(directory, 'out/app.js'), 'utf8')).toBe(content)
})
