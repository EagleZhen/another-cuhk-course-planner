import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

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

async function openCart(page: Page) {
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
            terms: [{ termCode: '2610', termName: term, sections: [section] }],
          },
          selectedSections: [section],
          // What the user last saw: the same lecture in the other building.
          lastSeenSections: {
            lec: {
              meetings: [{ time: slot, location: wasIn, instructor }],
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
  await page.goto('/')
}

test('shows what a changed field was and is', async ({ page }) => {
  await openCart(page)

  await expect(page.getByText('1 course changed since you last checked')).toBeVisible()

  // The field carrying the changed styling, not the calendar card's copy of it.
  const changedLocation = page.locator('span.bg-amber-100', { hasText: nowIn })

  await expect(changedLocation).toHaveAttribute('title', `${wasIn}\n↓\n${nowIn}`)
})

// Dates answer for the time, not the room, so they hang off the time row.
test('shows the dates on the time row', async ({ page }) => {
  await openCart(page)

  // The row's own time span, not the calendar card's copy of the same text.
  const time = page.locator('span.font-mono', { hasText: 'Fr 14:30-17:15' })

  await expect(time).toHaveAttribute('title', 'Dates\n18/9')
})
