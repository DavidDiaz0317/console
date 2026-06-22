import { expect, type Page, type TestInfo } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { safeJsonStringify } from '../../../harness/evidence/sanitizeEvidence'
import {
  assertDashboardContentVisible,
  assertNoSevereOverlap,
  assertNotBlank,
  assertNotStuckLoading,
  assertUrlIsNotAuth,
  firstVisibleLocator,
} from './visualLoginAssertions'

export type LiveSiteAuthMode = 'dev' | 'preauthenticated' | 'none'

export function normalizeBaseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  return value.replace(/\/+$/, '')
}

export function liveProductionUrl(): string | undefined {
  return normalizeBaseUrl(
    process.env.LIVE_PRODUCTION_CONSOLE_URL
    || process.env.LIVE_SITE_URL
    || process.env.CONSOLE_LIVE_URL,
  )
}

export function liveCanaryUrl(): string | undefined {
  const explicitCanary = normalizeBaseUrl(process.env.LIVE_CANARY_CONSOLE_URL)
  if (explicitCanary) return explicitCanary
  const selfHosted = normalizeBaseUrl(process.env.SELF_HOSTED_CONSOLE_URL)
  if (
    selfHosted
    && /console-live\.kubestellar\.io/i.test(selfHosted)
    && !process.env.LIVE_SITE_AUTH_MODE
    && !process.env.LIVE_CANARY_AUTH_MODE
  ) {
    return undefined
  }
  return normalizeBaseUrl(
    selfHosted
    || process.env.VISUAL_LOGIN_BASE_URL
    || process.env.PLAYWRIGHT_BASE_URL,
  )
}

export function liveCanaryAuthMode(baseUrl?: string): LiveSiteAuthMode {
  const rawValue = (process.env.LIVE_SITE_AUTH_MODE || process.env.LIVE_CANARY_AUTH_MODE || 'dev').toLowerCase()
  if (rawValue === 'preauth' || rawValue === 'preauthenticated' || rawValue === 'storage-state') return 'preauthenticated'
  if (rawValue === 'none' || rawValue === 'unauthenticated') return 'none'
  if (!process.env.LIVE_SITE_AUTH_MODE && !process.env.LIVE_CANARY_AUTH_MODE && baseUrl && /console-live\.kubestellar\.io/i.test(baseUrl)) {
    throw new Error('Authenticated live UI tests need LIVE_CANARY_CONSOLE_URL or LIVE_SITE_AUTH_MODE=preauthenticated. Do not run the dev-login path against production OAuth.')
  }
  return 'dev'
}

export async function establishLiveCanarySession(page: Page, baseUrl: string) {
  const mode = liveCanaryAuthMode(baseUrl)
  if (mode === 'none') return
  if (mode === 'preauthenticated') {
    await page.goto(new URL('/clusters', baseUrl).toString(), { waitUntil: 'domcontentloaded' })
    await expect(page.locator('body'), 'preauthenticated live canary session must render a page body').not.toHaveText('', {
      timeout: 15_000,
    })
    return
  }

  await page.goto(new URL('/auth/github', baseUrl).toString(), { waitUntil: 'domcontentloaded' })
  await page.waitForURL(url => !url.pathname.startsWith('/auth/callback'), { timeout: 15_000 }).catch(() => undefined)
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('kc-has-session')), {
      message: 'live canary dev login must establish a cookie-backed session marker',
      timeout: 20_000,
    })
    .toBe('true')
  await page.evaluate(() => {
    localStorage.setItem('kc-demo-mode', 'false')
    if (localStorage.getItem('token') === 'demo-token') {
      localStorage.removeItem('token')
    }
  })
}

export async function assertLiveDashboardShell(page: Page) {
  await assertUrlIsNotAuth(page)
  await assertNotBlank(page)
  await assertNotStuckLoading(page)
  await assertDashboardContentVisible(page)
  await expect(page.locator('[data-testid="login-page"]'), 'authenticated live UI must not show the login page').toHaveCount(0)
}

export async function assertLiveLayoutStable(page: Page) {
  const root = await page.evaluate(() => {
    const documentElement = document.documentElement
    const body = document.body
    return {
      scrollWidth: Math.max(documentElement.scrollWidth, body.scrollWidth),
      clientWidth: documentElement.clientWidth,
      blankCards: Array.from(document.querySelectorAll('[class*="card"], .glass, [data-card-id]')).filter((element) => {
        const rect = element.getBoundingClientRect()
        const text = (element.textContent || '').replace(/\s+/g, '').trim()
        return rect.width > 80 && rect.height > 40 && text.length === 0
      }).length,
      stuckLoaders: Array.from(document.querySelectorAll('[role="status"], .animate-spin')).filter((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      }).length,
    }
  })

  expect(root.scrollWidth, 'live UI must not create horizontal page overflow').toBeLessThanOrEqual(root.clientWidth + 2)
  expect(root.blankCards, 'live UI must not render blank card shells after data load').toBe(0)
  expect(root.stuckLoaders, 'live UI must not leave visible loading spinners after the settle window').toBeLessThanOrEqual(2)

  const repeatedCards = page.locator('[data-card-id], [data-testid*="card"], [data-testid*="tile"]')
  if (await repeatedCards.count().catch(() => 0) > 1) {
    await assertNoSevereOverlap(page, repeatedCards)
  }
}

export async function assertProductionOAuthBoundary(page: Page, baseUrl: string) {
  const health = await page.request.get(new URL('/health', baseUrl).toString()).catch(() => null)
  const healthz = health?.ok() ? health : await page.request.get(new URL('/healthz', baseUrl).toString()).catch(() => null)
  expect(healthz?.ok(), 'production live health endpoint must be reachable').toBeTruthy()

  const apiMe = await page.request.get(new URL('/api/me', baseUrl).toString(), { failOnStatusCode: false })
  expect(apiMe.status(), 'production live /api/me must require authentication').toBe(401)

  const oauth = await page.request.get(new URL('/auth/github', baseUrl).toString(), {
    failOnStatusCode: false,
    maxRedirects: 0,
  })
  expect([302, 303, 307, 308], 'production live /auth/github must redirect to OAuth').toContain(oauth.status())
  const location = oauth.headers().location || ''
  expect(location, 'production live OAuth redirect must target a GitHub-style authorize endpoint').toMatch(/\/login\/oauth\/authorize|github\.com/i)
}

export async function assertFixtureNamesVisible(page: Page, names: string[]) {
  for (const name of names) {
    const visible = await firstVisibleLocator(page, [
      page.getByText(name, { exact: false }),
      page.locator(`[aria-label*="${name}"]`),
    ])
    expect(visible, `live fixture ${name} should be visible in the authenticated UI`).not.toBeNull()
  }
}

export function writeLiveSiteReport(entry: Record<string, unknown>) {
  const outDir = path.resolve(process.cwd(), 'test-results/reports')
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'live-site.json')
  const existing = fs.existsSync(outPath)
    ? JSON.parse(fs.readFileSync(outPath, 'utf8')) as Array<Record<string, unknown>>
    : []
  existing.push({ timestamp: new Date().toISOString(), ...entry })
  fs.writeFileSync(outPath, safeJsonStringify(existing))
}

export function annotateLiveInvariant(testInfo: TestInfo, id: string) {
  testInfo.annotations.push({ type: 'invariant', description: id })
}
