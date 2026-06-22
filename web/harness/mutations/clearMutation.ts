import type { Page } from '@playwright/test'

export async function clearMutation(page: Page) {
  await page.unrouteAll({ behavior: 'ignoreErrors' })
}
