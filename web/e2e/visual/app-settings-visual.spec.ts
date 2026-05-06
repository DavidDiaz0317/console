import { test, expect, type Page } from '@playwright/test'
import { setupDemoMode } from '../helpers/setup'

const SETTINGS_VIEWPORT = { width: 1280, height: 720 }
const ROOT_VISIBLE_TIMEOUT_MS = 15_000
const MODAL_VISIBLE_TIMEOUT_MS = 10_000

async function navigateToSettings(page: Page) {
  await setupDemoMode(page)
  await page.goto('/settings')
  await page.waitForLoadState('domcontentloaded')
  await page.getByTestId('sidebar').waitFor({ state: 'visible', timeout: ROOT_VISIBLE_TIMEOUT_MS })
}

test.describe('Settings feedback modal — laptop', () => {
  test.use({ viewport: SETTINGS_VIEWPORT })

  test('bug report option stays visible at default zoom', async ({ page }) => {
    await navigateToSettings(page)

    await page.getByTestId('navbar-profile-btn').click()
    await page.getByRole('button', { name: /^feedback/i }).click()

    const bugReportButton = page.getByRole('button', { name: /bug report/i }).first()
    await bugReportButton.waitFor({ state: 'visible', timeout: MODAL_VISIBLE_TIMEOUT_MS })
    await expect(bugReportButton).toBeVisible()

    await expect(page).toHaveScreenshot('app-settings-feedback-modal-laptop-1280.png', {
      fullPage: false,
    })
  })
})
