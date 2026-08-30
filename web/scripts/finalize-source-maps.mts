// Clears the source maps PostHog's uploader leaves in the export, and checks that it ran.
//
// The uploader only handles maps it can pair with a chunk, so Next's polyfill map (emitted
// without a sourceMappingURL comment) and the CSS map (posthog-js#2383, fixed only for
// webpack) always survive. Neither holds our source, so deleting beats failing the deploy.

import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, relative, resolve } from 'node:path'

// The JS (`//#`) and CSS (`/*# */`) spellings of the comment.
const SOURCE_MAPPING_URL = /(?:\/\/|\/\*)# sourceMappingURL=([^\s*]+)[ \t]*(?:\*\/)?/g

// Anchored like posthog-cli's own matcher, so a bundled string literal can't pass for a
// real marker.
const CHUNK_ID = /^\/\/# chunkId=/m

const outDir = resolve(import.meta.dirname, '..', 'out')

const entries = await readdir(outDir, { recursive: true, withFileTypes: true })
const files = entries
  .filter((entry) => entry.isFile())
  .map((entry) => resolve(entry.parentPath, entry.name))

const deleted = new Set<string>()

for (const sourceMap of files.filter((file) => file.endsWith('.map'))) {
  console.log(`Deleting source map from the export: ${relative(outDir, sourceMap)}`)
  await rm(sourceMap)
  deleted.add(basename(sourceMap))
}

// Their comments now point at nothing, which 404s in devtools. (The CLI strips its own.)
for (const file of files.filter((file) => file.endsWith('.js') || file.endsWith('.css'))) {
  const content = await readFile(file, 'utf8')
  const stripped = content.replace(SOURCE_MAPPING_URL, (comment, map: string) =>
    deleted.has(map) ? '' : comment
  )

  if (stripped !== content) await writeFile(file, stripped)
}

// The CLI stamps every chunk it processed, so with a key set, no stamps means the plugin
// no-opped — as it does when it isn't the outermost wrapper — leaving traces minified.
if (process.env.POSTHOG_PERSONAL_API_KEY) {
  const scripts = files.filter((file) => file.endsWith('.js'))
  const contents = await Promise.all(scripts.map((file) => readFile(file, 'utf8')))

  if (!contents.some((content) => CHUNK_ID.test(content))) {
    console.error('No chunk IDs in out/: the PostHog source map upload did not run.')
    process.exit(1)
  }
}
