import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openPlannerAtTerm, selectTerm } from './helpers/planner'

// Restoring a cart must never delete one or write it under another term's key: a render
// crash in between would make either permanent (#173).

const TERM_ONE = '2026-27 Term 1'
const TERM_TWO = '2026-27 Term 2'

function schedule(courseCode: string) {
  return {
    version: 3,
    enrollments: [
      {
        courseId: `ACCT${courseCode}`,
        course: { subject: 'ACCT', courseCode, title: `Fixture ${courseCode}`, terms: [] },
        selectedSections: [],
        color: 'bg-teal-700',
        isVisible: true,
        isInvalid: false,
      },
    ],
  }
}

type StorageOp = { op: 'set' | 'remove'; key: string; courseIds?: string[] }

// Seeds storage once, then logs every schedule write the app makes.
async function seedAndRecord(page: Page, seeded: Record<string, string>) {
  await page.addInitScript((seeded) => {
    if (!sessionStorage.getItem('seeded')) {
      for (const [key, value] of Object.entries(seeded)) localStorage.setItem(key, value)
      sessionStorage.setItem('seeded', '1')
    }
    const ops: StorageOp[] = []
    ;(window as unknown as { scheduleOps: StorageOp[] }).scheduleOps = ops
    const { setItem, removeItem } = Storage.prototype
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('schedule_')) {
        const ids = JSON.parse(value).enrollments.map((e: { courseId: string }) => e.courseId)
        ops.push({ op: 'set', key, courseIds: ids })
      }
      return setItem.call(this, key, value)
    }
    Storage.prototype.removeItem = function (key) {
      if (key.startsWith('schedule_')) ops.push({ op: 'remove', key })
      return removeItem.call(this, key)
    }
  }, seeded)
}

const recordedOps = (page: Page) =>
  page.evaluate(() => (window as unknown as { scheduleOps: StorageOp[] }).scheduleOps)

// Every recorded op saves a term's own cart: no deletes, and no key outside `ownCourses`.
async function expectOnlyOwnSaves(page: Page, ownCourses: Record<string, string[]>) {
  for (const op of await recordedOps(page)) {
    expect(Object.keys(ownCourses), `${op.op} ${op.key}`).toContain(op.key)
    expect(op.op, `${op.op} ${op.key}`).toBe('set')
    expect(op.courseIds, op.key).toEqual(ownCourses[op.key])
  }
}

test('restoring and switching terms never deletes or cross-writes a cart', async ({ page }) => {
  await seedAndRecord(page, {
    [`schedule_${TERM_ONE}`]: JSON.stringify(schedule('1111')),
    [`schedule_${TERM_TWO}`]: JSON.stringify(schedule('2222')),
  })
  await openPlannerAtTerm(page, { term: TERM_ONE })
  await expect(page.getByText('Fixture 1111')).toBeVisible()
  await selectTerm(page, TERM_TWO)
  await expect(page.getByText('Fixture 2222')).toBeVisible()
  await selectTerm(page, TERM_ONE)
  await expect(page.getByText('Fixture 1111')).toBeVisible()

  await expectOnlyOwnSaves(page, {
    [`schedule_${TERM_ONE}`]: ['ACCT1111'],
    [`schedule_${TERM_TWO}`]: ['ACCT2222'],
  })
})

test('leaves a cart this build cannot read untouched', async ({ page }) => {
  const unreadable = JSON.stringify({ version: 99, drafts: [] })
  await seedAndRecord(page, {
    [`schedule_${TERM_ONE}`]: JSON.stringify(schedule('1111')),
    [`schedule_${TERM_TWO}`]: unreadable,
  })
  await openPlannerAtTerm(page, { term: TERM_ONE })
  await expect(page.getByText('Fixture 1111')).toBeVisible()
  await selectTerm(page, TERM_TWO)
  await selectTerm(page, TERM_ONE)
  await expect(page.getByText('Fixture 1111')).toBeVisible()

  await expectOnlyOwnSaves(page, { [`schedule_${TERM_ONE}`]: ['ACCT1111'] })
  expect(await page.evaluate((k) => localStorage.getItem(k), `schedule_${TERM_TWO}`)).toBe(
    unreadable
  )
})
