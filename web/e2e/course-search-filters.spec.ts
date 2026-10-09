import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { NOTICE_STORAGE_KEY, NOTICE_VERSION } from '../src/lib/constants'
import { mockCatalog } from './helpers/catalog'

const subjects = ['SURY', 'SUTM', 'UGEB', 'UGEC', 'UGED', 'UGFH', 'UGFN', 'URBD', 'URSP']
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const subjectLabel = subjects.join(', ')
const dayLabel = 'Mon, Tue, Wed, Thu, Fri, Sat'

async function openCatalog(page: Page) {
  await page.addInitScript(({ key, version }) => localStorage.setItem(key, version), {
    key: NOTICE_STORAGE_KEY,
    version: NOTICE_VERSION,
  })
  await mockCatalog(
    page,
    Object.fromEntries(
      [...subjects, 'ACCT'].map((subject) => [
        `2026-27/${subject}`,
        [
          {
            subject,
            course_code: '1001',
            title: subject === 'ACCT' ? 'Unselected subject fixture' : `${subject} filter fixture`,
            credits: '3.00',
            academic_career: 'Undergraduate',
            terms: [
              {
                term_code: '2610',
                term_name: '2026-27 Term 1',
                schedule: [
                  {
                    section: '--LEC (1)',
                    meetings: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => ({
                      time: `${day} 9:30AM - 10:15AM`,
                      location: 'Room 101',
                      instructor: 'Staff',
                      dates: '',
                    })),
                  },
                ],
              },
            ],
          },
        ],
      ])
    )
  )
  await page.goto('/')
}

// Page-wide overflow would also count the timetable's intentional horizontal scroll.
async function expectSummaryFits(summary: Locator) {
  const layout = await summary.evaluate((element) => {
    const fits = (child: Element, parent: Element) => {
      const inner = child.getBoundingClientRect()
      const outer = parent.getBoundingClientRect()
      return (
        inner.left >= outer.left - 1 &&
        inner.right <= outer.right + 1 &&
        inner.top >= outer.top - 1 &&
        inner.bottom <= outer.bottom + 1
      )
    }
    const pills = Array.from(element.querySelectorAll('[data-slot="badge"]'))
    return {
      fitsContainer:
        fits(element, element.parentElement!) &&
        fits(element.parentElement!, element.parentElement!.parentElement!),
      pills: pills.map((pill) => ({
        text: pill.textContent,
        fitsSummary: fits(pill, element),
        textFits: pill.scrollWidth <= pill.clientWidth + 1,
        removeFits: fits(pill.querySelector('button')!, pill),
      })),
    }
  })
  expect(layout.fitsContainer).toBe(true)
  expect(layout.pills).toHaveLength(5)
  for (const pill of layout.pills) {
    expect(pill, `Filter pill: ${pill.text}`).toMatchObject({
      fitsSummary: true,
      textFits: true,
      removeFits: true,
    })
  }
}

for (const width of [375, 1280]) {
  test(`keeps grouped filters readable and removable at ${width}px`, async ({
    page,
    browserName,
  }) => {
    test.slow(
      browserName === 'webkit',
      'The long filter-selection workflow exceeds the default budget in CI WebKit'
    )
    await page.setViewportSize({ width, height: 900 })
    await openCatalog(page)
    const catalog = page.locator('[data-course-search]')
    for (const subject of subjects) {
      await catalog.getByRole('button', { name: subject, exact: true }).click()
    }
    for (const day of days) {
      await catalog.getByTitle(`Show only courses with classes on ${day}`, { exact: true }).click()
    }
    await catalog.getByTitle('Show only 3-credit courses', { exact: true }).click()
    await catalog
      .getByTitle('Show only level-1 courses (codes starting with 1)', { exact: true })
      .click()
    await expect(catalog.getByText(/^Showing 9 courses/)).toBeVisible()
    await expect(catalog.getByText('Unselected subject fixture', { exact: true })).toHaveCount(0)

    const summary = catalog.getByText('Filtered by', { exact: true }).locator('..')
    await expectSummaryFits(summary)
    if (width === 375) {
      const lines = await summary.getByText(subjectLabel, { exact: true }).evaluate((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        return range.getClientRects().length
      })
      expect(lines).toBeGreaterThan(1)
    }

    await catalog.getByRole('button', { name: 'Hide filters', exact: true }).click()
    await expectSummaryFits(summary)
    const removeSubjects = summary.getByRole('button', {
      name: `Remove ${subjectLabel} filter`,
      exact: true,
    })
    await removeSubjects.click()
    await expect(removeSubjects).toHaveCount(0)
    await expect(
      summary.getByRole('button', { name: `Remove ${dayLabel} filter`, exact: true })
    ).toBeVisible()
    await expect(
      summary.getByRole('button', { name: 'Remove 3 credits filter', exact: true })
    ).toBeVisible()
    await expect(
      summary.getByRole('button', { name: 'Remove L1 filter', exact: true })
    ).toBeVisible()
    await expect(
      summary.getByRole('button', { name: 'Remove UG filter', exact: true })
    ).toBeVisible()
    await expect(catalog.getByText(/^Showing 10 courses/)).toBeVisible()
    await expect(
      catalog.getByText('Unselected subject fixture', { exact: true }).filter({ visible: true })
    ).toBeVisible()
  })
}
