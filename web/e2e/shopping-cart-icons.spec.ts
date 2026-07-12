import { test, expect } from '@playwright/test'

// Isolated repro of the ShoppingCart header row markup/classes (see
// src/components/ShoppingCart.tsx), independent of live course-catalog
// validation, to compare Chromium vs WebKit rendering of the same CSS.
test('shopping cart eye/trash icon alignment', async ({ page }) => {
  await page.goto('/')
  const cssHref = await page.locator('link[rel="stylesheet"]').first().getAttribute('href')

  await page.setContent(`
    <html>
      <head>
        <link rel="stylesheet" href="${cssHref}">
      </head>
      <body style="padding: 16px; background: #f3f4f6;">
        <div class="border rounded p-2 relative group space-y-2 border-l-4 border-gray-200 bg-white" style="width: 280px; border-left-color: #3b82f6;">
          <div class="flex h-5 items-stretch justify-between gap-1">
            <div class="flex min-w-0 flex-1 items-stretch gap-1">
              <span class="flex h-full shrink-0 items-center text-sm font-semibold leading-5">ACCT1111A</span>
              <button class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all shrink-0 outline-none size-5 p-0 cursor-pointer hover:bg-accent" title="View course details">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3.5 text-gray-400"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
              </button>
              <span class="flex h-full shrink-0 items-center text-xs font-medium leading-5 text-gray-500">3 credits</span>
            </div>
            <div class="flex shrink-0 items-stretch gap-1">
              <button class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all shrink-0 outline-none size-5 p-0 cursor-pointer hover:bg-accent" title="Hide course">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3.5 text-gray-600"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path><circle cx="12" cy="12" r="3"></circle></svg>
              </button>
              <button class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all shrink-0 outline-none size-5 p-0 text-red-500 hover:bg-red-50 cursor-pointer" title="Remove course">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  `)

  const card = page.locator('div.border-l-4')
  await expect(card).toBeVisible()
  await card.screenshot({ path: `test-results/cart-card-${test.info().project.name}.png` })
})
