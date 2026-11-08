import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'
import { z } from 'zod'
import type { CourseEnrollment } from './types'
import { encodeStoredSchedule, readStoredEnrollments } from './storedSchedule'

const DATABASE = 'another-cuhk-course-planner'
const DATABASE_VERSION = 1
const recordSchema = z.object({
  revision: z.string().min(1),
  schedule: z.unknown(),
  catalogStamp: z.number().int().optional(),
})
type ScheduleRecord = z.infer<typeof recordSchema>
interface ScheduleDatabase extends DBSchema {
  schedules: { key: string; value: unknown }
}
export type StorageProblem = {
  reason:
    | 'read_failed'
    | 'write_failed'
    | 'invalid_data'
    | 'unsupported_version'
    | 'revision_conflict'
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
  // Random revisions keep stale tabs from matching a cart recreated after deletion.
  // Unlike randomUUID, getRandomValues also works on the LAN dev server over HTTP.
  return crypto.getRandomValues(new Uint32Array(4)).join('-')
}

function database(): Promise<IDBPDatabase<ScheduleDatabase>> {
  if (connection) return Promise.resolve(connection)
  if (opening) return opening
  opening = new Promise<IDBPDatabase<ScheduleDatabase>>((resolve, reject) => {
    let abandoned = false
    void openDB<ScheduleDatabase>(DATABASE, DATABASE_VERSION, {
      upgrade(db) {
        db.createObjectStore('schedules')
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

function inspectRecord(value: unknown): ScheduleLoad {
  const parsed = recordSchema.safeParse(value)
  if (!parsed.success) return { status: 'blocked', reason: 'invalid_data', layer: 'record' }
  const { schedule, revision, catalogStamp } = parsed.data
  const decoded = readStoredEnrollments(schedule)
  return decoded.status === 'ready'
    ? { ...decoded, revision, catalogStamp }
    : { ...decoded, layer: 'payload' }
}

export async function loadSchedule(term: string): Promise<ScheduleLoad> {
  try {
    const db = await database()
    const read = db.transaction('schedules')
    const [current] = await Promise.all([read.store.get(term), read.done])
    if (current !== undefined) return inspectRecord(current)

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
      revision: newRevision(),
      schedule: encodeStoredSchedule(decoded.enrollments, decoded.envelope),
    }
    const tx = db.transaction('schedules', 'readwrite')
    try {
      const winner = await tx.store.get(term)
      if (winner !== undefined) {
        await tx.done
        return inspectRecord(winner)
      }
      await tx.store.add(record, term)
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
    const schedule = encodeStoredSchedule(enrollments, envelope)
    const db = await database()
    const tx = db.transaction('schedules', 'readwrite')
    try {
      const current = await tx.store.get(term)
      const result = current === undefined ? undefined : inspectRecord(current)
      if (result?.status === 'blocked') {
        await tx.done
        return { ...result, status: 'refused' }
      }
      if (!result || result.revision !== revision) {
        await tx.done
        return { status: 'refused', reason: 'revision_conflict', layer: 'record' }
      }
      const next: ScheduleRecord = {
        revision: newRevision(),
        schedule,
        catalogStamp,
      }
      await tx.store.put(next, term)
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
