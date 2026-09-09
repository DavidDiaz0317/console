import { test, expect, type APIRequestContext, type Page, type TestInfo } from '@playwright/test'

const OAUTH_LOGIN_URL = process.env.AUTH_DRIFT_LOGIN_URL || 'http://127.0.0.1:4176/login'
const USE_EXTERNAL_OAUTH_TARGET = !!process.env.AUTH_DRIFT_LOGIN_URL
const PAGE_SETTLE_TIMEOUT_MS = 30_000
const OAUTH_NAV_TIMEOUT_MS = 15_000
const MOBILE_VIEWPORT = { width: 390, height: 844 } as const

type HealthResponse = {
  oauth_configured?: boolean
}

function urlFor(path: string): string {
  return new URL(path, OAUTH_LOGIN_URL).toString()
}

function isGitHubAuthorizeUrl(url: URL): boolean {
  return url.pathname.endsWith('/login/oauth/authorize')
}

function expectNoTokenLeak(url: string): void {
  expect(url).not.toMatch(/[?&](?:token|access_token|id_token|refresh_token)=/i)
  expect(url).not.toMatch(/#.*(?:token|access_token|id_token|refresh_token)=/i)
}

async function getHealth(request: APIRequestContext): Promise<HealthResponse | null> {
  const response = await request.get(urlFor('/health'), { timeout: 10_000 }).catch(() => null)
  if (!response?.ok()) return null
  return response.json().catch(() => null)
}

async function skipUnlessOAuthConfigured(request: APIRequestContext): Promise<void> {
  if (!USE_EXTERNAL_OAUTH_TARGET) return

  const health = await getHealth(request)
  test.skip(
    health?.oauth_configured !== true,
    'Set AUTH_DRIFT_LOGIN_URL to an OAuth-configured console login URL.'
  )
}

async function mockLocalOAuthConfiguredLogin(page: Page): Promise<void> {
  if (USE_EXTERNAL_OAUTH_TARGET) return

  await page.route('**/health', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname !== '/health') return route.fallback()

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        version: 'auth-drift-local',
        oauth_configured: true,
        in_cluster: false,
        no_local_agent: true,
        install_method: 'auth-drift-local',
      }),
    })
  })

  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'unauthenticated' }),
    })
  )

  await page.route('**/api/agent/token', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'unauthenticated' }),
    })
  )

  await page.route('**/api/mcp/**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'agent unavailable in auth drift test' }),
    })
  )

  await page.route('**/api/public/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  )
}

async function waitForLoginAssets(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined)

  const logo = page.getByAltText(/KubeStellar logo/i)
  await expect(logo).toBeVisible()
  await logo.evaluate((node) => new Promise<void>((resolve, reject) => {
    const img = node as HTMLImageElement
    if (img.complete && img.naturalWidth > 0) {
      resolve()
      return
    }

    const timeout = window.setTimeout(() => {
      reject(new Error(`Logo image did not load: ${img.currentSrc || img.src}`))
    }, 5_000)

    img.addEventListener('load', () => {
      window.clearTimeout(timeout)
      resolve()
    }, { once: true })

    img.addEventListener('error', () => {
      window.clearTimeout(timeout)
      reject(new Error(`Logo image failed to load: ${img.currentSrc || img.src}`))
    }, { once: true })
  }))
}

async function openOAuthLoginPage(page: Page, request: APIRequestContext): Promise<void> {
  await skipUnlessOAuthConfigured(request)
  await mockLocalOAuthConfiguredLogin(page)
  await page.goto(OAUTH_LOGIN_URL)
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByTestId('login-page')).toBeVisible({
    timeout: PAGE_SETTLE_TIMEOUT_MS,
  })
  await waitForLoginAssets(page)
}

async function attachLoginCardScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const loginCard = page.locator('[data-testid="login-page"] .glass')
  await testInfo.attach(name, {
    body: await loginCard.screenshot(),
    contentType: 'image/png',
  })
}

