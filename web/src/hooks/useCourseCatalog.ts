'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { analytics } from '@/lib/analytics'
import {
  MOBILE_BREAKPOINT,
  NOTICE_IMAGE_LOADED_EVENT,
  NOTICE_STORAGE_KEY,
  NOTICE_VERSION,
} from '@/lib/constants'
import { SCRAPED_AT_BY_YEAR } from '@/lib/generated/scrape-times'
import { getSubjectCodesForYear } from '@/lib/subjectUtils'
import type { InternalCourse } from '@/lib/types'
import { transformExternalCourseData } from '@/lib/validation'

export interface CourseCatalogProgress {
  loaded: number
  total: number
  currentSubject: string
}

export interface CourseCatalog {
  year: string
  courses: InternalCourse[]
  scrapedAt: Date | undefined
  status: 'loading' | 'ready' | 'partial' | 'empty'
  progress: CourseCatalogProgress
  loadedBytes: number
  failedSubjectCount: number
}

const EMPTY_PROGRESS: CourseCatalogProgress = {
  loaded: 0,
  total: 0,
  currentSubject: '',
}

function getScrapedAt(year: string): Date | undefined {
  const scrapedAt = SCRAPED_AT_BY_YEAR[year]
  return scrapedAt ? new Date(scrapedAt) : undefined
}

function createLoadingCatalog(year: string, total = 0): CourseCatalog {
  return {
    year,
    courses: [],
    scrapedAt: getScrapedAt(year),
    status: 'loading',
    progress: {
      loaded: 0,
      total,
      currentSubject: total > 0 ? 'Starting parallel load...' : '',
    },
    loadedBytes: 0,
    failedSubjectCount: 0,
  }
}

