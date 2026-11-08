import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { transformExternalCourseData } from '../src/lib/validation'
import { DEFAULT_CURRENT_TERM as term } from '../src/lib/constants'
import { mockCatalog, expectEmptyCatalogLoaded } from './helpers/catalog'
import { readScheduleRecords, readSavedEnrollments } from './helpers/schedule'
import { selectTerm } from './helpers/planner'

const key = `schedule_${term}`
const course = transformExternalCourseData({
  metadata: { subject: 'ACCT', total_courses: 1 },
  courses: [
    { subject: 'ACCT', course_code: '1111', title: 'Transaction fixture', credits: '3', terms: [] },
  ],
}).courses[0]
const original = JSON.stringify({
  version: 3,
  enrollments: [
    { courseId: 'ACCT1111', course, selectedSections: [], color: 'bg-blue-500', isVisible: true },
  ],
})
const cart = (page: Page) => page.locator('[data-shopping-cart]')
const notice = (page: Page) => page.locator('[data-schedule-storage-notice]')

async function open(page: Page) {
  await mockCatalog(page)
  await page.goto('/')
  await expectEmptyCatalogLoaded(page)
  await expect(cart(page).getByText('Transaction fixture', { exact: true })).toBeVisible()
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(
    ({ key, original }) => {
      if (!sessionStorage.getItem('transactions-seeded')) {
        if (localStorage.getItem(key) === null) localStorage.setItem(key, original)
        sessionStorage.setItem('transactions-seeded', '1')
      }
    },
    { key, original }
  )
})

test('adopts a verified copy and exact import receipt without rewriting legacy storage', async ({
  page,
}) => {
  await open(page)
  await expect
    .poll(() => readSavedEnrollments(page, term))
    .toMatchObject([{ courseId: 'ACCT1111', isVisible: true }])
  expect(await readScheduleRecords(page, term)).toMatchObject({
    receipt: { recordFormat: 1, term, originalLegacyRaw: original },
  })
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(original)
  await expect(
    page.getByRole('button', { name: /Download (saved-data backup|recovery data)/ })
  ).toHaveCount(0)
})

test('adopts and saves when randomUUID is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined })
  })
  await open(page)
  await cart(page).getByTitle('Hide course', { exact: true }).click()
  await expect.poll(() => readSavedEnrollments(page, term)).toMatchObject([{ isVisible: false }])
})

test('reading a schedule keeps the cart frame without claiming an empty cart', async ({ page }) => {
  await page.addInitScript((term) => {
    const gate = { hold: true, waiting: false }
    window.scheduleLoadGate = gate
    const get = IDBObjectStore.prototype.get
    let held = false
    IDBObjectStore.prototype.get = function (...args) {
      const request = Reflect.apply(get, this, args) as IDBRequest
      if (this.name === 'schedules' && !held) {
        held = true
        request.addEventListener('success', () => {
          const keepAlive = () => {
            if (!gate.hold) return
            gate.waiting = true
            get.call(this, term).addEventListener('success', keepAlive)
          }
          keepAlive()
        })
      }
      return request
    }
  }, term)
  await mockCatalog(page)
  await page.goto('/')
  let loadingFrame
  try {
    await expect.poll(() => page.evaluate(() => window.scheduleLoadGate.waiting)).toBe(true)
    await expect(cart(page).getByText('Shopping Cart', { exact: true })).toBeVisible()
    await expect(cart(page)).toHaveAttribute('aria-busy', 'true')
    await expect(cart(page).getByRole('status')).toContainText('Loading your schedule')
    await expect(cart(page).getByText('0 courses', { exact: true })).toHaveCount(0)
    await expect(cart(page).getByText('No courses enrolled', { exact: true })).toHaveCount(0)
    loadingFrame = await cart(page).boundingBox()
  } finally {
    await page.evaluate(() => {
      window.scheduleLoadGate.hold = false
    })
  }
  await expect(cart(page).getByText('Transaction fixture', { exact: true })).toBeVisible()
  await expect(cart(page)).toHaveAttribute('aria-busy', 'false')
  const loadedFrame = await cart(page).boundingBox()
  expect(loadingFrame).not.toBeNull()
  expect(loadedFrame).toMatchObject({ width: loadingFrame!.width, height: loadingFrame!.height })
})

