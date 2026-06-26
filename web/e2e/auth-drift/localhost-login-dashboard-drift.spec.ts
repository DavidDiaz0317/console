import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

const LOCAL_CONSOLE_URL = process.env.AUTH_DRIFT_LOCAL_CONSOLE_URL || 'http://127.0.0.1:4176'
const LOCAL_BACKEND_URL = process.env.AUTH_DRIFT_LOCAL_BACKEND_URL || 'http://127.0.0.1:8081'
const PAGE_SETTLE_TIMEOUT_MS = 30_000
const LOGIN_FLOW_TIMEOUT_MS = 45_000

type HealthResponse = {
  status?: string
  oauth_configured?: boolean
}

function consoleUrl(path = '/'): string {
  return new URL(path, LOCAL_CONSOLE_URL).toString()
}

function backendUrl(path = '/'): string {
  return new URL(path, LOCAL_BACKEND_URL).toString()
}

function expectNoTokenLeak(url: string): void {
  expect(url).not.toMatch(/[?&](?:token|access_token|id_token|refresh_token)=/i)
  expect(url).not.toMatch(/#.*(?:token|access_token|id_token|refresh_token)=/i)
}

async function getBackendHealth(request: APIRequestContext): Promise<HealthResponse | null> {
  const response = await request.get(backendUrl('/health'), { timeout: 10_000 }).catch(() => null)
  if (!response?.ok()) return null
  return response.json().catch(() => null)
}

async function mockBrowserHealthAsOAuthConfigured(page: Page): Promise<void> {
  await page.route('**/health', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname !== '/health') return route.fallback()

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        version: 'auth-drift-localhost',
        oauth_configured: true,
        in_cluster: false,
        no_local_agent: true,
        install_method: 'auth-drift-localhost',
      }),
    })
  })
}

test.describe('Localhost auth drift', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('localhost console requires login and reaches dashboard after GitHub entry point', async ({
    page,
    request,
  }) => {
    const health = await getBackendHealth(request)
    test.skip(
      health?.status !== 'ok',
      `Local backend is not reachable at ${LOCAL_BACKEND_URL}; start the dev-mode backend before running this spec.`
    )

    await mockBrowserHealthAsOAuthConfigured(page)

    await page.goto(consoleUrl('/'))
    await page.waitForLoadState('domcontentloaded')

    await expect(page).toHaveURL(/\/login(?:[?#]|$)/, {
      timeout: PAGE_SETTLE_TIMEOUT_MS,
    })
    await expect(page.getByTestId('login-page')).toBeVisible({
      timeout: PAGE_SETTLE_TIMEOUT_MS,
    })

    const loginButton = page.getByTestId('github-login-button')
    await expect(loginButton).toBeVisible()
    await expect(loginButton).toBeEnabled()
    await expect(loginButton).toContainText(/Continue with GitHub/i)
    await expect(page.getByTestId('oauth-setup-notice')).toHaveCount(0)
    await expect(page.getByTestId('demo-mode-button')).toHaveCount(0)

    await loginButton.click()

    await expect(page.getByTestId('dashboard-page')).toBeVisible({
      timeout: LOGIN_FLOW_TIMEOUT_MS,
    })

    const finalUrl = page.url()
    expect(finalUrl).toBe(consoleUrl('/'))
    expectNoTokenLeak(finalUrl)

    await expect(page.getByTestId('login-page')).toHaveCount(0)
    await expect(page.getByTestId('github-login-button')).toHaveCount(0)

    const hasSession = await page.evaluate(() => localStorage.getItem('kc-has-session'))
    expect(hasSession).toBe('true')

    const cookies = await page.context().cookies(LOCAL_CONSOLE_URL)
    const authCookie = cookies.find((cookie) => cookie.name === 'kc_auth')
    expect(authCookie).toBeDefined()
    expect(authCookie?.httpOnly).toBe(true)
  })
})
