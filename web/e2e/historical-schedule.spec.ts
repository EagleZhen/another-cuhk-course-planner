import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openPlannerAtTerm, selectTerm } from './helpers/planner'
import { readSavedEnrollments, readScheduleRecords } from './helpers/schedule'

const root = resolve(__dirname, '../..')
const origin = 'http://127.0.0.1:3014'
const target = '2026-27 Term 1'
const key = `schedule_${target}`
const title = 'Historical storage fixture'
const refs = {
  old: '7c32e3dce3ed3e2d9bf82c1a7bac4114900491ac',
  unsafe: '728ade84b4e4b3ae1bee364a65bf6968884baba0',
}
const catalog = {
  '2026-27/ACCT': [
    {
      subject: 'ACCT',
      course_code: '1111',
      title,
      credits: '3.00',
      academic_career: 'Undergraduate',
      terms: [
        {
          term_code: '2610',
          term_name: target,
          schedule: [
            {
              section: 'A-LEC (1001)',
              meetings: [
                { time: 'Mo 9:30AM - 10:15AM', location: 'Room 1', instructor: 'Staff', dates: '' },
              ],
              availability: {
                capacity: '30',
                enrolled: '0',
                status: 'Open',
                available_seats: '30',
                waitlist_capacity: '0',
                waitlist_total: '0',
              },
            },
          ],
        },
      ],
    },
  ],
}
const cart = (page: Page) => page.locator('[data-shopping-cart]')
const legacyRaw = (page: Page) => page.evaluate((key) => localStorage.getItem(key), key)
const legacy = async (page: Page) => {
  const raw = await legacyRaw(page)
  return raw === null
    ? null
    : (JSON.parse(raw) as {
        version: number
        enrollments: {
          course: { credits: number | { min: number; max: number } }
          isVisible: boolean
        }[]
      })
}

declare global {
  interface Window {
    historicalWrites: { key: string; value: string | null }[]
  }
}

async function mountBuild(page: Page, build: keyof typeof refs | 'current') {
  const directory =
    build === 'current'
      ? resolve(root, 'web/out')
      : resolve(root, '.cache/schedule-compat', build, 'web/out')
  if (build !== 'current') {
    const manifest = JSON.parse(
      await readFile(resolve(directory, '../../fixture.json'), 'utf8')
    ) as { revision: string }
    expect(manifest.revision).toBe(refs[build])
  }
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== origin || url.pathname.startsWith('/x8m2k/')) return route.abort()
    const file = resolve(
      directory,
      '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname))
    )
    if (!file.startsWith(directory + sep)) throw new Error('Asset path escaped its frozen export')
    await route.fulfill({ path: file })
  })
  await page.addInitScript(() => {
    const writes = (window.historicalWrites = [] as Window['historicalWrites'])
    const set = Storage.prototype.setItem
    const remove = Storage.prototype.removeItem
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('schedule_')) writes.push({ key, value })
      return set.call(this, key, value)
    }
    Storage.prototype.removeItem = function (key) {
      if (key.startsWith('schedule_')) writes.push({ key, value: null })
      return remove.call(this, key)
    }
  })
}

async function parkOldTab(page: Page) {
  await mountBuild(page, 'old')
  await openPlannerAtTerm(page, { term: target, catalog })
  const search = page.locator('[data-course-search]')
  await search.getByText(title, { exact: true }).filter({ visible: true }).click()
  await search.getByText('A-LEC (1001)', { exact: true }).filter({ visible: true }).click()
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).first().click()
  await expect(cart(page).getByText(title, { exact: true })).toBeVisible()
  await expect.poll(async () => (await legacy(page))?.enrollments[0]?.course.credits).toBe(3)
  const original = await legacyRaw(page)
  await selectTerm(page, '2025-26 Term 1')
  await expect(cart(page).getByText('No courses enrolled', { exact: true })).toBeVisible()
  return original
}

async function returnOldYear(page: Page) {
  // The baseline deliberately crashes here, so do not wait for the selector afterward.
  const search = page.locator('[data-course-search]')
  await search.getByTitle('Click to change academic year', { exact: true }).click()
  await search.getByRole('button', { name: '2026-27', exact: true }).click()
}

test('frozen legacy peers reproduce deletion when a range-credit cart reaches the old tab', async ({
  page,
  context,
}) => {
  await parkOldTab(page)
  const newer = await context.newPage()
  await mountBuild(newer, 'unsafe')
  await openPlannerAtTerm(newer, { term: target })
  await expect(cart(newer).getByText(title, { exact: true })).toBeVisible()
  await cart(newer).getByTitle('Hide course', { exact: true }).click()
  await expect
    .poll(() => legacy(newer))
    .toMatchObject({
      version: 3,
      enrollments: [{ course: { credits: { min: 3, max: 3 } }, isVisible: false }],
    })
  const start = await page.evaluate(() => window.historicalWrites.length)
  await returnOldYear(page)
  await expect(
    page.getByRole('heading', { name: 'The planner ran into a problem', exact: true })
  ).toBeVisible()
  const writes = await page.evaluate((start) => window.historicalWrites.slice(start), start)
  expect(writes).toContainEqual({ key, value: null })
  expect(await legacyRaw(page)).toBeNull()
  await newer.reload()
  await selectTerm(newer, target)
  await expect(cart(newer).getByText('No courses enrolled', { exact: true })).toBeVisible()
})

for (const action of ['hide', 'clear'] as const) {
  test(`an old tab cannot overwrite an adopted ${action === 'hide' ? 'cart' : 'empty cart'}`, async ({
    page,
    context,
  }) => {
    const original = await parkOldTab(page)
    const newer = await context.newPage()
    await mountBuild(newer, 'current')
    await openPlannerAtTerm(newer, { term: target })
    await expect(cart(newer).getByText(title, { exact: true })).toBeVisible()
    await cart(newer)
      .getByTitle(action === 'hide' ? 'Hide course' : 'Remove course', { exact: true })
      .click()
    await expect
      .poll(() => readSavedEnrollments(newer, target))
      .toMatchObject(action === 'hide' ? [{ isVisible: false }] : [])
    const before = await readScheduleRecords(newer, target)
    expect(before?.receipt).toMatchObject({ originalLegacyRaw: original })
    const start = await page.evaluate(() => window.historicalWrites.length)
    await returnOldYear(page)
    await expect(cart(page).getByText(title, { exact: true })).toBeVisible()
    await cart(page).getByTitle('Hide course', { exact: true }).click()
    await expect.poll(async () => (await legacy(page))?.enrollments[0]?.isVisible).toBe(false)
    await cart(page).getByTitle('Remove course', { exact: true }).click()
    await expect.poll(() => legacyRaw(page)).toBeNull()
    const writes = await page.evaluate((start) => window.historicalWrites.slice(start), start)
    expect(writes).toContainEqual({ key, value: null })
    expect(writes.some((write) => write.key === key && write.value !== null)).toBe(true)
    expect(await readScheduleRecords(newer, target)).toEqual(before)
    await newer.reload()
    await selectTerm(newer, target)
    if (action === 'hide')
      await expect(cart(newer).getByTitle('Show course', { exact: true })).toBeVisible()
    else await expect(cart(newer).getByText('No courses enrolled', { exact: true })).toBeVisible()
    expect(await readScheduleRecords(newer, target)).toEqual(before)
  })
}