test('an old writer cannot change adopted data by replacing or deleting its legacy key', async ({
  page,
}) => {
  await open(page)
  await cart(page).getByTitle('Hide course', { exact: true }).click()
  await expect.poll(() => readSavedEnrollments(page, term)).toMatchObject([{ isVisible: false }])
  await page.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify({ version: 3, enrollments: [] }))
    localStorage.removeItem(key)
  }, key)
  await page.reload()
  await expect(cart(page).getByTitle('Show course', { exact: true })).toBeVisible()
  expect(await readSavedEnrollments(page, term)).toMatchObject([{ isVisible: false }])
})

test('a stale tab preserves its edits instead of replacing another committed revision', async ({
  page,
  context,
}) => {
  await open(page)
  const other = await context.newPage()
  await open(other)
  await cart(page).getByTitle('Hide course', { exact: true }).click()
  await expect.poll(() => readSavedEnrollments(page, term)).toMatchObject([{ isVisible: false }])
  const before = await readScheduleRecords(page, term)
  await cart(other).getByTitle('Remove course', { exact: true }).click()
  await expect(notice(other)).toContainText('changed in another tab')
  await expect(cart(other).getByText('No courses enrolled', { exact: true })).toBeVisible()
  expect(await readScheduleRecords(page, term)).toEqual(before)
})

test('a request success followed by transaction abort is never reported as saved', async ({
  page,
}) => {
  await open(page)
  await expect.poll(() => readSavedEnrollments(page, term)).not.toBeNull()
  const before = await readScheduleRecords(page, term)
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      const request = Reflect.apply(put, this, args) as IDBRequest
      if (this.name === 'schedules')
        request.addEventListener('success', () => this.transaction.abort())
      return request
    }
  })
  await cart(page).getByTitle('Hide course', { exact: true }).click()
  await expect(notice(page)).toContainText('have not been saved')
  await expect(cart(page).getByTitle('Show course', { exact: true })).toBeVisible()
  expect(await readScheduleRecords(page, term)).toEqual(before)
})

async function changeCanonical(page: Page, change: 'newer_payload' | 'newer_record' | 'remove') {
  await page.evaluate(
    async ({ term, change }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('cuhk-course-planner')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      try {
        const tx = db.transaction('schedules', 'readwrite')
        const done = new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve()
          tx.onabort = () => reject(tx.error)
        })
        const store = tx.objectStore('schedules')
        const record = await new Promise<unknown>((resolve, reject) => {
          const request = store.get(term)
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        if (
          !record ||
          typeof record !== 'object' ||
          !('currentRaw' in record) ||
          typeof record.currentRaw !== 'string'
        )
          throw Error('Missing fixture record')
        if (change === 'remove') store.delete(term)
        else if (change === 'newer_record') store.put({ ...record, recordFormat: 2 }, term)
        else {
          const payload: unknown = JSON.parse(record.currentRaw)
          if (!payload || typeof payload !== 'object') throw Error('Invalid fixture payload')
          store.put({ ...record, currentRaw: JSON.stringify({ ...payload, version: 4 }) }, term)
        }
        await done
      } finally {
        db.close()
      }
    },
    { term, change }
  )
}

test('a failed replacement load keeps the confirmed local edits available', async ({
  page,
  context,
}) => {
  await open(page)
  const other = await context.newPage()
  await open(other)
  await cart(page).getByTitle('Hide course', { exact: true }).click()
  await expect.poll(() => readSavedEnrollments(page, term)).toMatchObject([{ isVisible: false }])
  await cart(other).getByTitle('Remove course', { exact: true }).click()
  await expect(notice(other)).toContainText('changed in another tab')
  await changeCanonical(page, 'newer_payload')
  const before = await readScheduleRecords(page, term)
  other.once('dialog', (dialog) => dialog.accept())
  await notice(other)
    .getByRole('button', { name: 'Discard edits and load saved version', exact: true })
    .click()
  await expect(
    notice(other).getByRole('button', { name: 'Download changes', exact: true })
  ).toBeVisible()
  await expect(cart(other).getByText('No courses enrolled', { exact: true })).toBeVisible()
  await expect(
    notice(other).getByRole('button', { name: 'Discard edits and load saved version', exact: true })
  ).toHaveCount(0)
  expect(await readScheduleRecords(page, term)).toEqual(before)
})

