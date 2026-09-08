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

async function openPlanner(page: Page, tutorialDates: string, lectureDates = '11/9') {
  const sections = [
    section('lec', '--LEC (1)', 'LEC', lectureDates),
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
  await expect(page.locator('span.tabular-nums', { hasText: '11/9' })).toBeVisible()
  await expect(conflictBadge(page)).toHaveCount(0)
  await expect(conflictZone(page)).toHaveCount(0)
})

test('reports a conflict for sections that share a date', async ({ page }) => {
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

// A clash can sit in one week of many while the cart reports it all term, so the
// grid shows nothing wrong until you happen to page onto the right week.
test('jumps to the one week a conflict falls in', async ({ page }) => {
  // The lecture runs both weeks; the tutorial meets once, clashing only on 18/9.
  await openPlanner(page, '18/9', '11/9, 18/9')

  const jump = page.getByRole('button', { name: 'Review next conflict' })
  await expect(jump).toHaveAttribute('title', '1 of 2 weeks have a conflict')
  await expect(conflictZone(page)).toHaveCount(0)

  await jump.click()

  await expect(page.getByText('Week 2 of 2')).toBeVisible()
  await expect(conflictZone(page).first()).toBeVisible()
  // Arrived: the clash is on screen, so there is nothing left to point at.
  await expect(jump).toHaveCount(0)
})

test('offers no jump when nothing clashes', async ({ page }) => {
  await openPlanner(page, '25/9')

  await expect(page.getByRole('button', { name: 'Review next conflict' })).toHaveCount(0)
})

// Two thirds of conflicted carts clash every week, where the chevrons already
// show it and the button would only duplicate them.
test('offers no jump when the shown week already clashes', async ({ page }) => {
  await openPlanner(page, '11/9')

  await expect(conflictZone(page).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Review next conflict' })).toHaveCount(0)
})
