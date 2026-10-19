import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { SectionMeetingSignature } from '../src/lib/types'
import { expectEmptyCatalogLoaded } from './helpers/catalog'
import { openPlannerAtTerm } from './helpers/planner'

const term = '2026-27 Term 1'
const storageKey = `schedule_${term}`
const slot = 'Fr 2:30PM - 5:15PM'
const instructor = 'Professor LIU Yan'
const wasIn = 'Lee Shau Kee Building LT5'
const nowIn = "Yasumoto Int'l Acad Park LT1"

// GEWS1011's lecture really does change building mid-term. Here it has moved
// since the user last looked, so the cart should say what it was as well as is.
const section = {
  id: 'lec',
  sectionCode: '--LEC (1)',
  sectionType: 'LEC',
  meetings: [{ time: slot, location: nowIn, instructors: instructor, dates: '18/9' }],
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

async function openCart(
  page: Page,
  previous: SectionMeetingSignature[] = [{ time: slot, location: wasIn, instructor }]
) {
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
            credits: { min: 3, max: 3 },
            terms: [{ termCode: '2610', termName: term, sections: [section] }],
          },
          selectedSections: [section],
          lastSeenSections: {
            lec: {
              meetings: previous,
              language: 'English only',
            },
          },
          color: 'bg-teal-700',
          isVisible: true,
          isInvalid: false,
        },
      ],
    }),
  })
  await openPlannerAtTerm(page, { term })
  await expectEmptyCatalogLoaded(page)
  await expect(
    page.locator('[data-shopping-cart]').getByRole('button', { name: 'GEWS1011', exact: true })
  ).toBeVisible()
}

test('shows what a changed field was and is', async ({ page }) => {
  await openCart(page)

  await expect(page.getByText('1 course changed since you last checked')).toBeVisible()

  // The field carrying the changed styling, not the calendar card's copy of it.
  const changedLocation = page.locator('span.bg-amber-100', { hasText: nowIn })

  await expect(changedLocation).toHaveAttribute('title', `${wasIn}\n↓\n${nowIn}`)
})

// Dates sit under the time, the field they qualify.
test('shows the dates under the time', async ({ page }) => {
  await openCart(page)

  // The meeting row's own date line, not the calendar's day header.
  await expect(page.locator('div.text-gray-400', { hasText: '18/9' })).toBeVisible()
})

// The .ics export has always been per-occurrence, so a moved date invalidates
// events the student already imported. The date line is where that shows.
test('marks a date that moved, with what it was', async ({ page }) => {
  await openCart(page, [{ time: slot, location: nowIn, instructor, dates: ['11/9'] }])

  const dates = page.locator('div.bg-amber-100', { hasText: '18/9' })

  await expect(dates).toHaveAttribute('title', '11/9\n↓\n18/9')
})

test('removed meeting dates keep their own tooltips', async ({ page }) => {
  const dateCases = [
    ['Mo', '14/9', '14/9'],
    ['Tu', '15/9, 22/9, 29/9', '15/9-29/9'],
    ['We', '16/9 - 30/9', '16/9-30/9'],
  ]
  await openCart(page, [
    { time: slot, location: nowIn, instructor, dates: ['18/9'] },
    ...dateCases.map(([day, dates]) => ({
      time: `${day} 9:30AM - 10:15AM`,
      location: wasIn,
      instructor,
      dates: [dates],
    })),
  ])

  const removedMeetings = page
    .locator('[data-shopping-cart]')
    .getByTitle('This meeting was removed from the class schedule since you last checked', {
      exact: true,
    })
  await expect(removedMeetings).toHaveCount(3)
  for (const [, dates, shown] of dateCases) {
    await expect(removedMeetings.getByText(shown, { exact: true })).toHaveAttribute('title', dates)
  }
})