test('a transient replacement read failure remains recoverable without discarding local edits', async ({
  page,
  context,
}) => {
  await open(page)
  const other = await context.newPage()
  await open(other)
  await cart(page).getByTitle('Hide course', { exact: true }).click()
  await expect.poll(() => readSavedEnrollments(page, term)).toMatchObject([{ isVisible: false }])
  await cart(other).getByTitle('Remove course', { exact: true }).click()
  await expect(notice(other)).toContainText('changed in another tab')
  const before = await readScheduleRecords(page, term)
  await other.evaluate(() => {
    const get = IDBObjectStore.prototype.get
    window.restoreScheduleReads = () => {
      IDBObjectStore.prototype.get = get
    }
    IDBObjectStore.prototype.get = function (...args) {
      if (this.name === 'schedules')
        throw new DOMException('Test temporary read failure', 'UnknownError')
      return Reflect.apply(get, this, args)
    }
  })
  const replace = notice(other).getByRole('button', {
    name: 'Discard edits and load saved version',
    exact: true,
  })
  other.once('dialog', (dialog) => dialog.accept())
  await replace.click()
  await expect(notice(other)).not.toContainText('changed in another tab')
  await expect(replace).toBeVisible()
  await expect(cart(other).getByText('No courses enrolled', { exact: true })).toBeVisible()
  await expect(
    notice(other).getByRole('button', { name: 'Try saving again', exact: true })
  ).toHaveCount(0)
  expect((await downloadJson(other, 'Download changes')).enrollments).toEqual([])
  expect(await readScheduleRecords(page, term)).toEqual(before)

  await other.evaluate(() => window.restoreScheduleReads())
  other.once('dialog', (dialog) => dialog.accept())
  await replace.click()
  await expect(cart(other).getByTitle('Show course', { exact: true })).toBeVisible()
  await expect(notice(other)).toHaveCount(0)
  expect(await readScheduleRecords(page, term)).toEqual(before)
})

async function downloadJson(page: Page, label: string) {
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: label, exact: true }).click()
  const file = await downloading
  return JSON.parse(await readFile((await file.path())!, 'utf8')) as Record<string, unknown>
}

test('a storage problem offers recovery data with the original and one previous payload', async ({
  page,
}) => {
  await open(page)
  await cart(page).getByTitle('Hide course', { exact: true }).click()
  await expect.poll(() => readSavedEnrollments(page, term)).toMatchObject([{ isVisible: false }])
  await cart(page).getByTitle('Show course', { exact: true }).click()
  await expect.poll(() => readSavedEnrollments(page, term)).toMatchObject([{ isVisible: true }])
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'schedules')
        throw new DOMException('Test quota exhausted', 'QuotaExceededError')
      return Reflect.apply(put, this, args)
    }
  })
  await cart(page).getByTitle('Hide course', { exact: true }).click()
  await expect(notice(page)).toContainText('have not been saved')
  const backup = await downloadJson(page, 'Download recovery data')
  expect(backup.original).toMatchObject({ originalLegacyRaw: original })
  const current = backup.current as { currentRaw: string; previousRaw: string }
  expect(JSON.parse(current.currentRaw).enrollments[0].isVisible).toBe(true)
  const previous = JSON.parse(current.previousRaw)
  expect(previous.enrollments[0].isVisible).toBe(false)
  expect(previous).not.toHaveProperty('previousRaw')
})

test('an empty save stays empty and a receipt prevents silent reimport of a missing record', async ({
  page,
}) => {
  await open(page)
  await cart(page).getByTitle('Remove course', { exact: true }).click()
  await expect.poll(() => readSavedEnrollments(page, term)).toEqual([])
  await page.reload()
  await expect(cart(page).getByText('No courses enrolled', { exact: true })).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(original)
  await changeCanonical(page, 'remove')
  await page.reload()
  await expect(notice(page)).toContainText('Saved schedule unavailable')
  expect((await readScheduleRecords(page, term))?.current).toBeUndefined()
  const backup = await downloadJson(page, 'Download recovery data')
  expect(backup.original).toMatchObject({ originalLegacyRaw: original })
})

