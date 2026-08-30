// Fails the build if any source map reaches the exported artifact. Maps are uploaded to
// PostHog and deleted at build time (see next.config.ts); publishing one would serve our
// source to everyone. Runs after `next build`, needs no key and no network.

import { readdir } from 'node:fs/promises'
import { relative, resolve } from 'node:path'

const outDir = resolve(import.meta.dirname, '..', 'out')

const entries = await readdir(outDir, { recursive: true, withFileTypes: true })
const sourceMaps = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith('.map'))
  .map((entry) => relative(outDir, resolve(entry.parentPath, entry.name)))

if (sourceMaps.length > 0) {
  console.error(
    'Source maps found in web/out/ — they must not be published:\n' +
      sourceMaps.map((file) => `  ${file}`).join('\n')
  )
  process.exit(1)
}
