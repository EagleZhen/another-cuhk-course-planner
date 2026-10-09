import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { NOTICE_STORAGE_KEY, NOTICE_VERSION } from '../src/lib/constants'
import { expectEmptyCatalogLoaded, mockCatalog } from './helpers/catalog'

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
          credits: { min: 3, max: 3 },
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
  await mockCatalog(page)
  await page.addInitScript((stored: Record<string, string>) => {
    for (const [key, value] of Object.entries(stored)) localStorage.setItem(key, value)
  }, schedules)
  await page.goto('/')
  await expectEmptyCatalogLoaded(page)
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

// The breathing clears itself, so counting after the fact reads zero whether or not
// it ever appeared. Watch from before the action instead.
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
const conflictedSections = (page: Page) => page.getByTitle(/^Time conflict with:/)

async function openCalendarControls(page: Page, unscheduled = false) {
  const lecture = section('lec', '--LEC (1)', 'LEC', '11/9')
  if (unscheduled) {
    lecture.meetings[0].time = 'TBA'
    lecture.meetings[0].dates = ''
  }
  await page.addInitScript(({ key, version }) => localStorage.setItem(key, version), {
    key: NOTICE_STORAGE_KEY,
    version: NOTICE_VERSION,
  })
  await seed(page, { [storageKey]: storedSchedule('2610', term, [lecture]) })
}

test.describe('calendar controls on touch', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 900 } })

  for (const kind of ['scheduled', 'unscheduled']) {
    test(`reveals ${kind} visibility on selection and keeps selection when hiding`, async ({
      page,
    }) => {
      await openCalendarControls(page, kind === 'unscheduled')
      if (kind === 'unscheduled') {
        await page.getByRole('button', { name: 'Unscheduled courses', exact: true }).tap()
      }
      const selection = page.getByRole('button', { name: 'GEWS1011 LEC', exact: true })
      const card = selection.locator('..')
      const visibility = card.getByRole('button', { name: 'Hide course', exact: true })
      await expect(visibility).toHaveCSS('opacity', '0')
      await expect(visibility).toHaveCSS('pointer-events', 'none')

      await card.getByText('Lee Shau Kee Building LT5', { exact: true }).tap()
      await expect(selection).toHaveAttribute('aria-pressed', 'true')
      // A focused child could reveal the eye independently of selection.
      expect(await card.evaluate((element) => element.matches(':focus-within'))).toBe(false)
      expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true)
      await expect(visibility).toHaveCSS('opacity', '1')
      await expect(visibility).toHaveCSS('pointer-events', 'auto')
      await visibility.tap()

      await expect(card).toHaveCount(0)
      const cart = page.locator('[data-shopping-cart]')
      await expect(cart.getByRole('button', { name: 'Show course', exact: true })).toBeVisible()
      await expect(cart.getByRole('button', { name: 'GEWS1011', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
    })
  }
})

