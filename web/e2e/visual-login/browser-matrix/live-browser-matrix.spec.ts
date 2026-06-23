import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { collectK8sGroundTruth } from '../../../harness/groundtruth/collectK8sGroundTruth'
import { safeJsonStringify } from '../../../harness/evidence/sanitizeEvidence'
import {
  establishLiveCanarySession,
  gotoLiveCanaryRoute,
  liveCanaryUrl,
} from '../helpers/liveSiteAssertions'
import { firstVisibleLocator } from '../helpers/visualLoginAssertions'

type MatrixRoute = {
  route: string
  label: string
  expectedMarkers: (groundTruth: ReturnType<typeof collectK8sGroundTruth>) => Array<string | RegExp>
}

type Box = {
  x: number
  y: number
  width: number
  height: number
}

type RouteFacts = {
  browserName: string
  projectName: string
  route: string
  url: string
  authState: 'authenticated' | 'login' | 'session-expired' | 'blank'
  viewport: { width: number; height: number } | null
  status: 'passed' | 'failed'
  missingMarkers: string[]
  bodyPreview: string
  scrollOverflowX: number
  textCollisionCount: number
  clippedElementCount: number
  boxes: Record<string, Box | null>
  baseline?: { mode: 'disabled' | 'compare'; status: 'skipped' | 'passed' | 'failed'; error?: string }
  screenshotPath?: string
  error?: string
}

type InteractionFacts = {
  browserName: string
  control: string
  route: string
  status: 'passed' | 'failed' | 'skipped'
  expectedTopLayer?: string
  actualTopLayer?: string
  topmostIsOverlay?: boolean
  overlayBox?: Box | null
  screenshotPath?: string
  error?: string
}

const coreRoutes: MatrixRoute[] = [
  {
    route: '/',
    label: 'dashboard',
    expectedMarkers: groundTruth => ['Dashboard', String(groundTruth.contexts.reachable), String(groundTruth.nodes.total)],
  },
  {
    route: '/clusters',
    label: 'clusters',
    expectedMarkers: groundTruth => ['Clusters', String(groundTruth.contexts.reachable), String(groundTruth.nodes.total)],
  },
  {
    route: '/nodes',
    label: 'nodes',
    expectedMarkers: groundTruth => ['Nodes', String(groundTruth.nodes.ready), /Ready/i],
  },
  {
    route: '/pods',
    label: 'pods',
    expectedMarkers: groundTruth => ['Pods', String(groundTruth.pods.running), /Running/i],
  },
  {
    route: '/namespaces',
    label: 'namespaces',
    expectedMarkers: groundTruth => ['Namespaces', String(groundTruth.namespaces.total), /kube-system/i],
  },
  {
    route: '/deployments',
    label: 'deployments',
    expectedMarkers: groundTruth => ['Deployments', String(groundTruth.deployments.available), /Available/i],
  },
  {
    route: '/alerts',
    label: 'alerts',
    expectedMarkers: () => ['Alerts', /critical|warning|normal|issue|alert/i],
  },
]

function sanitizeSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'root'
}

function markerMissing(bodyText: string, marker: string | RegExp): boolean {
  return typeof marker === 'string' ? !bodyText.includes(marker) : !marker.test(bodyText)
}

function classifyRouteAuthState(url: string, bodyText: string): RouteFacts['authState'] {
  const normalizedText = bodyText.replace(/\s+/g, ' ').trim()
  if (!normalizedText) return 'blank'
  if (/session expired|redirecting to sign in/i.test(normalizedText)) return 'session-expired'
  try {
    const pathname = new URL(url).pathname
    if (pathname === '/login' || pathname.startsWith('/auth/')) return 'login'
  } catch {
    // Keep the text-based classification when Playwright reports a relative URL.
  }
  if (/continue with github|welcome back|sign in to manage/i.test(normalizedText)) return 'login'
  return 'authenticated'
}

function writeBrowserMatrixReport(report: Record<string, unknown>) {
  const outDir = path.resolve(process.cwd(), 'test-results/reports/browser-matrix')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, `${report.browserName}.json`), safeJsonStringify(report))
}

