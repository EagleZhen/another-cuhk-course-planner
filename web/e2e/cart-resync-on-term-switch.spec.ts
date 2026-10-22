import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { DEFAULT_CURRENT_TERM } from '../src/lib/constants'
import { openPlannerAtTerm, selectTerm } from './helpers/planner'
import { readSavedEnrollments, readScheduleRecords } from './helpers/schedule'

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
    // Deliberately the pre-#331 number: seeds a legacy cart, so this run exercises
    // normalizeStoredCredits.
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

// syncCart skips a term no course in the catalog offers, so Term 2 needs a course of
// its own for a test whose enrolled course only exists in Term 1.
const termCoverageCourse = {
  subject: 'ACCT',
  course_code: '9999',
  title: 'Term Coverage Fixture',
  credits: '0.00',
  terms: [{ term_code: '2620', term_name: TERM_TWO, schedule: [] }],
}

async function openPlanner(page: Page, testCourse: object) {
  const schedule = storedSchedule()
  await page.addInitScript(
    ({ termOne, termTwo, value }) => {
      localStorage.setItem(`schedule_${termOne}`, value)
      localStorage.setItem(`schedule_${termTwo}`, value)
    },
    { termOne: TERM_ONE, termTwo: TERM_TWO, value: JSON.stringify(schedule) }
  )
  await openPlannerAtTerm(page, {
    term: TERM_ONE,
    catalog: { '2026-27/ACCT': [testCourse, termCoverageCourse] },
  })
  await expect(courseCard(page)).toBeVisible()

  await expect.poll(async () => (await savedEnrollment(page, TERM_ONE))?.lastSynced).toBeTruthy()
  await expectNotSynced(page, TERM_TWO, JSON.stringify(schedule))
}

async function savedEnrollment(page: Page, term: string) {
  return (await readSavedEnrollments(page, term))?.[0]
}

async function expectNotSynced(page: Page, term: string, original: string) {
  expect(await page.evaluate((key) => localStorage.getItem(key), `schedule_${term}`)).toBe(original)
  // The startup load may adopt the default term before fixture selection, but must not sync it.
  const records = await readScheduleRecords(page, term)
  if (records?.current === undefined) {
    expect(records?.receipt).toBeUndefined()
    return
  }
  const untouched = await savedEnrollment(page, term)
  expect(untouched).toMatchObject({ courseId: COURSE_ID })
  expect(untouched?.lastSynced).toBeUndefined()
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

  await selectTerm(page, TERM_TWO)

  await expect(page.getByText(`This course is no longer offered in ${TERM_TWO}.`)).toBeVisible()
  await expect(courseCard(page)).toHaveClass(/bg-amber-50/)
  await expect
    .poll(() => savedEnrollment(page, TERM_TWO))
    .toMatchObject({
      isInvalid: true,
      invalidReason: 'Course no longer available',
    })

  await selectTerm(page, TERM_ONE)

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

  await selectTerm(page, TERM_TWO)

  await expect(page.locator(`[data-removed-section="${SECTION_ID}"]`)).toBeVisible()
  await expect
    .poll(() => savedEnrollment(page, TERM_TWO))
    .toMatchObject({
      isInvalid: false,
      selectedSections: [],
      removedSections: [{ id: SECTION_ID }],
    })
})

test('selects the fixture term before synchronizing the default term cart', async ({ page }) => {
  const defaultTerm: string = DEFAULT_CURRENT_TERM
  const fixtureTerm = defaultTerm === TERM_ONE ? TERM_TWO : TERM_ONE
  const terms = [fixtureTerm, DEFAULT_CURRENT_TERM]
  const schedule = storedSchedule()
  schedule.enrollments[0].course.terms = terms.map((termName, index) => ({
    termCode: String(index),
    termName,
    sections: [storedSection],
  }))
  const course = {
    subject: 'ACCT',
    course_code: '1111',
    title: 'Foundations in Financial Accounting',
    credits: '3.00',
    terms: terms.map((term_name, index) => ({
      term_code: String(index),
      term_name,
      schedule: [externalSection],
    })),
  }
  await page.addInitScript(
    ({ terms, value }) => {
      for (const term of terms) localStorage.setItem(`schedule_${term}`, value)
    },
    { terms, value: JSON.stringify(schedule) }
  )

  await openPlannerAtTerm(page, {
    term: fixtureTerm,
    catalog: Object.fromEntries(terms.map((term) => [`${term.split(' ')[0]}/ACCT`, [course]])),
  })

  await expect(courseCard(page)).toBeVisible()
  await expect
    .poll(() => savedEnrollment(page, fixtureTerm))
    .toMatchObject({
      courseId: COURSE_ID,
      lastSynced: expect.any(Date),
    })
  await expectNotSynced(page, DEFAULT_CURRENT_TERM, JSON.stringify(schedule))

  await selectTerm(page, DEFAULT_CURRENT_TERM)
  await expect
    .poll(() => savedEnrollment(page, DEFAULT_CURRENT_TERM))
    .toMatchObject({
      courseId: COURSE_ID,
      lastSynced: expect.any(Date),
    })
})

test('a confirmed replacement reconciles with the catalog already loaded in this tab', async ({
  page,
  context,
}) => {
  const offering = (location: string) => ({
    subject: 'ACCT',
    course_code: '1111',
    title: 'Foundations in Financial Accounting',
    credits: '3.00',
    terms: [
      {
        term_code: '2610',
        term_name: TERM_ONE,
        schedule: [
          { ...externalSection, meetings: [{ ...externalSection.meetings[0], location }] },
        ],
      },
    ],
  })
  await openPlanner(page, offering('Current room'))
  await expect
    .poll(() => savedEnrollment(page, TERM_ONE))
    .toMatchObject({
      selectedSections: [{ meetings: [{ location: 'Current room' }] }],
    })
  const other = await context.newPage()
  await openPlanner(other, offering('Older room'))
  await expect
    .poll(() => savedEnrollment(other, TERM_ONE))
    .toMatchObject({
      selectedSections: [{ meetings: [{ location: 'Older room' }] }],
    })
  await courseCard(page).getByTitle('Hide course', { exact: true }).click()
  const notice = page.locator('[data-schedule-storage-notice]')
  await expect(notice).toContainText('changed in another tab')
  page.once('dialog', (dialog) => dialog.accept())
  await notice
    .getByRole('button', { name: 'Discard edits and load saved version', exact: true })
    .click()
  await expect
    .poll(() => savedEnrollment(page, TERM_ONE))
    .toMatchObject({
      selectedSections: [{ meetings: [{ location: 'Current room' }] }],
    })
  await expect(notice).toHaveCount(0)
})
