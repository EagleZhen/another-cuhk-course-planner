import { expect, test } from '@playwright/test'

test('mounts native feedback links only while the menu is open', async ({ page }) => {
  await page.route('**/data/**', (route) => route.abort())
  await page.goto('/')
  // The failed fetches render after hydration, so server HTML alone cannot pass this check.
  await expect(page.getByText('failed to load due to a network error')).toBeVisible()

  const feedback = page.getByTitle('Share feedback about this course planner', { exact: true })
  const menu = feedback.locator('..')
  // CSS locators count hidden anchors too; visibility alone would not protect this boundary.
  const links = menu.locator('a')
  await expect(links).toHaveCount(0)

  await feedback.click()
  await expect(links).toHaveCount(3)
  const form = menu.getByRole('link', { name: 'Fill a Form', exact: true })
  const chat = menu.getByRole('link', { name: 'Have a Chat!', exact: true })
  const email = menu.getByRole('link', { name: 'Send an Email', exact: true })
  await expect(form).toHaveAttribute(
    'href',
    /^https:\/\/docs\.google\.com\/forms\/d\/e\/[^/]+\/viewform$/
  )
  await expect(chat).toHaveAttribute('href', /^https:\/\/wa\.me\/\d+\?text=.+$/)
  await expect(email).toHaveAttribute('href', /^mailto:[^?]+\?subject=.+&body=.+$/)
  for (const link of [form, chat]) {
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  }
  await expect(email).toHaveAttribute('target', '_self')
  for (const link of [form, chat, email]) {
    await expect(link).toBeVisible()
    await expect(link).not.toHaveAttribute('type', 'button')
  }

  await feedback.click()
  await expect(links).toHaveCount(0)
})