async function captureScreenshot(page: Page, browserName: string, name: string): Promise<string | undefined> {
  const outDir = path.resolve(process.cwd(), 'test-results/reports/browser-matrix/screenshots', browserName)
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, `${sanitizeSegment(name)}.png`)
  await page.screenshot({ path: outPath, fullPage: false }).catch(() => undefined)
  return path.relative(process.cwd(), outPath)
}

async function collectRouteFacts(
  page: Page,
  browserName: string,
  projectName: string,
  route: MatrixRoute,
  groundTruth: ReturnType<typeof collectK8sGroundTruth>,
): Promise<RouteFacts> {
  const bodyText = await page.locator('body').innerText({ timeout: 10_000 }).catch(() => '')
  const currentUrl = page.url()
  const authState = classifyRouteAuthState(currentUrl, bodyText)
  const expectedMarkers = route.expectedMarkers(groundTruth)
  const missingMarkers = expectedMarkers.filter(marker => markerMissing(bodyText, marker)).map(marker => String(marker))
  const baseline: RouteFacts['baseline'] = { mode: 'disabled', status: 'skipped' }

  if (process.env.BROWSER_MATRIX_BASELINES === 'true') {
    baseline.mode = 'compare'
    try {
      await expect(page).toHaveScreenshot([browserName, `${sanitizeSegment(route.label)}.png`], {
        fullPage: false,
        animations: 'disabled',
        maxDiffPixelRatio: 0.02,
      })
      baseline.status = 'passed'
    } catch (error) {
      baseline.status = 'failed'
      baseline.error = error instanceof Error ? error.message : String(error)
    }
  }

  const layout = await page.evaluate(() => {
    type Box = {
      x: number
      y: number
      width: number
      height: number
    }

    function boxFor(selector: string): Box | null {
      const element = document.querySelector(selector)
      if (!element) return null
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      return {
        x: Number(rect.x.toFixed(2)),
        y: Number(rect.y.toFixed(2)),
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
      }
    }

    function visibleTextBoxes(): Array<{ text: string; x: number; y: number; width: number; height: number }> {
      const boxes: Array<{ text: string; x: number; y: number; width: number; height: number }> = []
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

    function collisionCount(): number {
      const boxes = visibleTextBoxes()
      let count = 0
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i]
          const b = boxes[j]
          const overlapWidth = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
          const overlapHeight = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
          const overlapArea = overlapWidth * overlapHeight
          if (overlapArea <= 0) continue
          const smallerArea = Math.min(a.width * a.height, b.width * b.height)
          if (smallerArea > 0 && overlapArea / smallerArea > 0.30) count += 1
        }
      }
      return count
    }

    const clippedElementCount = Array.from(document.querySelectorAll('button, a, input, [role="button"], [role="menuitem"], [data-testid]'))
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        if (rect.width <= 4 || rect.height <= 4 || style.visibility === 'hidden' || style.display === 'none') return false
        return rect.right < -2
          || rect.bottom < -2
          || rect.left > window.innerWidth + 2
          || rect.top > window.innerHeight + 2
      }).length

    return {
      scrollOverflowX: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth,
      textCollisionCount: collisionCount(),
      clippedElementCount,
      boxes: {
        header: boxFor('header, [data-testid="topbar"], nav'),
        sidebar: boxFor('[data-testid="sidebar"], aside'),
        main: boxFor('main'),
        search: boxFor('input[placeholder*="Search" i], input[type="search"]'),
        filter: boxFor('button[aria-label*="filter" i], button[title*="filter" i]'),
        userMenu: boxFor('button[aria-label*="user" i], button[aria-label*="account" i]'),
        firstCard: boxFor('[data-card-id], [data-testid*="card"], [data-testid^="stat-block-"]'),
      },
    }
  })

  return {
    browserName,
    projectName,
    route: route.route,
    url: currentUrl,
    authState,
    viewport: page.viewportSize(),
    status: authState !== 'authenticated' || missingMarkers.length > 0 || baseline.status === 'failed' ? 'failed' : 'passed',
    missingMarkers,
    bodyPreview: bodyText.replace(/\s+/g, ' ').trim().slice(0, 500),
    ...layout,
    baseline,
    screenshotPath: await captureScreenshot(page, browserName, `route-${route.label}`),
  }
}

