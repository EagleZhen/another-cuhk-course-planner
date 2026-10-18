import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockCatalog } from './catalog'
import type { CatalogFixtures } from './catalog'

export async function selectTerm(page: Page, fullTerm: string): Promise<void> {
  const search = page.locator('[data-course-search]')
  await expect(search).toBeVisible()

  const year = fullTerm.split(' ')[0]
  const yearSelector = search.getByTitle('Click to change academic year', { exact: true })
  const hasYearSelector = (await yearSelector.count()) > 0
  if (hasYearSelector) {
    if ((await yearSelector.innerText()).trim() !== year) {
      await yearSelector.click()
      await search.getByRole('button', { name: year, exact: true }).click()
    }
    await expect(yearSelector).toHaveText(year)
  }

  const label = hasYearSelector ? fullTerm.slice(year.length).trim() : fullTerm
  const termSelector = search.getByTitle('Click to change term', { exact: true })
  if ((await termSelector.innerText()).trim() !== label) {
    await termSelector.click()
    await search.getByRole('button', { name: label, exact: true }).click()
  }
  await expect(termSelector).toHaveText(label)
}

export async function openPlannerAtTerm(
  page: Page,
  { term, catalog = {} }: { term: string; catalog?: CatalogFixtures }
): Promise<void> {
  // A populated default catalog could synchronize its cart before term selection.
  const { promise, resolve: release } = Promise.withResolvers<void>()
  const removeCatalog = await mockCatalog(page, catalog, promise)
  try {
    await page.goto('/')
    await selectTerm(page, term)
  } catch (error) {
    await removeCatalog()
    throw error
  } finally {
    release()
  }
}
