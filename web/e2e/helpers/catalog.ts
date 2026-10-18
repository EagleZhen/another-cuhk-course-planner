import { expect } from '@playwright/test'
import type { Page, Route } from '@playwright/test'

export type CatalogFixtures = Readonly<Record<string, readonly unknown[]>>

export async function mockCatalog(
  page: Page,
  fixtures: CatalogFixtures = {},
  respondAfter: Promise<void> = Promise.resolve()
): Promise<() => Promise<void>> {
  const pattern = /\/data\/[^/]+\/[^/]+\.json(?:\?.*)?$/
  const respond = async (route: Route) => {
    await respondAfter
    const [year, filename] = new URL(route.request().url()).pathname.split('/').slice(-2)
    const subject = filename.slice(0, -'.json'.length)
    const courses = fixtures[`${year}/${subject}`] ?? []

    await route.fulfill({
      json: {
        metadata: { schema_version: 3, subject, total_courses: courses.length },
        courses,
      },
    })
  }
  await page.route(pattern, respond)
  return () => page.unroute(pattern, respond)
}

export async function expectEmptyCatalogLoaded(page: Page): Promise<void> {
  const catalog = page.locator('[data-course-search]')
  await expect(
    catalog.getByRole('heading', { name: 'No courses available', exact: true })
  ).toBeVisible()
  // Failed loads also show the empty heading.
  await expect(catalog.getByRole('alert')).toHaveCount(0)
}
