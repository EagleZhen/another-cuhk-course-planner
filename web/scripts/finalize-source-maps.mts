// Removes exported source maps and dangling local references. Keyed builds must retain
// debug instrumentation; upload failures are enforced by the preceding Next build hook.

import { access, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const JS_SOURCE_MAPPING_URL = /^[ \t]*\/\/# sourceMappingURL=([^\s]+)[ \t]*$/gm
const CSS_SOURCE_MAPPING_URL = /\/\*# sourceMappingURL=([^\s*]+)[ \t]*\*\/[ \t]*$/gm

// Native Turbopack IDs and legacy PostHog IDs; strings inside a bundle don't count.
const DEBUG_ID = /^\/\/# (?:chunkId|debugId)=/m

const outDir = resolve(import.meta.dirname, '..', 'out')

const entries = await readdir(outDir, { recursive: true, withFileTypes: true })
const files = entries
  .filter((entry) => entry.isFile())
  .map((entry) => resolve(entry.parentPath, entry.name))

for (const sourceMap of files.filter((file) => file.endsWith('.map'))) {
  console.log(`Deleting source map from the export: ${relative(outDir, sourceMap)}`)
  await rm(sourceMap)
}

// PostHog may have deleted a map before export, leaving its reference behind.
for (const file of files.filter((file) => file.endsWith('.js') || file.endsWith('.css'))) {
  const content = await readFile(file, 'utf8')
  const sourceMapComment = file.endsWith('.js') ? JS_SOURCE_MAPPING_URL : CSS_SOURCE_MAPPING_URL
  const missing = new Set<string>()

  for (const [, map] of content.matchAll(sourceMapComment)) {
    if (map.startsWith('//')) continue
    const url = new URL(map, pathToFileURL(file))
    if (url.protocol !== 'file:') continue

    try {
      await access(fileURLToPath(url))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      missing.add(map)
    }
  }

  const stripped = content.replace(sourceMapComment, (comment, map: string) =>
    missing.has(map) ? '' : comment
  )

  if (stripped !== content) await writeFile(file, stripped)
}

// IDs establish instrumentation, not successful upload.
if (process.env.POSTHOG_PERSONAL_API_KEY) {
  const scripts = files.filter((file) => file.endsWith('.js'))
  const contents = await Promise.all(scripts.map((file) => readFile(file, 'utf8')))

  if (!contents.some((content) => DEBUG_ID.test(content))) {
    console.error('No source-map IDs in out/: debug instrumentation is missing.')
    process.exit(1)
  }
}
