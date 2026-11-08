import type { Page } from '@playwright/test'
import { readStoredEnrollments } from '../../src/lib/storedSchedule'

export async function readScheduleRecord(page: Page, term: string) {
  return page.evaluate(async (term) => {
    const name = 'another-cuhk-course-planner'
    if (!(await indexedDB.databases()).some((database) => database.name === name)) return
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const request = db.transaction('schedules').objectStore('schedules').get(term)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    } finally {
      db.close()
    }
  }, term)
}

export async function readSavedEnrollments(page: Page, term: string) {
  const record = await readScheduleRecord(page, term)
  if (!record || typeof record !== 'object' || !('schedule' in record)) return null
  const result = readStoredEnrollments(record.schedule)
  return result.status === 'ready' ? result.enrollments : null
}
