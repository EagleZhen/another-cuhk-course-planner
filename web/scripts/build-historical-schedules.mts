// Frozen production peers for the same-origin storage regression. Never changes this checkout's HEAD.
import { execFileSync } from 'node:child_process'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const cache = resolve(root, '.cache/schedule-compat')
const revisions = {
  old: '7c32e3dce3ed3e2d9bf82c1a7bac4114900491ac',
  unsafe: 'af450c31fdccbc9c8172012c56be4ad87b928f09',
}
const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: '1',
  POSTHOG_PERSONAL_API_KEY: '',
  POSTHOG_PROJECT_ID: '',
}

for (const [name, revision] of Object.entries(revisions)) {
  const directory = resolve(cache, name)
  const web = resolve(directory, 'web')
  try {
    const manifest = JSON.parse(await readFile(resolve(directory, 'fixture.json'), 'utf8'))
    await access(resolve(web, 'out/index.html'))
    if (manifest.revision === revision) {
      console.log(`Using frozen ${name} export: ${revision}`)
      continue
    }
  } catch {
    // Incomplete builds are rebuilt, never accepted as a compatibility fixture.
  }
  try {
    execFileSync('git', ['cat-file', '-e', `${revision}^{commit}`], { cwd: root, stdio: 'ignore' })
  } catch {
    execFileSync('git', ['fetch', '--no-tags', '--no-write-fetch-head', 'origin', revision], {
      cwd: root,
      stdio: 'inherit',
    })
  }
  await rm(directory, { recursive: true, force: true })
  await mkdir(directory, { recursive: true })
  const archive = execFileSync('git', ['archive', revision, 'web'], {
    cwd: root,
    maxBuffer: 128 * 1024 * 1024,
  })
  execFileSync('tar', ['-x', '-C', directory], { input: archive })
  console.log(`Building frozen ${name} peer: ${revision}`)
  execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: web,
    env,
    stdio: 'inherit',
  })
  execFileSync('npm', ['run', 'build'], { cwd: web, env, stdio: 'inherit' })
  await writeFile(resolve(directory, 'fixture.json'), JSON.stringify({ revision }))
}