export function useCourseCatalog(year: string): CourseCatalog {
  const [catalogsByYear, setCatalogsByYear] = useState<Map<string, CourseCatalog>>(() => new Map())
  // Years whose catalog is complete. The courses themselves live in catalogsByYear;
  // this only answers "already fetched?" without adding that state to the effect's deps.
  const completeYearsRef = useRef<Set<string>>(new Set())
  const loadingYearsRef = useRef<Set<string>>(new Set())
  const availableSubjects = useMemo(() => getSubjectCodesForYear(year), [year])
  const initialCatalog = useMemo(() => createLoadingCatalog(year), [year])

  useEffect(() => {
    if (completeYearsRef.current.has(year)) {
      console.log(`Using cached ${year} course catalog`)
      return
    }

    // Claim an in-flight load so React StrictMode and rapid year switches do not
    // issue duplicate requests. Failed or partial years release the claim and can
    // retry when the user next activates that year.
    if (loadingYearsRef.current.has(year)) return

    const updateCatalog = (update: (catalog: CourseCatalog) => CourseCatalog) => {
      setCatalogsByYear((current) => {
        const next = new Map(current)
        next.set(year, update(current.get(year) ?? createLoadingCatalog(year)))
        return next
      })
    }

    const loadCourseData = async () => {
      loadingYearsRef.current.add(year)
      setCatalogsByYear((current) => {
        const next = new Map(current)
        next.set(year, createLoadingCatalog(year, availableSubjects.length))
        return next
      })

      const startTime = performance.now()
      const subjectLoadTimes: { subject: string; time: number; size: number }[] = []

      try {
        const allCoursesData: InternalCourse[] = []

        console.log(
          `Loading ${availableSubjects.length} subjects in parallel (exemption codes excluded)...`
        )

        const allPromises = availableSubjects.map(async (subject) => {
          const subjectStartTime = performance.now()
          let loadedBytes = 0
          let loadTime = 0

          try {
            const response = await fetch(`/data/${year}/${subject}.json`)
            if (!response.ok) {
              console.warn(`Failed to load ${subject}.json: ${response.status}`)
              return { subject, success: false, error: `HTTP ${response.status}` }
            }

            const rawData = await response.json()
            const subjectEndTime = performance.now()
            const dataSize = JSON.stringify(rawData).length
            loadedBytes = dataSize
            loadTime = subjectEndTime - subjectStartTime

            if (rawData.courses && Array.isArray(rawData.courses)) {
              const transformedData = transformExternalCourseData(rawData)
              console.debug(
                `${subject.padEnd(4)}: ${transformedData.courses.length.toString().padStart(5)} courses, ${Math.round(
                  dataSize / 1024
                )
                  .toString()
                  .padStart(5)}KB, ${Math.round(loadTime).toString().padStart(5)}ms`
              )

              return {
                subject,
                courses: transformedData.courses,
                loadTime: Math.round(loadTime),
                dataSize: Math.round(dataSize / 1024),
                success: true,
              }
            }

            console.warn(`Invalid data structure in ${subject}.json`)
            return { subject, success: false, error: 'Invalid data structure' }
          } catch (error) {
            console.warn(`Failed to load ${subject} data:`, error)
            return { subject, success: false, error: String(error) }
          } finally {
            const elapsed = loadTime || performance.now() - subjectStartTime
            updateCatalog((catalog) => ({
              ...catalog,
              progress: {
                loaded: catalog.progress.loaded + 1,
                total: catalog.progress.total,
                currentSubject: `${subject} (${Math.round(elapsed)}ms) - ${catalog.progress.loaded + 1}/${catalog.progress.total}`,
              },
              loadedBytes: catalog.loadedBytes + loadedBytes,
            }))
          }
        })

        const results = await Promise.all(allPromises)

        results.forEach((result) => {
          if (result.success && result.courses) {
            allCoursesData.push(...result.courses)
            subjectLoadTimes.push({
              subject: result.subject,
              time: result.loadTime || 0,
              size: result.dataSize || 0,
            })
          } else {
            subjectLoadTimes.push({
              subject: result.subject,
              time: 0,
              size: 0,
            })
          }
        })

        const successCount = results.filter((result) => result.success).length
        const failedSubjectCount = availableSubjects.length - successCount
        const totalDataSize = subjectLoadTimes.reduce(
          (sum, subject) => sum + subject.size * 1024,
          0
        )
        const totalLoadTime = performance.now() - startTime

        console.log(
          `Loaded ${allCoursesData.length} total courses from ${successCount}/${availableSubjects.length} subjects`
        )

        const validTimes = subjectLoadTimes.filter((subject) => subject.time > 0)
        const slowest =
          validTimes.length > 0
            ? validTimes.reduce((max, subject) => (subject.time > max.time ? subject : max))
            : null

        analytics.courseDataLoaded({
          totalLoadTimeMs: Math.round(totalLoadTime),
          subjectCount: availableSubjects.length,
          successCount,
          failedCount: failedSubjectCount,
          totalSizeKb: Math.round(totalDataSize / 1024),
          slowestSubject: slowest?.subject ?? '',
          slowestTimeMs: slowest?.time ?? 0,
          avgTimeMs:
            validTimes.length > 0
              ? Math.round(
                  validTimes.reduce((sum, subject) => sum + subject.time, 0) / validTimes.length
                )
              : 0,
        })

        if (successCount === 0) {
          console.error(`❌ No course data could be loaded - check that /data/${year}/ files exist`)
        }

        const status: CourseCatalog['status'] =
          successCount === 0 ? 'empty' : failedSubjectCount > 0 ? 'partial' : 'ready'

        if (status === 'ready') {
          completeYearsRef.current.add(year)
        } else {
          completeYearsRef.current.delete(year)
        }

        setCatalogsByYear((current) => {
          const next = new Map(current)
          next.set(year, {
            year,
            courses: allCoursesData,
            scrapedAt: getScrapedAt(year),
            status,
            progress: EMPTY_PROGRESS,
            loadedBytes: totalDataSize,
            failedSubjectCount,
          })
          return next
        })
      } catch (error) {
        console.error('Failed to load course data:', error)
        completeYearsRef.current.delete(year)
        setCatalogsByYear((current) => {
          const next = new Map(current)
          next.set(year, {
            year,
            courses: [],
            scrapedAt: getScrapedAt(year),
            status: 'empty',
            progress: EMPTY_PROGRESS,
            loadedBytes: 0,
            failedSubjectCount: availableSubjects.length,
          })
          return next
        })
      } finally {
        loadingYearsRef.current.delete(year)
      }
    }

    const isMobile = window.innerWidth < MOBILE_BREAKPOINT
    const seenVersion = localStorage.getItem(NOTICE_STORAGE_KEY)
    const shouldWaitForImage = isMobile && seenVersion !== NOTICE_VERSION

    if (shouldWaitForImage) {
      const handleImageLoaded = () => {
        loadCourseData()
      }

      window.addEventListener(NOTICE_IMAGE_LOADED_EVENT, handleImageLoaded, { once: true })

      return () => {
        window.removeEventListener(NOTICE_IMAGE_LOADED_EVENT, handleImageLoaded)
      }
    }

    loadCourseData()
  }, [availableSubjects, year])

  return catalogsByYear.get(year) ?? initialCatalog
}
