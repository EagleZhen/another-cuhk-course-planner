import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'
import { z } from 'zod'
import type { CourseEnrollment } from './types'
import { readStoredEnrollments, serializeStoredSchedule } from './storedSchedule'

const DATABASE = 'another-cuhk-course-planner'
const recordSchema = z.looseObject({
  recordFormat: z.literal(1),
  term: z.string(),
  revision: z.string().min(1),
  currentRaw: z.string(),
  previousRaw: z.string().nullable(),
  catalogStamp: z.number().int().optional(),
})
const receiptSchema = z.looseObject({
  recordFormat: z.literal(1),
  term: z.string(),
  originalLegacyRaw: z.string().nullable(),
})
type ScheduleRecord = z.infer<typeof recordSchema>
interface ScheduleDatabase extends DBSchema {
  schedules: { key: string; value: unknown }
  imports: { key: string; value: unknown }
}
export type StorageProblem = {
  reason:
    | 'read_failed'
    | 'write_failed'
    | 'invalid_data'
    | 'unsupported_version'
    | 'revision_conflict'
    | 'missing_record'
    | 'database_blocked'
  layer?: 'database' | 'record' | 'payload' | 'legacy'
  version?: number
  error?: unknown
}
export type ScheduleLoad =
  | {
      status: 'ready'
      revision: string
      catalogStamp?: number
      enrollments: CourseEnrollment[]
      envelope: Record<string, unknown>
    }
  | ({ status: 'blocked' } & StorageProblem)
export type ScheduleCommit =
  { status: 'saved'; revision: string } | ({ status: 'refused' | 'failed' } & StorageProblem)

let connection: IDBPDatabase<ScheduleDatabase> | undefined
let opening: Promise<IDBPDatabase<ScheduleDatabase>> | undefined

function newRevision(): string {
  // Unlike randomUUID, getRandomValues also works on the LAN dev server over HTTP.
  return crypto.getRandomValues(new Uint32Array(4)).join('-')
}

function database(): Promise<IDBPDatabase<ScheduleDatabase>> {
  if (connection) return Promise.resolve(connection)
  if (opening) return opening
  opening = new Promise<IDBPDatabase<ScheduleDatabase>>((resolve, reject) => {
    let abandoned = false
    void openDB<ScheduleDatabase>(DATABASE, 1, {
      upgrade(db) {
        db.createObjectStore('schedules')
        db.createObjectStore('imports')
      },
      blocked() {
        abandoned = true
        reject(new DOMException('Another tab is blocking the schedule database', 'DatabaseBlocked'))
      },
      blocking() {
        connection?.close()
        connection = undefined
      },
      terminated() {
        connection = undefined
      },
    }).then((db) => {
      if (abandoned) db.close()
      else {
        connection = db
        resolve(db)
      }
    }, reject)
  }).finally(() => {
    opening = undefined
  })
  return opening
}

function storageFailure(error: unknown, reason: 'read_failed' | 'write_failed'): StorageProblem {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : undefined
  if (name === 'VersionError') return { reason: 'unsupported_version', layer: 'database', error }
  if (name === 'DatabaseBlocked') return { reason: 'database_blocked', layer: 'database', error }
  return { reason, layer: 'database', error }
}

function inspectRecord(
  value: unknown,
  receipt: unknown,
  term: string
):
  | { status: 'ready'; record: ScheduleRecord; decoded: Extract<ScheduleLoad, { status: 'ready' }> }
  | ({ status: 'blocked' } & StorageProblem) {
  if (value === undefined) return { status: 'blocked', reason: 'missing_record', layer: 'record' }
  for (const candidate of [value, receipt]) {
    if (
      candidate &&
      typeof candidate === 'object' &&
      'recordFormat' in candidate &&
      typeof candidate.recordFormat === 'number' &&
      candidate.recordFormat !== 1
    ) {
      return {
        status: 'blocked',
        reason: 'unsupported_version',
        layer: 'record',
        version: candidate.recordFormat,
      }
    }
  }
  const parsed = recordSchema.safeParse(value)
  const imported = receiptSchema.safeParse(receipt)
  if (
    !parsed.success ||
    !imported.success ||
    parsed.data.term !== term ||
    imported.data.term !== term
  ) {
    return { status: 'blocked', reason: 'invalid_data', layer: 'record' }
  }
  try {
    const decoded = readStoredEnrollments(JSON.parse(parsed.data.currentRaw))
    if (decoded.status === 'blocked') return { ...decoded, layer: 'payload' }
    return {
      status: 'ready',
      record: parsed.data,
      decoded: {
        ...decoded,
        revision: parsed.data.revision,
        catalogStamp: parsed.data.catalogStamp,
      },
    }
  } catch {
    return { status: 'blocked', reason: 'invalid_data', layer: 'payload' }
  }
}

