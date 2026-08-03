import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const TERM_ONE = '2026-27 Term 1'
const TERM_TWO = '2026-27 Term 2'
const COURSE_ID = 'ACCT1111'
const SECTION_CODE = 'A-LEC (1001)'
const SECTION_ID = `${COURSE_ID}_${SECTION_CODE}`

const storedSection = {
  id: SECTION_ID,
  sectionCode: SECTION_CODE,
  sectionType: 'LEC',
  meetings: [
    {
      time: 'Mo 9:30AM - 10:15AM',
      location: 'Yasumoto International Academic Park 101',
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

const externalSection = {
  section: SECTION_CODE,
  meetings: [
    {
      time: storedSection.meetings[0].time,
      location: storedSection.meetings[0].location,
      instructor: storedSection.meetings[0].instructors,
      dates: '',
    },
  ],
  availability: {
    capacity: '70',
    enrolled: '0',
    status: 'Open',
    available_seats: '70',
    waitlist_capacity: '0',
    waitlist_total: '0',
  },
  class_attributes: 'English only',
}

function storedCourse() {
  return {
    subject: 'ACCT',
    courseCode: '1111',
    title: 'Foundations in Financial Accounting',
    credits: 3,
    terms: [
      { termCode: '2610', termName: TERM_ONE, sections: [storedSection] },
      { termCode: '2620', termName: TERM_TWO, sections: [storedSection] },
    ],
  }
}

function storedSchedule() {
  return {
    version: 3,
    enrollments: [
      {
        courseId: COURSE_ID,
        course: storedCourse(),
        selectedSections: [storedSection],
        color: 'bg-teal-700',
        isVisible: true,
        isInvalid: false,
      },
    ],
  }
}

const termCoverageCourse = {
  subject: 'ACCT',
  course_code: '9999',
  title: 'Term Coverage Fixture',
  credits: '0.00',
  terms: [{ term_code: '2620', term_name: TERM_TWO, schedule: [] }],
}

async function openPlanner(page: Page, testCourse: object) {
  await page.route('**/data/2026-27/*.json', async (route) => {
    const subject = new URL(route.request().url()).pathname.split('/').at(-1)?.replace('.json', '')
    const courses = subject === 'ACCT' ? [testCourse, termCoverageCourse] : []

    await route.fulfill({
      json: {
        metadata: { schema_version: 1, subject, total_courses: courses.length },
        courses,
      },
    })
  })

  const schedule = storedSchedule()
  await page.addInitScript(
    ({ termOne, termTwo, value }) => {
      localStorage.setItem(`schedule_${termOne}`, value)
      localStorage.setItem(`schedule_${termTwo}`, value)
    },
    { termOne: TERM_ONE, termTwo: TERM_TWO, value: JSON.stringify(schedule) }
  )
  await page.goto('/')

  await expect
    .poll(() =>
      page.evaluate((key) => {
        const saved = JSON.parse(localStorage.getItem(key) ?? 'null')
        return saved?.enrollments?.[0]?.lastSynced
      }, `schedule_${TERM_ONE}`)
    )
    .toBeTruthy()
}

async function switchToTerm(page: Page, label: 'Term 1' | 'Term 2') {
  await page.getByTitle('Click to change term').first().click()
  await page.getByRole('button', { name: label, exact: true }).click()
}

async function savedEnrollment(page: Page, term: string) {
  return page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null')
    return saved?.enrollments?.[0]
  }, `schedule_${term}`)
}

function courseCard(page: Page) {
  return page
    .getByText('Foundations in Financial Accounting', { exact: true })
    .locator('xpath=ancestor::div[contains(@class, "border-l-4")][1]')
}

test('resyncs a restored cart when switching terms in a loaded year', async ({ page }) => {
  await openPlanner(page, {
    subject: 'ACCT',
    course_code: '1111',
    title: 'Foundations in Financial Accounting',
    credits: '3.00',
    terms: [{ term_code: '2610', term_name: TERM_ONE, schedule: [externalSection] }],
  })

  await expect(courseCard(page)).not.toHaveClass(/bg-amber-50/)

  await switchToTerm(page, 'Term 2')

  await expect(page.getByText(`This course is no longer offered in ${TERM_TWO}.`)).toBeVisible()
  await expect(courseCard(page)).toHaveClass(/bg-amber-50/)
  await expect
    .poll(() => savedEnrollment(page, TERM_TWO))
    .toMatchObject({
      isInvalid: true,
      invalidReason: 'Course no longer available',
    })

  await switchToTerm(page, 'Term 1')

  await expect(page.getByText(`This course is no longer offered in ${TERM_ONE}.`)).toHaveCount(0)
  await expect(courseCard(page)).not.toHaveClass(/bg-amber-50/)
  await expect.poll(() => savedEnrollment(page, TERM_ONE)).toMatchObject({ isInvalid: false })
})

test('tombstones a removed section when switching terms', async ({ page }) => {
  await openPlanner(page, {
    subject: 'ACCT',
    course_code: '1111',
    title: 'Foundations in Financial Accounting',
    credits: '3.00',
    terms: [
      { term_code: '2610', term_name: TERM_ONE, schedule: [externalSection] },
      { term_code: '2620', term_name: TERM_TWO, schedule: [] },
    ],
  })

  await expect(page.locator(`[data-removed-section="${SECTION_ID}"]`)).toHaveCount(0)

  await switchToTerm(page, 'Term 2')

  await expect(page.locator(`[data-removed-section="${SECTION_ID}"]`)).toBeVisible()
  await expect
    .poll(() => savedEnrollment(page, TERM_TWO))
    .toMatchObject({
      isInvalid: false,
      selectedSections: [],
      removedSections: [{ id: SECTION_ID }],
    })
})
