import { expect, type Page, type TestInfo } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { safeJsonStringify } from '../../../harness/evidence/sanitizeEvidence'
import type { EvidenceCollectors, LiveUiFailureEvidence } from '../../../harness/evidence/evidenceTypes'
import {
  assertDashboardContentVisible,
  assertNoSevereOverlap,
  assertNotBlank,
  assertNotStuckLoading,
  assertUrlIsNotAuth,
  firstVisibleLocator,
} from './visualLoginAssertions'

export type LiveSiteAuthMode = 'dev' | 'preauthenticated' | 'none'

const LIVE_CANARY_TEST_USER = {
  id: 'live-canary-ui',
  github_id: 'live-canary-ui',
  github_login: 'live-canary-ui',
  email: 'live-canary-ui@example.invalid',
  avatar_url: 'https://api.dicebear.com/9.x/identicon/svg?seed=live-canary-ui',
  role: 'admin',
  onboarded: true,
} as const

const LIVE_NAVIGATION_ATTEMPTS = 3
const TEXT_COLLISION_RATIO_LIMIT = 0.30

const forbiddenLiveUiPatterns = [
  { label: 'demo mode control', source: String.raw`\bDemo Mode\b`, flags: 'i' },
  { label: 'connection log drawer', source: String.raw`\bConnection Log\b`, flags: 'i' },
  { label: 'local agent refresh warning', source: String.raw`Refreshing local agent`, flags: 'i' },
  { label: 'endpoint error summary', source: String.raw`endpoint errors?`, flags: 'i' },
  { label: 'AI prediction load failure', source: String.raw`/predictions/ai\s*-\s*Load failed`, flags: 'i' },
  { label: 'widget install prompt', source: String.raw`\bInstall widget\b`, flags: 'i' },
]

async function recordLiveUiFailures(page: Page, failures: LiveUiFailureEvidence) {
  await page.evaluate((nextFailures) => {
    const target = window as unknown as { __KC_LIVE_UI_FAILURES__?: LiveUiFailureEvidence }
    target.__KC_LIVE_UI_FAILURES__ = {
      ...(target.__KC_LIVE_UI_FAILURES__ || {}),
      ...nextFailures,
    }
  }, failures).catch(() => undefined)
}

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

async function seedPreauthenticatedLiveCanarySession(page: Page) {
  await page.route('**/api/me', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(LIVE_CANARY_TEST_USER),
    })
  )
  await page.addInitScript((user) => {
    localStorage.setItem('kc-has-session', 'true')
    localStorage.setItem('kc-demo-mode', 'false')
    localStorage.setItem('token', 'live-canary-test-token')
    localStorage.setItem('kc-user-cache', JSON.stringify(user))
    localStorage.setItem('kc-user-cache-validated', String(Date.now()))
  }, LIVE_CANARY_TEST_USER)
}

export async function gotoLiveCanaryRoute(
  page: Page,
  baseUrl: string,
  route: string,
  waitUntil: 'commit' | 'domcontentloaded' = 'domcontentloaded',
) {
  const targetUrl = new URL(route, baseUrl).toString()
  let lastError: unknown
  for (let attempt = 1; attempt <= LIVE_NAVIGATION_ATTEMPTS; attempt += 1) {
    try {
      return await page.goto(targetUrl, { waitUntil, timeout: 30_000 })
    } catch (error) {
      lastError = error
      if (attempt === LIVE_NAVIGATION_ATTEMPTS) break
      await page.waitForTimeout(1_000)
    }
  }
  throw lastError
}