test.describe('calendar controls with keyboard', () => {
  for (const kind of ['scheduled', 'unscheduled']) {
    test(`selects and hides ${kind} courses with keyboard controls`, async ({ page }) => {
      await openCalendarControls(page, kind === 'unscheduled')
      if (kind === 'unscheduled') {
        const disclosure = page.getByRole('button', { name: 'Unscheduled courses', exact: true })
        await disclosure.focus()
        await page.keyboard.press('Enter')
      }
      const selection = page.getByRole('button', { name: 'GEWS1011 LEC', exact: true })
      const card = selection.locator('..')
      const visibility = card.getByRole('button', { name: 'Hide course', exact: true })
      await expect(visibility).toHaveCSS('opacity', '0')
      await selection.focus()
      await expect(visibility).toHaveCSS('opacity', '1')
      await expect(visibility).toHaveCSS('pointer-events', 'auto')
      await page.keyboard.press('Enter')
      await expect(selection).toHaveAttribute('aria-pressed', 'true')

      // The scheduled card renders the eye before its course code; the TBA card renders it after.
      await page.keyboard.press(kind === 'scheduled' ? 'Shift+Tab' : 'Tab')
      await expect(visibility).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(card).toHaveCount(0)
      const cart = page.locator('[data-shopping-cart]')
      await expect(cart.getByRole('button', { name: 'Show course', exact: true })).toBeVisible()
      await expect(cart.getByRole('button', { name: 'GEWS1011', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
    })
  }
})

test('unscheduled disclosure includes blank space but excludes nested course actions', async ({
  page,
}) => {
  await openCalendarControls(page, true)
  const unscheduled = page.locator('[data-screenshot="unscheduled"]')
  const disclosure = unscheduled.getByRole('button', { name: 'Unscheduled courses', exact: true })
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
  await disclosure.click()
  const selection = unscheduled.getByRole('button', { name: 'GEWS1011 LEC', exact: true })
  const card = selection.locator('..')

  await card.getByText('Lee Shau Kee Building LT5', { exact: true }).click()
  await expect(selection).toHaveAttribute('aria-pressed', 'true')
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
  await card.getByText('Lee Shau Kee Building LT5', { exact: true }).click()
  await expect(selection).toHaveAttribute('aria-pressed', 'false')
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
  await selection.click()
  await expect(selection).toHaveAttribute('aria-pressed', 'true')
  await selection.click()
  await expect(selection).toHaveAttribute('aria-pressed', 'false')
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true')

  // Click the expanded container's bottom-right padding, away from nested controls.
  const container = unscheduled.locator(':scope > div')
  const bounds = await container.boundingBox()
  expect(bounds).not.toBeNull()
  await container.click({ position: { x: bounds!.width - 8, y: bounds!.height - 8 } })
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
  await expect(selection).toHaveCount(0)
})

test('reports no conflict for sections that never share a date', async ({ page }) => {
  await openPlanner(page, '25/9')

  // Week of 7 September: the lecture alone, its column dated.
  await expect(cards(page)).toHaveCount(1)
  await expect(page.locator('span.tabular-nums', { hasText: '11/9' })).toBeVisible()
  await expect(conflictedSections(page)).toHaveCount(0)
  await expect(conflictZone(page)).toHaveCount(0)
})

test('reports a conflict for sections that share a date', async ({ page }) => {
  await openPlanner(page, '11/9')

  await expect(cards(page)).toHaveCount(2)
  await expect(conflictedSections(page).first()).toBeVisible()
  await expect(conflictZone(page).first()).toBeVisible()
})

// Pause real transitions before sampling so slow CI cannot miss the resizing.
async function watchGridResizing(page: Page) {
  return page.evaluateHandle(() => {
    const state = { started: 0 }
    document.addEventListener('transitionrun', (event) => {
      const target = event.target as HTMLElement
      if (!target.closest('.time-column, .day-column')) return
      if (!['top', 'height'].includes(event.propertyName)) return
      state.started++
      for (const animation of target.getAnimations()) {
        if (
          animation instanceof CSSTransition &&
          ['top', 'height'].includes(animation.transitionProperty)
        ) {
          animation.pause()
        }
      }
    })
    return state
  })
}

async function gridGeometry(page: Page, progress?: number) {
  return page.evaluate((progress) => {
    const hour = document.querySelector('.time-column > div > div')!
    const animations = Array.from(document.querySelectorAll('.time-column, .day-column'))
      .flatMap((column) => column.getAnimations({ subtree: true }))
      .filter(
        (animation) =>
          animation instanceof CSSTransition &&
          ['top', 'height'].includes(animation.transitionProperty)
      )

    if (progress !== undefined) {
      const resize = hour
        .getAnimations()
        .find(
          (animation) =>
            animation instanceof CSSTransition && animation.transitionProperty === 'height'
        )!
      const duration = Number(resize.effect!.getTiming().duration)
      for (const animation of animations) animation.currentTime = duration * progress
    }

    const bounds = (element: Element) => {
      const rect = element.getBoundingClientRect()
      return {
        top: rect.top - element.parentElement!.getBoundingClientRect().top,
        height: rect.height,
      }
    }
    return {
      hourHeight: hour.getBoundingClientRect().height,
      slots: Array.from(
        document.querySelectorAll(
          '.day-column > div > div:not([data-course-card]):not([data-conflict-zone])'
        )
      ).map((element) => element.getBoundingClientRect().height),
      cards: Array.from(document.querySelectorAll('[data-course-card]')).map(bounds),
      zone: bounds(document.querySelector('[data-conflict-zone]')!),
    }
  }, progress)
}

function expectGridAlignment(geometry: Awaited<ReturnType<typeof gridGeometry>>) {
  // The fixture meets 14:30–17:15 in a grid starting at 08:00.
  expect(geometry.slots.length).toBeGreaterThan(0)
  for (const height of geometry.slots)
    expect(Math.abs(height - geometry.hourHeight)).toBeLessThan(1)
  for (const card of geometry.cards) {
    expect(Math.abs(card.top - 6.5 * geometry.hourHeight)).toBeLessThan(1)
    expect(Math.abs(card.height - 2.75 * geometry.hourHeight)).toBeLessThan(1)
  }
  expect(Math.abs(geometry.zone.top - (6.5 * geometry.hourHeight - 4))).toBeLessThan(1)
  expect(Math.abs(geometry.zone.height - (2.75 * geometry.hourHeight + 8))).toBeLessThan(1)
}

test('keeps meetings and conflicts aligned with the grid throughout resizing', async ({ page }) => {
  await openPlanner(page, '11/9')
  await expect(cards(page)).toHaveCount(2)
  await expect(conflictZone(page)).toHaveCount(1)
  await watchGridResizing(page)
  let previous = await gridGeometry(page)
  expectGridAlignment(previous)

  for (const label of ['Title', 'Instructor', 'Instructor', 'Title']) {
    await page.getByRole('button', { name: label, exact: true }).click()
    const hour = page.locator('.time-column > div > div').first()
    await expect
      .poll(() =>
        hour.evaluate((element) =>
          element.getAnimations().some((animation) => animation.playState === 'paused')
        )
      )
      .toBe(true)

    const quarter = await gridGeometry(page, 0.25)
    const later = await gridGeometry(page, 0.75)
    expectGridAlignment(quarter)
    expectGridAlignment(later)
    expect(Math.abs(quarter.hourHeight - previous.hourHeight)).toBeGreaterThan(1)
    expect(Math.abs(later.hourHeight - quarter.hourHeight)).toBeGreaterThan(1)

    await page.evaluate(() => {
      for (const column of document.querySelectorAll('.time-column, .day-column')) {
        for (const animation of column.getAnimations({ subtree: true })) {
          if (animation instanceof CSSTransition) animation.finish()
        }
      }
    })
    previous = await gridGeometry(page)
    expectGridAlignment(previous)
    expect(Math.abs(previous.hourHeight - later.hourHeight)).toBeGreaterThan(0.1)
  }
})

test('resizes the timetable immediately with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openPlanner(page, '11/9')
  await expect(cards(page)).toHaveCount(2)
  await expect(conflictZone(page)).toHaveCount(1)
  const motion = await watchGridResizing(page)
  const before = await gridGeometry(page)

  await page.getByRole('button', { name: 'Title', exact: true }).click()
  await expect(cards(page).first().getByText('College Induction Course')).toBeVisible()
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  )

  expect(await motion.evaluate((state) => state.started)).toBe(0)
  const after = await gridGeometry(page)
  expect(after.hourHeight - before.hourHeight).toBeGreaterThan(1)
  expectGridAlignment(after)
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
