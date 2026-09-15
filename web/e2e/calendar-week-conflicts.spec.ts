import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// Fridays in 2026-27 Term 1, so each date falls on the weekday its time states.
const term = '2026-27 Term 1'
const storageKey = `schedule_${term}`
const slot = 'Fr 2:30PM - 5:15PM'

// Term 2's dates are Fridays in 2027 only, so they resolve to its second year.
const termTwo = '2026-27 Term 2'
const storageKeyTwo = `schedule_${termTwo}`

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

function storedSchedule(
  termCode: string,
  termName: string,
  sections: ReturnType<typeof section>[]
) {
  return JSON.stringify({
    version: 3,
    enrollments: [
      {
        courseId: 'GEWS1011',
        course: {
          subject: 'GEWS',
          courseCode: '1011',
          title: 'College Induction Course',
          credits: 3,
          terms: [{ termCode, termName, sections }],
        },
        selectedSections: sections,
        color: 'bg-teal-700',
        isVisible: true,
        isInvalid: false,
      },
    ],
  })
}

async function seed(page: Page, schedules: Record<string, string>) {
  await page.clock.setFixedTime(TODAY)
  await page.route('**/data/**', (route) => route.abort())
  await page.addInitScript((stored: Record<string, string>) => {
    for (const [key, value] of Object.entries(stored)) localStorage.setItem(key, value)
  }, schedules)
  await page.goto('/')
}

async function openPlanner(page: Page, tutorialDates: string, lectureDates = '11/9') {
  await seed(page, {
    [storageKey]: storedSchedule('2610', term, [
      section('lec', '--LEC (1)', 'LEC', lectureDates),
      section('tut', '-T01-TUT (2)', 'TUT', tutorialDates),
    ]),
  })
}

// Two constraints the breathing counts rest on: both terms have dated meetings,
// or there are no cards to breathe on; and they land on different weeks, or the
// shown week never changes and the comparison runs against itself.
async function openBothTerms(page: Page) {
  await seed(page, {
    [storageKey]: storedSchedule('2610', term, [section('lec', '--LEC (1)', 'LEC', '11/9')]),
    [storageKeyTwo]: storedSchedule('2620', termTwo, [
      section('lec', '--LEC (1)', 'LEC', '8/1, 15/1'),
      section('tut', '-T01-TUT (2)', 'TUT', '15/1'),
    ]),
  })
}

// Sampling the DOM cannot prove a negative here: the breathing clears itself after
// CHANGED_HIGHLIGHT_MS, so a late count reads zero whether or not it ever appeared.
// Watch from before the action instead, and the answer stops depending on timing.
async function watchForBreathing(page: Page) {
  await page.evaluate(() => {
    const flag = window as unknown as { breathed: boolean }
    flag.breathed = false
    new MutationObserver(() => {
      if (document.querySelector('.changed-breathing')) flag.breathed = true
    }).observe(document.body, { subtree: true, attributes: true, childList: true })
  })

  return async () => {
    // The class lands a commit after the cards, so settle before reading.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    )

    return page.evaluate(() => (window as unknown as { breathed: boolean }).breathed)
  }
}

async function switchToTerm(page: Page, label: string) {
  await page.getByTitle('Click to change term').first().click()
  await page.getByRole('button', { name: label, exact: true }).click()
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

// Standing inside a run of repeated weeks, back used to step to that run's own
// first week and change nothing on screen. Reaching such a week needs the toggle,
// which is also the only route the unit tests cannot take.
test('back clears the run it is standing in', async ({ page }) => {
  await openPlanner(page, '25/9, 2/10, 9/10', '11/9, 18/9')
  const skip = page.getByRole('button', { name: 'Skip repeated weeks' })
  const nextWeek = page.getByRole('button', { name: 'Next week' })
  const previousWeek = page.getByRole('button', { name: 'Previous week' })

  // Weeks 3 to 5 all show the tutorial alone, so only the toggle reaches week 5.
  await skip.click()
  for (let i = 0; i < 4; i++) await nextWeek.click()
  await expect(page.getByText('Week 5 of 5')).toBeVisible()

  await skip.click()
  await previousWeek.click()
  await expect(page.getByText('Week 2 of 5')).toBeVisible()
  await expect(cards(page)).toHaveCount(1)

  // And nothing earlier differs from the lecture week, so back is spent.
  await expect(previousWeek).toBeDisabled()
  await expect(page.getByTitle('Every earlier week shows the same classes')).toBeVisible()
})

test('breathes on the card that was not on the timetable it came from', async ({ page }) => {
  await openPlanner(page, '25/9, 2/10, 9/10', '11/9, 18/9')

  // Week 1 is arrived at with nothing before it, so nothing breathes.
  await expect(page.locator('.changed-breathing')).toHaveCount(0)

  await page.getByRole('button', { name: 'Next week' }).click()
  await expect(page.getByText('Week 3 of 5')).toBeVisible()
  await expect(page.locator('.changed-breathing')).toHaveCount(1)

  // It is navigation state, not schedule content, so it lets go by itself.
  await expect(page.locator('.changed-breathing')).toHaveCount(0, { timeout: 6000 })
})

// A term switch replaces the timetable rather than stepping through one, so every
// card is new by definition and saying so of all of them says nothing.
test('breathes on nothing when a term switch swaps the timetable', async ({ page }) => {
  await openBothTerms(page)
  await expect(cards(page)).toHaveCount(1)

  const breathed = await watchForBreathing(page)
  await switchToTerm(page, 'Term 2')

  await expect(page.getByText('Week 1 of 2')).toBeVisible()
  await expect(cards(page)).toHaveCount(1)
  expect(await breathed()).toBe(false)
})

test('breathes on what a step reveals in the term switched to', async ({ page }) => {
  await openBothTerms(page)
  await switchToTerm(page, 'Term 2')
  await expect(page.getByText('Week 1 of 2')).toBeVisible()

  await page.getByRole('button', { name: 'Next week' }).click()

  await expect(page.getByText('Week 2 of 2')).toBeVisible()
  await expect(page.locator('.changed-breathing')).toHaveCount(1, { timeout: 1000 })
})
