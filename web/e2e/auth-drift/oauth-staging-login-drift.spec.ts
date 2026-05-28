import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { test, expect, type APIRequestContext, type Page, type TestInfo } from '@playwright/test'

const OAUTH_LOGIN_URL = process.env.AUTH_DRIFT_LOGIN_URL || 'http://127.0.0.1:4176/login'
const USE_EXTERNAL_OAUTH_TARGET = !!process.env.AUTH_DRIFT_LOGIN_URL
const PAGE_SETTLE_TIMEOUT_MS = 30_000
const OAUTH_NAV_TIMEOUT_MS = 15_000
const MOBILE_VIEWPORT = { width: 390, height: 844 } as const
const SELF_TEST_MODE = process.env.AUTH_DRIFT_SELF_TEST_MODE || ''
const SELF_TEST_ARTIFACT_DIR = process.env.AUTH_DRIFT_SELF_TEST_ARTIFACT_DIR || ''
const SELF_TEST_SCENARIO = process.env.AUTH_DRIFT_SELF_TEST_SCENARIO || 'manual'

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

function sanitizeFileSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'artifact'
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

async function applySelfTestMutation(page: Page): Promise<void> {
  if (!SELF_TEST_MODE) return

  if (USE_EXTERNAL_OAUTH_TARGET) {
    throw new Error('AUTH_DRIFT_SELF_TEST_MODE is only supported against the managed local OAuth preview.')
  }

  switch (SELF_TEST_MODE) {
    case 'missing-github-button':
      await page.addStyleTag({
        content: '[data-testid="github-login-button"] { display: none !important; }',
      })
      break
    case 'disabled-github-button':
      await page.getByTestId('github-login-button').evaluate((button) => {
        const loginButton = button as HTMLButtonElement
        loginButton.disabled = true
      })
      break
    case 'renamed-github-button':
      await page.getByTestId('github-login-button').evaluate((button) => {
        button.textContent = 'Sign in'
      })
      break
    case 'brand-heading-changed':
      await page.getByRole('heading', { name: /KubeStellar/i }).evaluate((heading) => {
        heading.textContent = 'Cluster Console'
      })
      break
    case 'visual-card-drift':
      await page.addStyleTag({
        content: `
          [data-testid="github-login-button"] {
            background: rgb(127 29 29) !important;
            transform: translateY(8px);
          }
        `,
      })
      break
    case 'mobile-card-overflow':
      await page.addStyleTag({
        content: `
          [data-testid="login-page"] .glass {
            max-width: none !important;
            min-width: 760px !important;
            width: 760px !important;
          }
        `,
      })
      break
    case 'setup-fallback-visible':
      await page.getByTestId('login-page').evaluate((root) => {
        const notice = document.createElement('div')
        notice.setAttribute('data-testid', 'oauth-setup-notice')
        notice.textContent = 'OAuth setup fallback is visible'
        root.prepend(notice)
      })
      break
    default:
      throw new Error(`Unknown AUTH_DRIFT_SELF_TEST_MODE: ${SELF_TEST_MODE}`)
  }
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
  await applySelfTestMutation(page)
}

async function captureSelfTestScreenshot(page: Page, testInfo: TestInfo): Promise<void> {
  if (!SELF_TEST_ARTIFACT_DIR || !page.url()) return

  const scenario = sanitizeFileSegment(SELF_TEST_SCENARIO)
  const testName = sanitizeFileSegment(testInfo.title)
  const status = sanitizeFileSegment(testInfo.status || 'unknown')
  const screenshotDir = path.join(SELF_TEST_ARTIFACT_DIR, 'screenshots', scenario)
  const screenshotPath = path.join(screenshotDir, `${testName}-${status}.png`)

  await mkdir(screenshotDir, { recursive: true })

  const loginCard = page.locator('[data-testid="login-page"] .glass')
  if (await loginCard.count()) {
    await loginCard.screenshot({ path: screenshotPath }).catch(async () => {
      await page.screenshot({ path: screenshotPath, fullPage: false })
    })
  } else {
    await page.screenshot({ path: screenshotPath, fullPage: false })
  }

  await testInfo.attach('auth drift self-test screenshot', {
    path: screenshotPath,
    contentType: 'image/png',
  })
}

test.describe('OAuth staging login UI drift', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  if (SELF_TEST_ARTIFACT_DIR) {
    test.afterEach(async ({ page }, testInfo) => {
      await captureSelfTestScreenshot(page, testInfo)
    })
  }

  test('OAuth staging login page renders stable GitHub login UI', async ({ page, request }) => {
    await openOAuthLoginPage(page, request)

    await expect(page).toHaveTitle(/KubeStellar Console/i)
    await expect(page.getByRole('heading', { name: /^KubeStellar$/i })).toBeVisible()

    const loginButton = page.getByTestId('github-login-button')
    await expect(loginButton).toBeVisible()
    await expect(loginButton).toBeEnabled()
    await expect(loginButton).toContainText(/Continue with GitHub/i)

    await expect(page.getByTestId('oauth-setup-notice')).toHaveCount(0)
    await expect(page.getByTestId('github-setup-button')).toHaveCount(0)
    await expect(page.getByTestId('demo-mode-button')).toHaveCount(0)
    await expect(page.getByText('Hosted demo', { exact: true })).toHaveCount(0)
    await expect(page.getByText(/Real GitHub sign-in is not available on the hosted demo/i)).toHaveCount(0)

    const loginCard = page.locator('[data-testid="login-page"] .glass')
    await expect(loginCard).toHaveScreenshot('oauth-login-card.png')
  })

  test('OAuth staging login card fits mobile viewport', async ({ page, request }) => {
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

    await expect(loginCard).toHaveScreenshot('oauth-login-card-mobile.png')
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