async function collectTopLayerFact(page: Page) {
  return page.evaluate(() => {
    type Box = {
      x: number
      y: number
      width: number
      height: number
    }

    const candidates = Array.from(document.querySelectorAll([
      '[role="dialog"]',
      '[role="menu"]',
      '[aria-modal="true"]',
      '[data-radix-popper-content-wrapper]',
      '[class*="popover" i]',
      '[class*="dropdown" i]',
      '[class*="modal" i]',
      '[class*="menu" i]',
    ].join(',')))

    const visibleCandidates = candidates
      .map((element) => {
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return { element, rect, zIndex: style.zIndex, position: style.position }
      })
      .filter(({ rect, element }) => {
        const style = window.getComputedStyle(element)
        return rect.width > 20
          && rect.height > 20
          && rect.bottom > 0
          && rect.right > 0
          && rect.top < window.innerHeight
          && rect.left < window.innerWidth
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && style.opacity !== '0'
      })
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height))

    const overlay = visibleCandidates[0]
    if (!overlay) {
      return {
        topmostIsOverlay: false,
        actualTopLayer: 'no visible overlay',
        overlayBox: null,
      }
    }

    const centerX = Math.min(window.innerWidth - 1, Math.max(0, overlay.rect.left + overlay.rect.width / 2))
    const centerY = Math.min(window.innerHeight - 1, Math.max(0, overlay.rect.top + overlay.rect.height / 2))
    const topElement = document.elementFromPoint(centerX, centerY)
    const topmostIsOverlay = Boolean(topElement && (topElement === overlay.element || overlay.element.contains(topElement)))
    const topDescriptor = topElement
      ? [
          topElement.tagName.toLowerCase(),
          topElement.id ? `#${topElement.id}` : '',
          topElement.className ? `.${String(topElement.className).replace(/\s+/g, '.').slice(0, 120)}` : '',
        ].join('')
      : 'none'

    const box: Box = {
      x: Number(overlay.rect.x.toFixed(2)),
      y: Number(overlay.rect.y.toFixed(2)),
      width: Number(overlay.rect.width.toFixed(2)),
      height: Number(overlay.rect.height.toFixed(2)),
    }

    return {
      topmostIsOverlay,
      actualTopLayer: topDescriptor,
      overlayBox: box,
      overlayZIndex: overlay.zIndex,
      overlayPosition: overlay.position,
    }
  })
}

