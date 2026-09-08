import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// Fridays in 2026-27 Term 1, so each date falls on the weekday its time states.
const term = '2026-27 Term 1'
const storageKey = `schedule_${term}`
const slot = 'Fr 2:30PM - 5:15PM'

// The shown week is today's, clamped to the cart's range, so the wall clock would
// otherwise decide which week these assertions run against.
const TODAY = new Date('2026-09-08T10:00:00+08:00')

function section(id: string, sectionCode: string, sectionType: string, dates: string) {
  return {
    id,
    sectionCode,
    sectionType,
    meetings: [{ time: slot, location: 'Lee Shau Kee Building LT5', instructors: 'Staff', dates }],
    availability: {
      capacity: 70,
      enrolled: 0,
      status: 'Open',
      availableSeats: 70,
      waitlistCapacity: 0,
      waitlistTotal: 0,
    },
    classAttributes: 'English only',
  }
}

async function openPlanner(page: Page, tutorialDates: string) {
  const sections = [
    section('lec', '--LEC (1)', 'LEC', '11/9'),
    section('tut', '-T01-TUT (2)', 'TUT', tutorialDates),
  ]

  await page.clock.setFixedTime(TODAY)
  await page.route('**/data/**', (route) => route.abort())
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: storageKey,
    value: JSON.stringify({
      version: 3,
      enrollments: [
        {
          courseId: 'GEWS1011',
          course: {
            subject: 'GEWS',
            courseCode: '1011',
            title: 'College Induction Course',
            credits: 3,
            terms: [{ termCode: '2610', termName: term, sections }],
          },
          selectedSections: sections,
          color: 'bg-teal-700',
          isVisible: true,
          isInvalid: false,
        },
      ],
    }),
  })
  await page.goto('/')
}

const cards = (page: Page) => page.locator('[data-course-card]')
const conflictZone = (page: Page) => page.locator('[data-conflict-zone]')
const conflictBadge = (page: Page) => page.getByTitle(/Conflicts with/)

test('reports no conflict for sections that never share a date', async ({ page }) => {
  await openPlanner(page, '25/9')

  // Week of 7 September: the lecture alone, its column dated.
  await expect(cards(page)).toHaveCount(1)
  await expect(page.getByText('11/9', { exact: true })).toBeVisible()
  await expect(conflictBadge(page)).toHaveCount(0)
  await expect(conflictZone(page)).toHaveCount(0)
})

test('reports a conflict for sections sharing every date', async ({ page }) => {
  await openPlanner(page, '11/9')

  await expect(cards(page)).toHaveCount(2)
  await expect(conflictBadge(page).first()).toBeVisible()
  await expect(conflictZone(page).first()).toBeVisible()
})

test('steps to the next week that differs, empty weeks included', async ({ page }) => {
  await openPlanner(page, '25/9')
  const nextWeek = page.getByRole('button', { name: 'Next week' })

  await expect(page.getByText('Week 1 of 3')).toBeVisible()

  await nextWeek.click()
  await expect(page.getByText('Week 2 of 3')).toBeVisible()
  await expect(page.getByText('No classes this week')).toBeVisible()
  await expect(cards(page)).toHaveCount(0)

  await nextWeek.click()
  await expect(page.getByText('Week 3 of 3')).toBeVisible()
  await expect(cards(page)).toHaveCount(1)
  await expect(nextWeek).toBeDisabled()
})
