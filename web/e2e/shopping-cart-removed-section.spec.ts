import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const term = '2026-27 Term 1'
const storageKey = `schedule_${term}`

function section(id: string, sectionCode: string, time: string) {
  return {
    id,
    sectionCode,
    sectionType: 'LEC',
    meetings: [
      {
        time,
        location: 'Wu Ho Man Yuen Bldg 505',
        instructors: 'Staff',
        dates: '',
      },
    ],
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

const removed = section('removed', 'A-LEC (removed)', 'Tu 3:30PM - 6:15PM')
const firstReplacement = section('first', 'B-LEC (first)', 'We 3:30PM - 6:15PM')
const lastReplacement = section('last', 'C-LEC (last)', 'Th 3:30PM - 6:15PM')

async function openCart(page: Page, alternatives: ReturnType<typeof section>[]) {
  const stored = {
    version: 3,
    enrollments: [
      {
        courseId: 'ACCT1111',
        course: {
          subject: 'ACCT',
          courseCode: '1111',
          title: 'Foundations in Financial Accounting',
          credits: 3,
          terms: [{ termCode: '2420', termName: term, sections: alternatives }],
        },
        selectedSections: [],
        removedSections: [removed],
        color: 'bg-teal-700',
        isVisible: true,
        isInvalid: false,
      },
    ],
  }

  await page.route('**/data/**', (route) => route.abort())
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value)
    },
    { key: storageKey, value: JSON.stringify(stored) }
  )
  await page.goto('/')

  await expect(page.getByText('A selected section is no longer offered.')).toBeVisible()
  await expect(page.getByText('A-LEC (removed)', { exact: true })).toHaveClass(/line-through/)
  await expect(page.getByTitle('This meeting was removed since you last checked')).toBeVisible()
}

async function expectReplacementSaved(page: Page, sectionId: string) {
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const saved = JSON.parse(localStorage.getItem(key) ?? 'null')
        return {
          selectedId: saved?.enrollments?.[0]?.selectedSections?.[0]?.id,
          removedCount: saved?.enrollments?.[0]?.removedSections?.length ?? 0,
        }
      }, storageKey)
    )
    .toEqual({ selectedId: sectionId, removedCount: 0 })
}

test('next replaces a removed section with the first compatible alternative', async ({ page }) => {
  await openCart(page, [firstReplacement, lastReplacement])

  await page.getByTitle('Choose the first compatible lecture section').click()

  await expect(page.getByText('B-LEC (first)', { exact: true })).toBeVisible()
  await expect(page.getByText('A-LEC (removed)', { exact: true })).toHaveCount(0)
  await expect(page.getByText('A selected section is no longer offered.')).toHaveCount(0)
  await expect(page.getByText('1 course changed since you last checked')).toHaveCount(0)
  await expectReplacementSaved(page, 'first')
})

test('previous replaces a removed section with the last compatible alternative', async ({
  page,
}) => {
  await openCart(page, [firstReplacement, lastReplacement])

  await page.getByTitle('Choose the last compatible lecture section').click()

  await expect(page.getByText('C-LEC (last)', { exact: true })).toBeVisible()
  await expectReplacementSaved(page, 'last')
})

test('dismisses the banner without removing the tombstone or replacement controls', async ({
  page,
}) => {
  await openCart(page, [firstReplacement, lastReplacement])

  await page.getByRole('button', { name: 'Dismiss all' }).click()

  await expect(page.getByText('1 course changed since you last checked')).toHaveCount(0)
  await expect(page.getByText('A-LEC (removed)', { exact: true })).toBeVisible()
  await expect(page.getByTitle('Choose the first compatible lecture section')).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const saved = JSON.parse(localStorage.getItem(key) ?? 'null')
        const enrollment = saved?.enrollments?.[0]
        return {
          acknowledged: enrollment?.removedSectionsAcknowledged,
          removedCount: enrollment?.removedSections?.length ?? 0,
        }
      }, storageKey)
    )
    .toEqual({ acknowledged: true, removedCount: 1 })

  await page.reload()
  await expect(page.getByText('1 course changed since you last checked')).toHaveCount(0)
  await expect(page.getByText('A-LEC (removed)', { exact: true })).toBeVisible()

  await page.getByTitle('Choose the first compatible lecture section').click()
  await expect(page.getByText('B-LEC (first)', { exact: true })).toBeVisible()
  await expectReplacementSaved(page, 'first')
})

test('shows guidance when the removed section type has no alternatives', async ({ page }) => {
  await openCart(page, [])

  await expect(
    page.getByText('No alternatives available. Search or remove the course.')
  ).toBeVisible()
  await expect(page.getByTitle(/Choose the .* compatible lecture section/)).toHaveCount(0)
})
