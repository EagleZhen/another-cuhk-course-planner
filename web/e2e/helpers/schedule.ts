import type { Page } from '@playwright/test'
import { readStoredEnrollments } from '../../src/lib/storedSchedule'

export async function readScheduleRecords(page: Page, term: string) {
  return page.evaluate(async (term) => {
    const name = 'another-cuhk-course-planner'
    if (!(await indexedDB.databases()).some((database) => database.name === name)) return null
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const transaction = db.transaction(['schedules', 'imports'])
      const read = (store: string) =>
        new Promise<unknown>((resolve, reject) => {
          const request = transaction.objectStore(store).get(term)
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
      const [current, receipt] = await Promise.all([read('schedules'), read('imports')])
      return { current, receipt }
    } finally {
      db.close()
    }
  }, term)
}

export async function readSavedEnrollments(page: Page, term: string) {
  const record = (await readScheduleRecords(page, term))?.current
  if (
    !record ||
    typeof record !== 'object' ||
    !('currentRaw' in record) ||
    typeof record.currentRaw !== 'string'
  )
    return null
  const result = readStoredEnrollments(JSON.parse(record.currentRaw))
  return result.status === 'ready' ? result.enrollments : null
}
