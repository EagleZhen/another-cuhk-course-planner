import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export async function mockCatalog(
  page: Page,
  fixtures: Readonly<Record<string, readonly unknown[]>> = {}
): Promise<void> {
  await page.route(/\/data\/[^/]+\/[^/]+\.json(?:\?.*)?$/, async (route) => {
    const [year, filename] = new URL(route.request().url()).pathname.split('/').slice(-2)
    const subject = filename.slice(0, -'.json'.length)
    const courses = fixtures[`${year}/${subject}`] ?? []

    await route.fulfill({
      json: {
        metadata: { schema_version: 3, subject, total_courses: courses.length },
        courses,
      },
    })
  })
}

export async function expectEmptyCatalogLoaded(page: Page): Promise<void> {
  const catalog = page.locator('[data-course-search]')
  await expect(
    catalog.getByRole('heading', { name: 'No courses available', exact: true })
  ).toBeVisible()
  // Failed loads also show the empty heading.
  await expect(catalog.getByRole('alert')).toHaveCount(0)
}