async function exerciseControl(
  page: Page,
  browserName: string,
  route: string,
  control: string,
  locators: Array<ReturnType<Page['locator']>>,
): Promise<InteractionFacts> {
  const locator = await firstVisibleLocator(page, locators)
  if (!locator) {
    return {
      browserName,
      route,
      control,
      status: 'skipped',
      error: 'control was not visible',
    }
  }

  try {
    await locator.click()
    await page.waitForTimeout(700)
    const topLayer = await collectTopLayerFact(page)
    const screenshotPath = await captureScreenshot(page, browserName, `interaction-${control}`)
    await page.keyboard.press('Escape').catch(() => undefined)
    return {
      browserName,
      route,
      control,
      status: topLayer.topmostIsOverlay ? 'passed' : 'failed',
      expectedTopLayer: 'opened overlay/menu/dialog should be topmost at its center point',
      actualTopLayer: topLayer.actualTopLayer,
      topmostIsOverlay: topLayer.topmostIsOverlay,
      overlayBox: topLayer.overlayBox,
      screenshotPath,
      error: topLayer.topmostIsOverlay ? undefined : 'opened overlay was not topmost',
    }
  } catch (error) {
    return {
      browserName,
      route,
      control,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

test('live browser matrix records route and interaction layout facts @intensive @live-site @browser-matrix @invariant:live-browser-matrix', async ({ page, browserName }, testInfo) => {
  test.skip(process.env.LIVE_SITE_TESTS !== 'true', 'browser matrix live checks require LIVE_SITE_TESTS=true')

  const baseUrl = liveCanaryUrl()
  expect(baseUrl, 'live canary URL is required for browser matrix checks').toBeTruthy()

  const projectBrowser = browserName
  const report = {
    browserName: projectBrowser,
    projectName: testInfo.project.name,
    baseUrl,
    viewport: page.viewportSize(),
    runId: process.env.GITHUB_RUN_ID || String(Date.now()),
    routes: [] as RouteFacts[],
    interactions: [] as InteractionFacts[],
    session: { status: 'pending' as 'pending' | 'passed' | 'failed', error: undefined as string | undefined },
  }

  const groundTruth = collectK8sGroundTruth()

  try {
    await establishLiveCanarySession(page, baseUrl!)
    report.session.status = 'passed'
  } catch (error) {
    report.session.status = 'failed'
    report.session.error = error instanceof Error ? error.message : String(error)
  }

  if (report.session.status === 'passed') {
    for (const route of coreRoutes) {
      try {
        const response = await gotoLiveCanaryRoute(page, baseUrl!, route.route)
        await page.waitForLoadState('domcontentloaded').catch(() => undefined)
        const facts = await collectRouteFacts(page, projectBrowser, testInfo.project.name, route, groundTruth)
        if (!response?.ok()) {
          facts.status = 'failed'
          facts.error = `HTTP ${response?.status() ?? 'no response'}`
        }
        report.routes.push(facts)
      } catch (error) {
        report.routes.push({
          browserName: projectBrowser,
          projectName: testInfo.project.name,
          route: route.route,
          url: page.url(),
          authState: classifyRouteAuthState(page.url(), await page.locator('body').innerText({ timeout: 1_000 }).catch(() => '')),
          viewport: page.viewportSize(),
          status: 'failed',
          missingMarkers: route.expectedMarkers(groundTruth).map(marker => String(marker)),
          bodyPreview: (await page.locator('body').innerText({ timeout: 1_000 }).catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 500),
          scrollOverflowX: 0,
          textCollisionCount: 0,
          clippedElementCount: 0,
          boxes: {},
          screenshotPath: await captureScreenshot(page, projectBrowser, `route-${route.label}-error`),
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    await gotoLiveCanaryRoute(page, baseUrl!, '/').catch(() => undefined)
    report.interactions.push(await exerciseControl(page, projectBrowser, '/', 'filter', [
      page.getByRole('button', { name: /filter/i }).first(),
      page.locator('button[aria-label*="filter" i]').first(),
      page.locator('button[title*="filter" i]').first(),
    ]))
    report.interactions.push(await exerciseControl(page, projectBrowser, '/', 'stats-settings', [
      page.getByRole('button', { name: /configure stats/i }).first(),
      page.locator('button[title*="configure" i]').first(),
    ]))
    report.interactions.push(await exerciseControl(page, projectBrowser, '/', 'user-menu', [
      page.locator('button').filter({ hasText: /DavidDiaz0317|dev-user|live-canary-ui/i }).first(),
      page.getByRole('button', { name: /DavidDiaz0317|dev-user|live-canary-ui|account|user/i }).first(),
      page.locator('button[aria-label*="user" i], button[aria-label*="account" i]').first(),
    ]))
    report.interactions.push(await exerciseControl(page, projectBrowser, '/', 'alerts-or-issues', [
      page.getByRole('button', { name: /critical|warning|alert|issue/i }).first(),
      page.getByText(/\d+\s+(critical|warnings?|issues?)/i).first(),
    ]))
    report.interactions.push(await exerciseControl(page, projectBrowser, '/', 'ai-missions', [
      page.getByRole('button', { name: /AI Missions/i }).first(),
      page.getByText(/AI Missions/i).first(),
    ]))
  }

  writeBrowserMatrixReport(report)
})