for (const change of ['newer_record', 'newer_payload'] as const) {
  test(`a ${change} refuses an old writer without hiding its pending edits`, async ({ page }) => {
    await open(page)
    await changeCanonical(page, change)
    const before = await readScheduleRecords(page, term)
    await cart(page).getByTitle('Hide course', { exact: true }).click()
    await expect(notice(page)).toContainText('not being saved')
    await expect(cart(page).getByTitle('Show course', { exact: true })).toBeVisible()
    await expect(
      notice(page).getByRole('button', {
        name: 'Discard edits and load saved version',
        exact: true,
      })
    ).toHaveCount(0)
    expect(await readScheduleRecords(page, term)).toEqual(before)
    const edits = await downloadJson(page, 'Download changes')
    expect(edits.enrollments).toMatchObject([{ isVisible: false }])
    await page.reload()
    await expect(notice(page)).toContainText('Saved schedule unavailable')
    expect(await readScheduleRecords(page, term)).toEqual(before)
  })
}

test('interrupted adoption rolls back the cart and receipt and keeps the legacy original exportable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const add = IDBObjectStore.prototype.add
    IDBObjectStore.prototype.add = function (...args) {
      const request = Reflect.apply(add, this, args) as IDBRequest
      if (this.name === 'imports')
        request.addEventListener('success', () => this.transaction.abort())
      return request
    }
  })
  await mockCatalog(page)
  await page.goto('/')
  await expect(notice(page)).toContainText('Saved schedule unavailable')
  const records = await readScheduleRecords(page, term)
  expect(records?.current).toBeUndefined()
  expect(records?.receipt).toBeUndefined()
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(original)
  const downloading = page.waitForEvent('download')
  await notice(page).getByRole('button', { name: 'Download original data', exact: true }).click()
  const file = await downloading
  expect(await readFile((await file.path())!, 'utf8')).toBe(original)
})

test('a denied database never falls back to writing legacy storage', async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => {
      throw new DOMException('Test database denied', 'SecurityError')
    }
  })
  await mockCatalog(page)
  await page.goto('/')
  await expect(notice(page)).toContainText('Saved schedule unavailable')
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(original)
  await expect(cart(page).getByText('No courses enrolled', { exact: true })).toHaveCount(0)
})

test('an upgrade closes this connection and refuses further old-version writes', async ({
  page,
}) => {
  await open(page)
  const before = await readScheduleRecords(page, term)
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('cuhk-course-planner', 2)
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
  })
  await cart(page).getByTitle('Hide course', { exact: true }).click()
  await expect(notice(page)).toContainText('not being saved')
  expect(await readScheduleRecords(page, term)).toEqual(before)
  await expect(cart(page).getByTitle('Show course', { exact: true })).toBeVisible()
  await page.reload()
  await expect(notice(page)).toContainText('Saved schedule unavailable')
})

test('continued conflict edits stay local and replacement requires an explicit discard confirmation', async ({
  page,
  context,
}) => {
  await open(page)
  const other = await context.newPage()
  await open(other)
  await cart(page).getByTitle('Hide course', { exact: true }).click()
  await expect.poll(() => readSavedEnrollments(page, term)).toMatchObject([{ isVisible: false }])
  await cart(other).getByTitle('Hide course', { exact: true }).click()
  await expect(notice(other)).toContainText('not being saved')
  await cart(other).getByTitle('Show course', { exact: true }).click()
  const pending = await downloadJson(other, 'Download changes')
  expect(pending.enrollments).toMatchObject([{ isVisible: true }])
  expect(await readSavedEnrollments(page, term)).toMatchObject([{ isVisible: false }])
  other.once('dialog', (dialog) => dialog.dismiss())
  await notice(other)
    .getByRole('button', { name: 'Discard edits and load saved version', exact: true })
    .click()
  await expect(cart(other).getByTitle('Hide course', { exact: true })).toBeVisible()
  other.once('dialog', (dialog) => dialog.accept())
  await notice(other)
    .getByRole('button', { name: 'Discard edits and load saved version', exact: true })
    .click()
  await expect(cart(other).getByTitle('Show course', { exact: true })).toBeVisible()
  await expect(notice(other)).toHaveCount(0)
})

declare global {
  interface Window {
    restoreScheduleReads: () => void
    scheduleLoadGate: { hold: boolean; waiting: boolean }
    scheduleCommitGate: { hold: boolean; waiting: boolean }
    terminateScheduleDatabase: () => void
  }
}

async function holdCommit(page: Page) {
  await page.evaluate((term) => {
    const gate: Window['scheduleCommitGate'] = { hold: true, waiting: false }
    window.scheduleCommitGate = gate
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      const request = Reflect.apply(put, this, args) as IDBRequest
      if (this.name === 'schedules')
        request.addEventListener('success', () => {
          const keepAlive = () => {
            if (!gate.hold) return
            gate.waiting = true
            this.get(term).addEventListener('success', keepAlive)
          }
          keepAlive()
        })
      return request
    }
  }, term)
}

