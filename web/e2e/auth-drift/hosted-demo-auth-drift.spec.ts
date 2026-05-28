import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { test, expect, type Page, type TestInfo } from '@playwright/test'

const HOSTED_DEMO_URL = process.env.AUTH_DRIFT_DEMO_URL || 'https://console.kubestellar.io'
const SELF_TEST_ARTIFACT_DIR = process.env.AUTH_DRIFT_SELF_TEST_ARTIFACT_DIR || ''
const SELF_TEST_SCENARIO = process.env.AUTH_DRIFT_SELF_TEST_SCENARIO || 'manual'
const HOSTED_SELF_TEST_MODE = process.env.AUTH_DRIFT_HOSTED_SELF_TEST_MODE || ''
const PAGE_SETTLE_TIMEOUT_MS = SELF_TEST_ARTIFACT_DIR ? 5_000 : 30_000

function absoluteUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString()
}

function sanitizeFileSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'artifact'
}

async function mockHostedLoginRegression(page: Page): Promise<void> {
  if (HOSTED_SELF_TEST_MODE !== 'login-present') return

  await page.route('**/*', (route) => {
    const request = route.request()
    if (request.resourceType() !== 'document') return route.fallback()

    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!doctype html>
        <html lang="en">
          <head>
            <title>KubeStellar Console - Login Regression</title>
            <style>
              body {
                align-items: center;
                background: #0f172a;
                color: #f8fafc;
                display: flex;
                font-family: system-ui, sans-serif;
                height: 100vh;
                justify-content: center;
                margin: 0;
              }
              [data-testid="login-page"] {
                background: #111827;
                border: 1px solid #334155;
                border-radius: 16px;
                padding: 32px;
                text-align: center;
                width: 360px;
              }
              button {
                background: #ffffff;
                border: 0;
                border-radius: 8px;
                color: #111827;
                font-weight: 700;
                margin-top: 24px;
                padding: 12px 18px;
                width: 100%;
              }
            </style>
          </head>
          <body>
            <main data-testid="login-page">
              <h1>KubeStellar Console</h1>
              <p>Unexpected login page on the public demo.</p>
              <button data-testid="github-login-button">Continue with GitHub</button>
            </main>
          </body>
        </html>`,
    })
  })
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

async function captureSelfTestScreenshot(page: Page, testInfo: TestInfo): Promise<void> {
  if (!SELF_TEST_ARTIFACT_DIR || !page.url()) return

  const scenario = sanitizeFileSegment(SELF_TEST_SCENARIO)
  const testName = sanitizeFileSegment(testInfo.title)
  const status = sanitizeFileSegment(testInfo.status || 'unknown')
  const screenshotDir = path.join(SELF_TEST_ARTIFACT_DIR, 'screenshots', scenario)
  const screenshotPath = path.join(screenshotDir, `${testName}-${status}.png`)

  await mkdir(screenshotDir, { recursive: true })
  await page.screenshot({ path: screenshotPath, fullPage: false })
  await testInfo.attach('auth drift hosted self-test screenshot', {
    path: screenshotPath,
    contentType: 'image/png',
  })
}

test.describe('Hosted demo auth drift', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  if (SELF_TEST_ARTIFACT_DIR) {
    test.afterEach(async ({ page }, testInfo) => {
      await captureSelfTestScreenshot(page, testInfo)
    })
  }

  test('root route renders demo dashboard without any login workflow', async ({ page }) => {
    await mockHostedLoginRegression(page)
    await page.goto(HOSTED_DEMO_URL)
    await waitForDashboardWithoutLogin(page)

    await expect(page).toHaveScreenshot('hosted-demo-dashboard-no-login.png', {
      fullPage: false,
      mask: [
        page.getByTestId('dashboard-cards-grid'),
      ],
    })
  })

  test('direct /login route auto-enters demo mode instead of exposing auth UI', async ({ page }) => {
    await mockHostedLoginRegression(page)
    await page.goto(absoluteUrl(HOSTED_DEMO_URL, '/login'))
    await waitForDashboardWithoutLogin(page)
  })
})
