import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

// An August lecture on a Monday. Its date carries no year, and the weekday
// resolves it to the term's first: 24 August 2026 is a Monday, where the month
// rule this replaced said 2027 — a Tuesday. The export is where a wrong year
// reaches a student's real calendar.
const term = '2026-27 Term 1'
const storageKey = `schedule_${term}`

const section = {
  id: 'lec',
  sectionCode: 'AE-LEC (4304)',
  sectionType: 'LEC',
  meetings: [
    {
      time: 'Mo 8:45AM - 6:45PM',
      location: 'No Room Required',
      instructors: 'Staff',
      dates: '24/8',
    },
  ],
  availability: {
    capacity: 60,
    enrolled: 0,
    status: 'Open',
    availableSeats: 60,
    waitlistCapacity: 0,
    waitlistTotal: 0,
  },
  classAttributes: 'English only',
}

test('exports the August lecture in the year its weekday states', async ({ page }) => {
  await page.route('**/data/**', (route) => route.abort())
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: storageKey,
    value: JSON.stringify({
      version: 3,
      enrollments: [
        {
          courseId: 'EMBA5011',
          course: {
            subject: 'EMBA',
            courseCode: '5011',
            title: 'Management of the Corporation',
            credits: 3,
            terms: [{ termCode: '2610', termName: term, sections: [section] }],
          },
          selectedSections: [section],
          color: 'bg-teal-700',
          isVisible: true,
          isInvalid: false,
        },
      ],
    }),
  })
  // The export confirms before downloading.
  page.on('dialog', (dialog) => dialog.accept())
  await page.goto('/')

  // Non-vacuous: the export is empty unless the cart really loaded.
  await expect(page.locator('[data-course-card]')).toHaveCount(1)

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '.ics' }).click()

  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^2026-27-Term-1-Schedule-.*\.ics$/)

  const ics = await readFile((await download.path())!, 'utf8')

  // 08:45 Hong Kong on 24 August 2026 is 00:45 UTC the same day.
  expect(ics).toContain('DTSTART:20260824T004500Z')
  expect(ics).toContain('UID:EMBA5011-A-LEC-2026-08-24-0845-1845@another-cuhk-course-planner.com')
  expect(ics).not.toContain('2027')
})
