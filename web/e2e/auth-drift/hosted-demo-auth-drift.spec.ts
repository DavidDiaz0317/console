import { test, expect, type Page } from '@playwright/test'

const HOSTED_DEMO_URL = process.env.AUTH_DRIFT_DEMO_URL || 'https://console.kubestellar.io'
const PAGE_SETTLE_TIMEOUT_MS = 30_000

function absoluteUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString()
}

async function waitForDashboardWithoutLogin(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded')

  await expect(page.getByTestId('dashboard-page')).toBeVisible({
    timeout: PAGE_SETTLE_TIMEOUT_MS,
  })
  await expect(page.getByTestId('navbar-agent-status-btn')).toBeVisible({
    timeout: PAGE_SETTLE_TIMEOUT_MS,
  })

  await expect(page).not.toHaveURL(/\/login(?:[?#]|$)|\/auth\/github/)
  await expect(page.getByTestId('login-page')).toHaveCount(0)
  await expect(page.getByTestId('github-login-button')).toHaveCount(0)
  await expect(page.getByTestId('github-setup-button')).toHaveCount(0)
  await expect(page.getByTestId('demo-mode-button')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Continue with GitHub/i })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Sign in to GitHub/i })).toHaveCount(0)
}

test.describe('Hosted demo auth drift', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('root route renders demo dashboard without any login workflow', async ({ page }) => {
    await page.goto(HOSTED_DEMO_URL)
    await waitForDashboardWithoutLogin(page)
  })

  test('direct /login route auto-enters demo mode instead of exposing auth UI', async ({ page }) => {
    await page.goto(absoluteUrl(HOSTED_DEMO_URL, '/login'))
    await waitForDashboardWithoutLogin(page)
  })
})