export async function establishLiveCanarySession(page: Page, baseUrl: string) {
  const mode = liveCanaryAuthMode(baseUrl)
  if (mode === 'none') return
  if (mode === 'preauthenticated') {
    await seedPreauthenticatedLiveCanarySession(page)
    await gotoLiveCanaryRoute(page, baseUrl, '/clusters')
    await expect(page.locator('body'), 'preauthenticated live canary session must render a page body').not.toHaveText('', {
      timeout: 15_000,
    })
    return
  }

  await gotoLiveCanaryRoute(page, baseUrl, '/auth/github', 'commit')
  await page.waitForURL(url => !url.pathname.startsWith('/auth/callback'), { timeout: 15_000 }).catch(() => undefined)
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('kc-has-session')), {
      message: 'live canary dev login must establish a cookie-backed session marker',
      timeout: 20_000,
    })
    .toBe('true')
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('token')), {
      message: 'live canary dev login should settle into cookie-only auth before loading live data',
      timeout: 20_000,
    })
    .toBeNull()
  await expect
    .poll(() => page.evaluate(async () => {
      const response = await fetch('/api/me', { credentials: 'same-origin' })
      return response.status
    }), {
      message: 'live canary dev session must validate against /api/me before dashboard navigation',
      timeout: 20_000,
    })
    .toBe(200)
  await page.waitForTimeout(2_000)
  await page.evaluate(() => {
    localStorage.setItem('kc-demo-mode', 'false')
    if (localStorage.getItem('token') === 'demo-token') {
      localStorage.removeItem('token')
    }
  })
}

export async function assertLiveDashboardShell(page: Page) {
  await assertUrlIsNotAuth(page)
  await assertDashboardContentVisible(page)
  await assertNotBlank(page)
  await assertNotStuckLoading(page)
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
        const text = (element.textContent || '').replace(/\s+/g, ' ').trim()
        const ariaLabel = element.getAttribute('aria-label') || ''
        const className = element.getAttribute('class') || ''
        const statusText = `${text} ${ariaLabel} ${className}`
        const inViewport = rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
        const screenReaderOnly = rect.width <= 1 && rect.height <= 1
        const benignStatus = /page tip|last updated|not yet updated/i.test(statusText)
        const loadingLike = /loading|collecting|refresh|sync|pending|animate-spin/i.test(statusText)
        return inViewport && !screenReaderOnly && !benignStatus && loadingLike
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

export async function assertNoForbiddenLiveUi(page: Page) {
  await page.waitForTimeout(2_000)
  const state = await page.evaluate((patterns) => {
    const compiled = patterns.map(pattern => ({
      label: pattern.label,
      regex: new RegExp(pattern.source, pattern.flags),
    }))

    function visibleTextNodes() {
      const nodes: Array<{ text: string; rect: DOMRect }> = []
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node) {
        const text = (node.textContent || '').replace(/\s+/g, ' ').trim()
        const element = node.parentElement
        if (text && element) {
          const style = window.getComputedStyle(element)
          const hidden = element.closest('[aria-hidden="true"], [hidden]')
          if (!hidden && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
            const range = document.createRange()
            range.selectNodeContents(node)
            for (const rect of Array.from(range.getClientRects())) {
              const inViewport = rect.width > 1
                && rect.height > 1
                && rect.bottom > 0
                && rect.right > 0
                && rect.top < window.innerHeight
                && rect.left < window.innerWidth
              if (inViewport) nodes.push({ text, rect })
            }
          }
        }
        node = walker.nextNode()
      }
      return nodes
    }

    const textNodes = visibleTextNodes()
    const forbiddenMatches = compiled.flatMap(pattern =>
      textNodes
        .filter(node => pattern.regex.test(node.text))
        .map(node => ({ label: pattern.label, text: node.text.slice(0, 160) }))
    )
    const warningBadges = textNodes
      .map(node => {
        const match = node.text.match(/\b(\d+)\s+warnings?\b/i)
        return match ? { text: node.text.slice(0, 160), count: Number(match[1]) } : null
      })
      .filter((entry): entry is { text: string; count: number } => Boolean(entry && entry.count > 0))

    return {
      demoModeStorage: localStorage.getItem('kc-demo-mode'),
      forbiddenMatches,
      warningBadges,
    }
  }, forbiddenLiveUiPatterns)

  await recordLiveUiFailures(page, {
    forbiddenMatches: state.forbiddenMatches,
    warningBadges: process.env.LIVE_UI_ALLOW_WARNING_BADGES === 'true' ? [] : state.warningBadges,
  })
  expect(state.demoModeStorage, 'live UI must not keep demo mode enabled in localStorage').not.toBe('true')
  expect(state.forbiddenMatches, 'live UI must not show demo/local-agent/error drawer artifacts').toEqual([])
  if (process.env.LIVE_UI_ALLOW_WARNING_BADGES !== 'true') {
    expect(state.warningBadges, 'live UI must not show nonzero warning badges after settling').toEqual([])
  }
}