// Canonical data always wins. The receipt prevents a missing record from reimporting stale data.
export async function loadSchedule(term: string): Promise<ScheduleLoad> {
  try {
    const db = await database()
    const read = db.transaction(['schedules', 'imports'])
    const [current, receipt] = await Promise.all([
      read.objectStore('schedules').get(term),
      read.objectStore('imports').get(term),
      read.done,
    ])
    if (current !== undefined || receipt !== undefined) {
      const result = inspectRecord(current, receipt, term)
      return result.status === 'ready' ? result.decoded : result
    }

    let raw: string | null
    try {
      raw = localStorage.getItem(`schedule_${term}`)
    } catch (error) {
      return { status: 'blocked', reason: 'read_failed', layer: 'legacy', error }
    }
    let decoded
    try {
      decoded =
        raw === null
          ? { status: 'ready' as const, enrollments: [], envelope: {} }
          : readStoredEnrollments(JSON.parse(raw))
    } catch {
      return { status: 'blocked', reason: 'invalid_data', layer: 'legacy' }
    }
    if (decoded.status === 'blocked') return { ...decoded, layer: 'legacy' }
    const record: ScheduleRecord = {
      recordFormat: 1,
      term,
      revision: newRevision(),
      currentRaw: serializeStoredSchedule(decoded.enrollments, decoded.envelope),
      previousRaw: null,
    }
    const original = { recordFormat: 1, term, originalLegacyRaw: raw }
    const tx = db.transaction(['schedules', 'imports'], 'readwrite')
    try {
      const [winner, imported] = await Promise.all([
        tx.objectStore('schedules').get(term),
        tx.objectStore('imports').get(term),
      ])
      if (winner !== undefined || imported !== undefined) {
        const result = inspectRecord(winner, imported, term)
        await tx.done
        return result.status === 'ready' ? result.decoded : result
      }
      await tx.objectStore('schedules').add(record, term)
      await tx.objectStore('imports').add(original, term)
      await tx.done
      return { ...decoded, revision: record.revision }
    } catch (error) {
      try {
        tx.abort()
      } catch {
        /* The browser may already have aborted it. */
      }
      await tx.done.catch(() => {})
      throw error
    }
  } catch (error) {
    return { status: 'blocked', ...storageFailure(error, 'read_failed') }
  }
}

export async function commitSchedule(
  term: string,
  revision: string,
  enrollments: CourseEnrollment[],
  envelope: Record<string, unknown>,
  catalogStamp?: number
): Promise<ScheduleCommit> {
  try {
    // Prepare before opening the transaction; do not await unrelated work inside it.
    const currentRaw = serializeStoredSchedule(enrollments, envelope)
    const db = await database()
    const tx = db.transaction(['schedules', 'imports'], 'readwrite')
    try {
      const [current, receipt] = await Promise.all([
        tx.objectStore('schedules').get(term),
        tx.objectStore('imports').get(term),
      ])
      const result = inspectRecord(current, receipt, term)
      if (result.status === 'blocked') {
        await tx.done
        return { ...result, status: 'refused' }
      }
      if (result.record.revision !== revision) {
        await tx.done
        return { status: 'refused', reason: 'revision_conflict', layer: 'record' }
      }
      const next = {
        ...result.record,
        revision: newRevision(),
        currentRaw,
        previousRaw: result.record.currentRaw,
        catalogStamp,
      }
      await tx.objectStore('schedules').put(next, term)
      await tx.done
      return { status: 'saved', revision: next.revision }
    } catch (error) {
      try {
        tx.abort()
      } catch {
        /* The browser may already have aborted it. */
      }
      await tx.done.catch(() => {})
      throw error
    }
  } catch (error) {
    const problem = storageFailure(error, 'write_failed')
    return { status: problem.reason === 'write_failed' ? 'failed' : 'refused', ...problem }
  }
}