async function expectOAuthLoginCardContract(page: Page): Promise<void> {
  const loginCard = page.locator('[data-testid="login-page"] .glass')
  const logo = page.getByAltText(/KubeStellar logo/i)
  const loginButton = page.getByTestId('github-login-button')
  const welcomeHeading = page.getByTestId('login-welcome-heading')

  await expect(loginCard).toBeVisible()
  await expect(logo).toBeVisible()
  await expect(welcomeHeading).toBeVisible()
  await expect(loginButton).toBeVisible()
  await expect(loginButton).toBeEnabled()
  await expect(loginButton).toContainText(/Continue with GitHub/i)

  await expect(page.getByTestId('oauth-setup-notice')).toHaveCount(0)
  await expect(page.getByTestId('github-setup-button')).toHaveCount(0)
  await expect(page.getByTestId('demo-mode-button')).toHaveCount(0)
  await expect(page.getByText('Hosted demo', { exact: true })).toHaveCount(0)
  await expect(page.getByText(/Real GitHub sign-in is not available on the hosted demo/i)).toHaveCount(0)
  await expect(page.getByText(/By signing in, you agree to our/i)).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Terms of Service/i })).toHaveCount(0)

  const cardBox = await loginCard.boundingBox()
  const logoBox = await logo.boundingBox()
  const headingBox = await welcomeHeading.boundingBox()
  const buttonBox = await loginButton.boundingBox()

  expect(cardBox).not.toBeNull()
  expect(logoBox).not.toBeNull()
  expect(headingBox).not.toBeNull()
  expect(buttonBox).not.toBeNull()

  expect(logoBox!.y).toBeGreaterThanOrEqual(cardBox!.y)
  expect(headingBox!.y).toBeGreaterThan(logoBox!.y)
  expect(buttonBox!.y).toBeGreaterThan(headingBox!.y)
  expect(buttonBox!.x).toBeGreaterThanOrEqual(cardBox!.x)
  expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width)
}

test.describe('OAuth staging login UI drift', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('OAuth staging login page renders stable GitHub login UI', async ({ page, request }, testInfo) => {
    await openOAuthLoginPage(page, request)

    await expect(page).toHaveTitle(/KubeStellar Console/i)
    await expect(page.getByRole('heading', { name: /^KubeStellar$/i })).toBeVisible()

    await expectOAuthLoginCardContract(page)
    await attachLoginCardScreenshot(page, testInfo, 'oauth-login-card-current')
  })

  test('OAuth staging login card fits mobile viewport', async ({ page, request }, testInfo) => {
    await page.setViewportSize(MOBILE_VIEWPORT)
    await openOAuthLoginPage(page, request)

    const loginButton = page.getByTestId('github-login-button')
    const loginCard = page.locator('[data-testid="login-page"] .glass')

    await expect(loginButton).toBeVisible()
    await expect(loginButton).toBeEnabled()

    const box = await loginCard.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width)
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y + box!.height).toBeLessThanOrEqual(MOBILE_VIEWPORT.height)

    await expectOAuthLoginCardContract(page)
    await attachLoginCardScreenshot(page, testInfo, 'oauth-login-card-mobile-current')
  })

  test('OAuth staging login button points at backend auth route', async ({ page, request }) => {
    await openOAuthLoginPage(page, request)

    const authRouteUrl = urlFor('/auth/github')
    await page.route(authRouteUrl, (route) => route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>OAuth route reached</title>',
    }))

    await Promise.all([
      page.waitForURL((url) => {
        return url.pathname === '/auth/github'
      }, { timeout: OAUTH_NAV_TIMEOUT_MS }),
      page.getByTestId('github-login-button').click(),
    ])

    const currentUrl = page.url()
    const parsed = new URL(currentUrl)
    expect(parsed.pathname).toBe('/auth/github')
    expectNoTokenLeak(currentUrl)
  })

  test('OAuth backend authorize redirect contract is stable', async ({ request }) => {
    test.skip(
      !USE_EXTERNAL_OAUTH_TARGET,
      'Backend redirect contract requires AUTH_DRIFT_LOGIN_URL to point at an OAuth-enabled backend.'
    )
    await skipUnlessOAuthConfigured(request)

    const response = await request.get(urlFor('/auth/github'), {
      maxRedirects: 0,
      timeout: 10_000,
    })

    expect([302, 303, 307, 308]).toContain(response.status())

    const location = response.headers().location
    expect(location).toBeDefined()
    expectNoTokenLeak(location!)

    const authorizeUrl = new URL(location!)
    expect(isGitHubAuthorizeUrl(authorizeUrl)).toBe(true)
    expect(authorizeUrl.searchParams.get('client_id')).toBeTruthy()
    expect(authorizeUrl.searchParams.get('state')).toBeTruthy()
    expect(authorizeUrl.searchParams.get('scope')).toBe('user:email')

    const redirectUri = authorizeUrl.searchParams.get('redirect_uri')
    expect(redirectUri).toBeTruthy()
    expect(redirectUri).toMatch(/\/auth\/github\/callback$/)
    expectNoTokenLeak(redirectUri!)
  })
})