export async function assertNoVisibleTextCollisions(page: Page) {
  const collisions = await page.evaluate((ratioLimit) => {
    type TextBox = {
      text: string
      x: number
      y: number
      width: number
      height: number
    }

    function visibleTextBoxes(): TextBox[] {
      const boxes: TextBox[] = []
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node) {
        const text = (node.textContent || '').replace(/\s+/g, ' ').trim()
        const element = node.parentElement
        if (text.length >= 2 && element) {
          const style = window.getComputedStyle(element)
          const hidden = element.closest('[aria-hidden="true"], [hidden], script, style')
          if (!hidden && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
            const range = document.createRange()
            range.selectNodeContents(node)
            for (const rect of Array.from(range.getClientRects())) {
              const inViewport = rect.width > 4
                && rect.height > 4
                && rect.bottom > 0
                && rect.right > 0
                && rect.top < window.innerHeight
                && rect.left < window.innerWidth
              if (inViewport) {
                boxes.push({
                  text: text.slice(0, 80),
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height,
                })
              }
            }
          }
        }
        node = walker.nextNode()
      }
      return boxes
    }

    const boxes = visibleTextBoxes()
    const failures: Array<{ first: string; second: string; ratio: number }> = []
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]
        const b = boxes[j]
        const overlapWidth = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
        const overlapHeight = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
        const overlapArea = overlapWidth * overlapHeight
        if (overlapArea <= 0) continue
        const smallerArea = Math.min(a.width * a.height, b.width * b.height)
        const ratio = smallerArea > 0 ? overlapArea / smallerArea : 0
        if (ratio > ratioLimit) {
          failures.push({ first: a.text, second: b.text, ratio: Number(ratio.toFixed(2)) })
          if (failures.length >= 12) return failures
        }
      }
    }
    return failures
  }, TEXT_COLLISION_RATIO_LIMIT)

  await recordLiveUiFailures(page, { textCollisions: collisions })
  expect(collisions, 'live UI visible text must not severely overlap').toEqual([])
}

export function assertNoUnexpectedLiveNetworkErrors(
  collectors: EvidenceCollectors,
  baseUrl: string,
  additionalAllowed: RegExp[] = [],
) {
  const origin = new URL(baseUrl).origin
  const allowed = [
    /\/favicon\.ico$/i,
    ...additionalAllowed,
  ]
  const unexpectedResponses = collectors.errorResponses
    .filter(entry => {
      try {
        return new URL(entry.url).origin === origin
      } catch {
        return false
      }
    })
    .filter(entry => !allowed.some(pattern => pattern.test(entry.url)))
    .map(entry => `${entry.method} ${entry.status} ${entry.url}`)
  const unexpectedFailures = collectors.failedRequests
    .filter(entry => {
      try {
        return new URL(entry.url).origin === origin
      } catch {
        return false
      }
    })
    .filter(entry => !allowed.some(pattern => pattern.test(entry.url)))
    .map(entry => `${entry.method} ${entry.url} ${entry.failureText || ''}`.trim())

  collectors.liveUiFailures = {
    ...(collectors.liveUiFailures || {}),
    unexpectedNetworkResponses: unexpectedResponses,
    unexpectedRequestFailures: unexpectedFailures,
  }
  expect(unexpectedResponses, 'live UI must not produce unexpected app-origin 4xx/5xx responses').toEqual([])
  expect(unexpectedFailures, 'live UI must not produce unexpected app-origin request failures').toEqual([])
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
