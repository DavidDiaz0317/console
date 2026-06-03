import { test, expect, type APIRequestContext } from '@playwright/test'

const FAKE_OAUTH_CONSOLE_URL = process.env.AUTH_DRIFT_FAKE_OAUTH_CONSOLE_URL || 'http://127.0.0.1:4177'
const FAKE_OAUTH_BACKEND_URL = process.env.AUTH_DRIFT_FAKE_OAUTH_BACKEND_URL || 'http://127.0.0.1:8082'
const PAGE_SETTLE_TIMEOUT_MS = 30_000
const LOGIN_FLOW_TIMEOUT_MS = 60_000

type HealthResponse = {
  status?: string
  oauth_configured?: boolean
}

type CurrentUserResponse = {
  id?: string
  github_id?: string
  github_login?: string
  email?: string
  avatar_url?: string
  role?: string
  onboarded?: boolean
}

function consoleUrl(path = '/'): string {
  return new URL(path, FAKE_OAUTH_CONSOLE_URL).toString()
}

function backendUrl(path = '/'): string {
  return new URL(path, FAKE_OAUTH_BACKEND_URL).toString()
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

test.describe('Fake OAuth auth drift', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('localhost console completes full fake OAuth flow and reaches dashboard', async ({
    page,
    request,
  }) => {
    const health = await getBackendHealth(request)
    test.skip(
      health?.status !== 'ok' || health.oauth_configured !== true,
      `Fake OAuth backend is not reachable or OAuth-configured at ${FAKE_OAUTH_BACKEND_URL}.`
    )

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

    const cookies = await page.context().cookies(FAKE_OAUTH_CONSOLE_URL)
    const authCookie = cookies.find((cookie) => cookie.name === 'kc_auth')
    const clientAuthCookie = cookies.find((cookie) => cookie.name === 'kc_ux_ctx')
    expect(authCookie).toBeDefined()
    expect(authCookie?.httpOnly).toBe(true)
    expect(clientAuthCookie).toBeDefined()
    expect(clientAuthCookie?.httpOnly).toBe(true)

    const currentUser = await page.evaluate(async () => {
      const response = await fetch('/api/me', {
        credentials: 'same-origin',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      })
      return {
        ok: response.ok,
        status: response.status,
        body: await response.json().catch(() => null),
      }
    }) as { ok: boolean; status: number; body: CurrentUserResponse | null }

    expect(currentUser.ok, `/api/me returned ${currentUser.status}`).toBe(true)
    expect(currentUser.body?.github_id).toBe('424242')
    expect(currentUser.body?.github_login).toBe('auth-drift-octocat')
    expect(currentUser.body?.email).toBe('auth-drift-octocat@example.com')
    expect(currentUser.body?.onboarded).toBe(true)
    expect(currentUser.body?.role).toBe('admin')
  })
})
