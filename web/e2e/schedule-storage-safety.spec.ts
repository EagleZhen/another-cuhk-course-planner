import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { DEFAULT_CURRENT_TERM, SCHEDULE_DATA_VERSION } from '../src/lib/constants'
import { transformExternalCourseData } from '../src/lib/validation'
import { mockCatalog, expectEmptyCatalogLoaded, type CatalogFixtures } from './helpers/catalog'
import { selectTerm } from './helpers/planner'

const first = DEFAULT_CURRENT_TERM
const second = first === '2026-27 Term 2' ? '2026-27 Term 1' : '2026-27 Term 2'
const key = (term: string) => `schedule_${term}`

function externalCourse(term: string, code = '1111') {
  return {
    subject: 'ACCT',
    course_code: code,
    title: `Saved course ${code}`,
    credits: '3.00',
    academic_career: 'Undergraduate',
    terms: [
      {
        term_code: '2610',
        term_name: term,
        schedule: [
          {
            section: 'A-LEC (1001)',
            meetings: [
              {
                time: 'Mo 9:30AM - 10:15AM',
                location: 'Room 1',
                instructor: 'Staff',
                dates: '',
              },
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
  }
}

function schedule(term: string, code = '1111') {
  const {
    courses: [course],
  } = transformExternalCourseData({
    metadata: { subject: 'ACCT', total_courses: 1 },
    courses: [externalCourse(term, code)],
  })
  return {
    version: SCHEDULE_DATA_VERSION,
    enrollments: [
      {
        courseId: `ACCT${code}`,
        course,
        selectedSections: course.terms[0].sections,
        color: 'bg-blue-500',
        isVisible: true,
      },
    ],
  }
}

type Audit = {
  writes: { key: string; value: string | null }[]
  failRead: boolean
  failWrite: boolean
}
declare global {
  interface Window {
    scheduleAudit: Audit
  }
}

async function prepare(
  page: Page,
  entries: Record<string, string>,
  options: { failRead?: boolean; catalog?: CatalogFixtures; renderFailure?: boolean } = {}
) {
  const { failRead = false, catalog = {}, renderFailure = false } = options
  await mockCatalog(page, catalog)
  await page.addInitScript(
    ({ entries, faultKey, failRead, renderFailure }) => {
      if (renderFailure) {
        window.String = new Proxy(String, {
          apply(target, receiver, args) {
            if (args[0] === 99.5) throw new Error('Injected schedule rendering failure')
            return Reflect.apply(target, receiver, args)
          },
        })
      }
      // Seed once. Reload must restore what the app really saved, not reseed a lost cart.
      if (!sessionStorage.getItem('schedule-safety-seeded')) {
        for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value)
        sessionStorage.setItem('schedule-safety-seeded', '1')
      }
      const audit = (window.scheduleAudit = { writes: [], failRead, failWrite: false } as Audit)
      const get = Storage.prototype.getItem
      const set = Storage.prototype.setItem
      const remove = Storage.prototype.removeItem
      Storage.prototype.getItem = function (key) {
        if (key === faultKey && audit.failRead)
          throw new DOMException('Test read denied', 'SecurityError')
        return get.call(this, key)
      }
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('schedule_')) {
          audit.writes.push({ key, value })
          if (audit.failWrite) throw new DOMException('Test quota exceeded', 'QuotaExceededError')
        }
        return set.call(this, key, value)
      }
      Storage.prototype.removeItem = function (key) {
        if (key.startsWith('schedule_')) audit.writes.push({ key, value: null })
        return remove.call(this, key)
      }
    },
    { entries, faultKey: key(first), failRead, renderFailure }
  )
  await page.goto('/')
  if (renderFailure) return
  if (Object.keys(catalog).length === 0) await expectEmptyCatalogLoaded(page)
  else
    await expect(
      page
        .locator('[data-course-search]')
        .getByText('Saved course 1111', { exact: true })
        .filter({ visible: true })
    ).toBeVisible()
}
const cart = (page: Page) => page.locator('[data-shopping-cart]')
const notice = (page: Page) => page.locator('[data-schedule-storage-notice]')
const raw = (page: Page, term: string) =>
  page.evaluate((key) => localStorage.getItem(key), key(term))

async function downloadText(page: Page, label: string) {
  const downloading = page.waitForEvent('download')
  await notice(page).getByRole('button', { name: label, exact: true }).click()
  const download = await downloading
  return readFile((await download.path())!, 'utf8')
}

for (const destination of [second, '2025-26 Term 1']) {
  test(`loading and switching to ${destination} never writes an unrelated or empty snapshot`, async ({
    page,
  }) => {
    const one = JSON.stringify(schedule(first))
    const two = JSON.stringify(schedule(destination, '2222'))
    await prepare(page, { [key(first)]: one, [key(destination)]: two })
    await expect(cart(page).getByText('Saved course 1111', { exact: true })).toBeVisible()
    await selectTerm(page, destination)
    await expect(cart(page).getByText('Saved course 2222', { exact: true })).toBeVisible()
    await selectTerm(page, first)
    await expect(cart(page).getByText('Saved course 1111', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => window.scheduleAudit.writes)).toEqual([])
    expect(await raw(page, first)).toBe(one)
    expect(await raw(page, destination)).toBe(two)
  })
}

test('an empty outgoing cart cannot delete a populated destination', async ({ page }) => {
  const two = JSON.stringify(schedule(second, '2222'))
  await prepare(page, { [key(second)]: two })
  await selectTerm(page, second)
  await expect(cart(page).getByText('Saved course 2222', { exact: true })).toBeVisible()
  await selectTerm(page, first)
  await expect(cart(page).getByText('No courses enrolled', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.scheduleAudit.writes)).toEqual([])
  expect(await raw(page, second)).toBe(two)
})

for (const [name, original] of [
  ['malformed JSON', '{"unfinished":'],
  ['an empty stored string', ''],
  ['a newer format', JSON.stringify({ ...schedule(first), version: SCHEDULE_DATA_VERSION + 1 })],
  [
    'a malformed enrollment among valid choices',
    JSON.stringify({
      version: 3,
      enrollments: [...schedule(first).enrollments, { courseId: 'broken' }],
    }),
  ],
] as const) {
  test(`preserves and exports ${name}`, async ({ page }) => {
    await prepare(page, { [key(first)]: original })
    await expect(notice(page)).toContainText('Your saved data has been kept unchanged')
    expect(await raw(page, first)).toBe(original)
    expect(await page.evaluate(() => window.scheduleAudit.writes)).toEqual([])
    expect(await downloadText(page, 'Download original data')).toBe(original)
    await expect(cart(page).getByText('No courses enrolled', { exact: true })).toHaveCount(0)
    await selectTerm(page, second)
    await selectTerm(page, first)
    expect(await raw(page, first)).toBe(original)
    expect(await page.evaluate(() => window.scheduleAudit.writes)).toEqual([])
  })
}

test('a failed read grants no write authority and offers no invented original export', async ({
  page,
}) => {
  const original = JSON.stringify(schedule(first))
  await prepare(page, { [key(first)]: original }, { failRead: true })
  await expect(notice(page)).toContainText('Saved schedule unavailable')
  await expect(notice(page).getByRole('button', { name: 'Download original data' })).toHaveCount(0)
  expect(await page.evaluate(() => window.scheduleAudit.writes)).toEqual([])
  await page.evaluate(() => {
    window.scheduleAudit.failRead = false
  })
  expect(await raw(page, first)).toBe(original)
})

test('failed-save edits survive term navigation, export, retry, and reload without reseeding', async ({
  page,
}) => {
  const original = JSON.stringify(schedule(first))
  await prepare(page, { [key(first)]: original })
  await expect(cart(page).getByText('Saved course 1111', { exact: true })).toBeVisible()
  await page.evaluate(() => {
    window.scheduleAudit.failWrite = true
  })
  await cart(page).getByTitle('Hide course', { exact: true }).click()
  await expect(notice(page)).toContainText('have not been saved')
  expect(await raw(page, first)).toBe(original)
  await selectTerm(page, second)
  await expect(notice(page)).toContainText(first)
  await selectTerm(page, first)
  await expect(cart(page).getByTitle('Show course', { exact: true })).toBeVisible()
  const pending = JSON.parse(await downloadText(page, 'Download changes'))
  expect(pending.enrollments[0].isVisible).toBe(false)
  await page.evaluate(() => {
    window.scheduleAudit.failWrite = false
  })
  await notice(page).getByRole('button', { name: 'Try saving again', exact: true }).click()
  await expect(notice(page)).toHaveCount(0)
  expect(JSON.parse((await raw(page, first))!).enrollments[0].isVisible).toBe(false)
  await page.reload()
  await expectEmptyCatalogLoaded(page)
  await expect(cart(page).getByTitle('Show course', { exact: true })).toBeVisible()
})

test('a cart produced by Add survives reload and intentional clearing without reseeding', async ({
  page,
}) => {
  await prepare(page, {}, { catalog: { [first.split(' ')[0] + '/ACCT']: [externalCourse(first)] } })
  await page
    .locator('[data-course-search]')
    .getByText('Saved course 1111', { exact: true })
    .filter({ visible: true })
    .click()
  await page
    .locator('[data-course-search]')
    .getByText('A-LEC (1001)', { exact: true })
    .filter({ visible: true })
    .click()
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).first().click()
  await expect(cart(page).getByText('Saved course 1111', { exact: true })).toBeVisible()
  await expect
    .poll(async () => JSON.parse((await raw(page, first)) ?? 'null')?.enrollments?.[0]?.courseId)
    .toBe('ACCT1111')
  await page.reload()
  await expect(cart(page).getByText('Saved course 1111', { exact: true })).toBeVisible()
  await cart(page).getByTitle('Remove course', { exact: true }).click()
  await expect
    .poll(async () => JSON.parse((await raw(page, first)) ?? 'null')?.enrollments)
    .toEqual([])
  await page.reload()
  await expect(cart(page).getByText('No courses enrolled', { exact: true })).toBeVisible()
})

test('blocked data disables cart actions and both export layouts while browsing remains usable', async ({
  page,
}) => {
  const original = JSON.stringify({ ...schedule(first), version: SCHEDULE_DATA_VERSION + 1 })
  await prepare(
    page,
    { [key(first)]: original },
    { catalog: { [first.split(' ')[0] + '/ACCT']: [externalCourse(first)] } }
  )
  await expect(notice(page)).toBeVisible()
  await page
    .locator('[data-course-search]')
    .getByText('Saved course 1111', { exact: true })
    .filter({ visible: true })
    .click()
  await page
    .locator('[data-course-search]')
    .getByText('A-LEC (1001)', { exact: true })
    .filter({ visible: true })
    .click()
  const adds = page.getByRole('button', { name: 'Add to Cart', exact: true })
  await expect(adds.first()).toBeVisible()
  for (const button of await adds.all()) await expect(button).toBeDisabled()
  const screenshots = page.getByTitle('Download schedule as image', { exact: true })
  await expect(screenshots).toHaveCount(2)
  for (const button of await screenshots.all()) await expect(button).toBeDisabled()
  const exports = page.getByTitle(
    'Export the term schedule as .ics file, which can be imported into Google Calendar, Outlook, etc.',
    { exact: true }
  )
  await expect(exports).toHaveCount(2)
  for (const button of await exports.all()) await expect(button).toBeDisabled()
  await page.getByRole('button', { name: 'No time conflicts', exact: true }).click()
  await expect(
    page.getByText('Load your schedule to check time conflicts.', { exact: true })
  ).toBeVisible()
  await page.getByRole('button', { name: 'No time conflicts', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Add to Cart', exact: true }).first()).toBeVisible()
  expect(await raw(page, first)).toBe(original)
  expect(await page.evaluate(() => window.scheduleAudit.writes)).toEqual([])
})

test('a rendering failure after restore cannot delete or rewrite saved choices', async ({
  page,
}) => {
  const saved = schedule(first)
  saved.enrollments[0].course.credits = { min: 99.5, max: 99.5 }
  const original = JSON.stringify(saved)
  await prepare(page, { [key(first)]: original }, { renderFailure: true })
  await expect(
    page.getByRole('heading', { name: 'The planner ran into a problem', exact: true })
  ).toBeVisible()
  expect(await raw(page, first)).toBe(original)
  expect(await page.evaluate(() => window.scheduleAudit.writes)).toEqual([])
})

test('a failed pending-data export keeps the edited schedule usable', async ({ page }) => {
  const original = JSON.stringify(schedule(first))
  await prepare(page, { [key(first)]: original })
  await expect(cart(page).getByTitle('Hide course', { exact: true })).toBeVisible()
  await page.evaluate(() => {
    JSON.stringify = new Proxy(JSON.stringify, {
      apply(target, receiver, args) {
        const value = args[0]
        if (value && typeof value === 'object' && Array.isArray(value.enrollments))
          throw new Error('Injected serialization failure')
        return Reflect.apply(target, receiver, args)
      },
    })
  })
  await cart(page).getByTitle('Hide course', { exact: true }).click()
  await expect(notice(page)).toContainText('have not been saved')
  await notice(page).getByRole('button', { name: 'Download changes', exact: true }).click()
  await expect(notice(page)).toContainText('The download failed')
  await expect(cart(page).getByTitle('Show course', { exact: true })).toBeVisible()
  await selectTerm(page, second)
  await expect(notice(page)).not.toContainText('The download failed')
  await selectTerm(page, first)
  await expect(notice(page)).not.toContainText('The download failed')
  await expect(cart(page).getByTitle('Show course', { exact: true })).toBeVisible()
  expect(await raw(page, first)).toBe(original)
})