async function releaseCommit(page: Page) {
  await page.evaluate(() => {
    window.scheduleCommitGate.hold = false
  })
}

test('edits made during a commit use its new revision without conflicting with this tab', async ({
  page,
}) => {
  await open(page)
  await holdCommit(page)
  try {
    await cart(page).getByTitle('Hide course', { exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.scheduleCommitGate.waiting)).toBe(true)
    await cart(page).getByTitle('Show course', { exact: true }).click()
  } finally {
    await releaseCommit(page)
  }
  await expect.poll(() => readSavedEnrollments(page, term)).toMatchObject([{ isVisible: true }])
  await expect(notice(page)).toHaveCount(0)
  const record = (await readScheduleRecords(page, term))?.current as { previousRaw: string }
  expect(JSON.parse(record.previousRaw).enrollments[0].isVisible).toBe(false)
})

test('an outgoing in-flight commit cannot acquire the destination term or lose its edits', async ({
  page,
}) => {
  await open(page)
  await holdCommit(page)
  const destination = `${term.split(' ')[0]} ${term.endsWith('Term 1') ? 'Term 2' : 'Term 1'}`
  try {
    await cart(page).getByTitle('Hide course', { exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.scheduleCommitGate.waiting)).toBe(true)
    await selectTerm(page, destination)
  } finally {
    await releaseCommit(page)
  }
  await expect(cart(page).getByText('No courses enrolled', { exact: true })).toBeVisible()
  await expect.poll(() => readSavedEnrollments(page, term)).toMatchObject([{ isVisible: false }])
  expect(await readSavedEnrollments(page, destination)).toEqual([])
  await selectTerm(page, term)
  await expect(cart(page).getByTitle('Show course', { exact: true })).toBeVisible()
  await expect(notice(page)).toHaveCount(0)
})

test('adoption rechecks a winner committed after its initial canonical read', async ({ page }) => {
  await page.addInitScript(
    ({ term, key, original }) => {
      let db: IDBDatabase | undefined
      const open = IDBFactory.prototype.open
      IDBFactory.prototype.open = function (...args) {
        const request = Reflect.apply(open, this, args) as IDBOpenDBRequest
        if (args[0] === 'cuhk-course-planner')
          request.addEventListener('success', () => {
            db ??= request.result
          })
        return request
      }
      const get = Storage.prototype.getItem
      let won = false
      Storage.prototype.getItem = function (name) {
        const value = get.call(this, name)
        if (name === key && db && !won) {
          won = true
          const tx = db.transaction(['schedules', 'imports'], 'readwrite')
          const payload = JSON.parse(original)
          payload.enrollments[0].isVisible = false
          tx.objectStore('schedules').add(
            {
              recordFormat: 1,
              term,
              revision: 'other-adopter',
              currentRaw: JSON.stringify(payload),
              previousRaw: null,
            },
            term
          )
          tx.objectStore('imports').add(
            { recordFormat: 1, term, originalLegacyRaw: original },
            term
          )
        }
        return value
      }
    },
    { term, key, original }
  )
  await open(page)
  await expect(cart(page).getByTitle('Show course', { exact: true })).toBeVisible()
  expect((await readScheduleRecords(page, term))?.current).toMatchObject({
    revision: 'other-adopter',
  })
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(original)
})

test('an unexpectedly closed connection is reopened without discarding edits', async ({ page }) => {
  await page.addInitScript(() => {
    let db: IDBDatabase | undefined
    const open = IDBFactory.prototype.open
    IDBFactory.prototype.open = function (...args) {
      const request = Reflect.apply(open, this, args) as IDBOpenDBRequest
      if (args[0] === 'cuhk-course-planner')
        request.addEventListener('success', () => {
          db ??= request.result
        })
      return request
    }
    window.terminateScheduleDatabase = () => {
      if (!db) throw Error('No fixture connection')
      db.close()
      db.dispatchEvent(new Event('close'))
    }
  })
  await open(page)
  await page.evaluate(() => window.terminateScheduleDatabase())
  await cart(page).getByTitle('Hide course', { exact: true }).click()
  await expect.poll(() => readSavedEnrollments(page, term)).toMatchObject([{ isVisible: false }])
  await expect(notice(page)).toHaveCount(0)
})
