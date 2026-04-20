import { test as base, expect, type Route } from '@playwright/test'

/**
 * Custom fixtures for KubeStellar Console (kc) E2E tests
 *
 * Provides common setup, utilities, and page objects for testing.
 */

/**
 * Route handler signature used by Playwright's `page.route(url, handler)`.
 *
 * We track each registered handler by URL so the `mockAPI` fixture can:
 *   1. Unroute the previous handler for a given URL before registering a new
 *      one — without this, Playwright stacks handlers and the FIRST one wins
 *      (see #9085 / Missions.spec.ts comment around line 86), so re-calling
 *      `mockClusters([clusterB])` after `mockClusters([clusterA])` would
 *      incorrectly keep returning `clusterA`.
 *   2. Unroute every handler at fixture teardown so route handlers do not
 *      leak across tests on a reused `page` context.
 */
type RouteHandler = (route: Route) => void | Promise<void>

// Extend the test with custom fixtures
export const test = base.extend<{
  // Login state management
  authenticatedPage: ReturnType<typeof base.extend>

  // AI mode utilities
  aiMode: {
    setLow: () => Promise<void>
    setMedium: () => Promise<void>
    setHigh: () => Promise<void>
  }

  // API mocking helpers
  mockAPI: {
    mockClusters: (clusters: unknown[]) => Promise<void>
    mockPodIssues: (issues: unknown[]) => Promise<void>
    mockEvents: (events: unknown[]) => Promise<void>
    mockGPUNodes: (nodes: unknown[]) => Promise<void>
    mockLocalAgent: () => Promise<void>
    /**
     * Drop every route handler this fixture instance registered. Called
     * automatically at fixture teardown; exposed so tests can also reset
     * mid-test if they want to flip a mock without leaking the previous one.
     */
    unrouteAll: () => Promise<void>
  }
}>({
  // AI mode fixture
  aiMode: async ({ page }, use) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture, not a React hook
    await use({
      setLow: async () => {
        await page.evaluate(() => {
          localStorage.setItem('kubestellar-ai-mode', 'low')
        })
      },
      setMedium: async () => {
        await page.evaluate(() => {
          localStorage.setItem('kubestellar-ai-mode', 'medium')
        })
      },
      setHigh: async () => {
        await page.evaluate(() => {
          localStorage.setItem('kubestellar-ai-mode', 'high')
        })
      },
    })
  },

  // API mocking fixture
  //
  // #9085 — Earlier versions of this fixture called `page.route(...)` without
  // ever calling `page.unroute(...)`. Two consequences:
  //   * Re-registering a mock for the same URL inside a test did NOT override
  //     the earlier registration — Playwright stacks handlers and matches in
  //     registration order, so the first (e.g. beforeEach) handler always won.
  //   * Handlers leaked across tests sharing the same `page` (common when a
  //     suite uses `test.describe.configure({ mode: 'serial' })`).
  //
  // The fixture now tracks every (url, handler) pair it registers, unroutes
  // any previous handler for the same URL before adding a new one, and
  // unroutes everything during fixture teardown.
  mockAPI: async ({ page }, use) => {
    /** URL pattern → currently registered handler for that URL. */
    const handlers = new Map<string, RouteHandler>()

    /**
     * Register `handler` for `url`, unrouting any previously registered
     * handler for the same URL first so the new one is the one that fires.
     */
    const setRoute = async (url: string, handler: RouteHandler): Promise<void> => {
      const previous = handlers.get(url)
      if (previous !== undefined) {
        await page.unroute(url, previous)
      }
      handlers.set(url, handler)
      await page.route(url, handler)
    }

    /** Drop every handler this fixture registered. */
    const unrouteAll = async (): Promise<void> => {
      for (const [url, handler] of handlers) {
        await page.unroute(url, handler).catch(() => {
          // Ignore — page may already be closed during teardown.
        })
      }
      handlers.clear()
    }

    // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture, not a React hook
    await use({
      mockClusters: async (clusters) => {
        await setRoute('**/api/mcp/clusters', (route) =>
          route.fulfill({
            status: 200,
            json: { clusters },
          })
        )
      },
      mockPodIssues: async (issues) => {
        await setRoute('**/api/mcp/pod-issues', (route) =>
          route.fulfill({
            status: 200,
            json: { issues },
          })
        )
      },
      mockEvents: async (events) => {
        await setRoute('**/api/mcp/events**', (route) =>
          route.fulfill({
            status: 200,
            json: { events },
          })
        )
      },
      mockGPUNodes: async (nodes) => {
        await setRoute('**/api/mcp/gpu-nodes', (route) =>
          route.fulfill({
            status: 200,
            json: { nodes },
          })
        )
      },
      mockLocalAgent: async () => {
        // Mock local agent endpoints (used by drilldown components)
        await setRoute('**/127.0.0.1:8585/**', (route) =>
          route.fulfill({
            status: 200,
            json: { events: [], clusters: [], health: { hasClaude: false, hasBob: false } },
          })
        )
      },
      unrouteAll,
    })

    // Teardown: drop every handler we registered so nothing leaks into the
    // next test that reuses this `page` (e.g. serial-mode describe blocks).
    await unrouteAll()
  },
})

// Export expect for convenience
export { expect }

// Common test data
export const testData = {
  clusters: {
    healthy: [
      { name: 'cluster-1', context: 'ctx-1', healthy: true, nodeCount: 5, podCount: 45 },
      { name: 'cluster-2', context: 'ctx-2', healthy: true, nodeCount: 3, podCount: 32 },
    ],
    withUnhealthy: [
      { name: 'healthy-cluster', context: 'ctx-1', healthy: true, nodeCount: 5, podCount: 45 },
      { name: 'unhealthy-cluster', context: 'ctx-2', healthy: false, nodeCount: 3, podCount: 12 },
    ],
    empty: [],
  },

  podIssues: {
    none: [],
    few: [
      { name: 'pod-1', namespace: 'default', status: 'CrashLoopBackOff', issues: ['Error'], restarts: 5 },
      { name: 'pod-2', namespace: 'kube-system', status: 'Pending', issues: ['Unschedulable'], restarts: 0 },
    ],
    many: Array(15).fill(null).map((_, i) => ({
      name: `pod-${i}`,
      namespace: 'production',
      status: 'CrashLoopBackOff',
      issues: ['Container restarting'],
      restarts: i * 2,
    })),
  },

  events: {
    normal: [
      { type: 'Normal', reason: 'Scheduled', message: 'Pod scheduled', object: 'Pod/test', namespace: 'default', count: 1 },
    ],
    warnings: [
      { type: 'Warning', reason: 'BackOff', message: 'Back-off restarting', object: 'Pod/test', namespace: 'default', count: 5 },
      { type: 'Warning', reason: 'FailedScheduling', message: 'Insufficient memory', object: 'Pod/test2', namespace: 'default', count: 3 },
    ],
    mixed: [
      { type: 'Normal', reason: 'Scheduled', message: 'Pod scheduled', object: 'Pod/test', namespace: 'default', count: 1 },
      { type: 'Warning', reason: 'BackOff', message: 'Back-off restarting', object: 'Pod/error', namespace: 'default', count: 5 },
    ],
    empty: [],
  },

  gpuNodes: {
    available: [
      { name: 'gpu-1', cluster: 'ml', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 4 },
      { name: 'gpu-2', cluster: 'ml', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 2 },
    ],
    fullyAllocated: [
      { name: 'gpu-1', cluster: 'ml', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 8 },
      { name: 'gpu-2', cluster: 'ml', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 8 },
    ],
    none: [],
  },

  securityIssues: {
    none: [],
    critical: [
      { name: 'pod-1', namespace: 'prod', issue: 'Privileged container', severity: 'high' },
      { name: 'pod-2', namespace: 'prod', issue: 'Running as root', severity: 'high' },
    ],
  },
}

// Helper functions

/** Timeout for login to complete (ms). */
const LOGIN_TIMEOUT_MS = 15_000

/**
 * URL regex that matches a SUCCESSFUL post-login landing page.
 *
 * #9084 — The previous regex `/\/$|\/onboarding/` had a subtle bug: `\/$`
 * matches any URL ending in `/`, including `/login/` itself. If the dev
 * login button was missing OR the login flow redirected back to the login
 * page, the helper reported success even though auth had clearly failed.
 *
 * The new regex:
 *   - Matches the exact bare-root `/` (e.g. `http://host/`) — the dashboard
 *   - Matches `/dashboard` and `/onboarding` with optional trailing `/`
 *   - Explicitly REJECTS any URL containing `/login`
 */
const LOGIN_SUCCESS_URL = (url: URL): boolean => {
  if (/\/login(\/|$)/i.test(url.pathname)) return false
  return url.pathname === '/' || /^\/(dashboard|onboarding)\/?$/i.test(url.pathname)
}

export async function login(page: ReturnType<typeof base.extend>['page']) {
  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')

  const devLoginButton = page.getByRole('button', { name: /dev.*login|continue.*demo/i }).first()
  const hasDevLogin = await devLoginButton.isVisible().catch(() => false)

  if (!hasDevLogin) {
    throw new Error(
      'login(): dev-login button is not present on /login. Cannot proceed with login. ' +
      'If this test does not need a real auth flow, call setupDemoMode() from helpers/setup.ts instead.'
    )
  }

  await devLoginButton.click()

  // Accept any non-/login URL as success. Reject explicit /login URLs so
  // we don't report success when the app redirected back to the login page.
  await page.waitForURL(LOGIN_SUCCESS_URL, { timeout: LOGIN_TIMEOUT_MS })
}

export async function waitForDashboard(page: ReturnType<typeof base.extend>['page']) {
  await page.waitForURL('/', { timeout: 10000 })
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
}

export async function openCardMenu(page: ReturnType<typeof base.extend>['page'], cardIndex = 0) {
  const cardMenu = page.locator('[data-testid*="card-menu"]').nth(cardIndex)
  await cardMenu.click()
}

export async function closeModal(page: ReturnType<typeof base.extend>['page']) {
  const closeButton = page.locator('button[aria-label*="close"], [data-testid="close-modal"]').first()
  const hasClose = await closeButton.isVisible().catch(() => false)

  if (hasClose) {
    await closeButton.click()
  } else {
    await page.keyboard.press('Escape')
  }
}
