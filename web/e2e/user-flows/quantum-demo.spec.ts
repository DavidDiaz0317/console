import { test, expect, type Page } from '@playwright/test'
import {
  setupDemoAndNavigate,
  ELEMENT_VISIBLE_TIMEOUT_MS,
  PAGE_LOAD_TIMEOUT_MS,
} from '../helpers/setup'
import { collectConsoleErrors } from '../helpers/ux-assertions'

/**
 * User-flow E2E for the /quantum dashboard route.
 *
 * Covers two regression classes from the testing-protocol audit
 * (2026-06-09, deferred PR 3):
 *
 * 1. Demo-mode landing — all four quantum cards render without crashing the
 *    page when no quantum workload is reachable. Guards against #16052-style
 *    Card render errors caused by stale-cache hydration of `lastIbmError`.
 *
 * 2. ControlPanel default badge — confirms the consumer chain
 *    (useQuantumAuthStatus → ControlPanel → CardWrapper → DOM) wires up the
 *    "Not configured" badge in default demo state. Guards against the
 *    consumer-chain regressions from PRs #15948 / #15957 / #15960 / #16052.
 *
 * The "Stored" → "Configured" badge transitions are NOT covered here because
 * the global `kc-demo-mode` flag short-circuits every useCache hook
 * (cacheCore.ts: `effectiveEnabled = enabled && (!demoMode || liveInDemoMode)`),
 * so `/api/quantum/auth/status` route mocks never reach the fetcher in demo
 * mode. Those transitions are exhaustively covered by unit tests in
 * `web/src/components/cards/quantum/__tests__/QuantumControlPanel.test.tsx`.
 *
 * Uses the standard `web/playwright.config.ts` (NOT `app-visual.config.ts`).
 */

const QUANTUM_ROUTE = '/quantum'
const SIDEBAR_TIMEOUT_MS = 15_000

const HEADING_QUBIT_GRID = /Quantum Qubit Display/i
const HEADING_HISTOGRAM = /Execution Histogram/i
const HEADING_CIRCUIT = /Quantum Circuit/i
const HEADING_CONTROL_PANEL = /Quantum Demonstration Controls/i

const BADGE_NOT_CONFIGURED = /Not configured/i

/**
 * Wait for the /quantum dashboard shell to render. The page uses the standard
 * dashboard shell (sidebar + cards grid).
 */
async function waitForQuantumPage(page: Page) {
  await expect(page.getByTestId('sidebar')).toBeVisible({
    timeout: SIDEBAR_TIMEOUT_MS,
  })
  await expect(page.getByTestId('dashboard-cards-grid')).toBeVisible({
    timeout: SIDEBAR_TIMEOUT_MS,
  })
}

/**
 * Locate a quantum card by its heading text. Mirrors the ancestor-axis pattern
 * used by `web/e2e/visual/app-quantum-visual.spec.ts` so we can scope per-card
 * assertions without depending on internal DOM structure.
 */
function findQuantumCardByHeading(page: Page, heading: RegExp) {
  return page
    .locator('h2, h3')
    .filter({ hasText: heading })
    .first()
    .locator('xpath=ancestor::*[@data-card-type][1]')
}

test.describe('Quantum demo user flows', () => {
  test('demo-mode landing: all four quantum cards render without crashing', async ({ page }) => {
    const assertNoUnexpectedErrors = collectConsoleErrors(page)

    await setupDemoAndNavigate(page, QUANTUM_ROUTE)
    await waitForQuantumPage(page)

    // All four card headings must render. We don't assert visibility on the
    // ControlPanel's h3 specifically because it lives inside a card body — but
    // the heading text itself is enough to confirm the card mounted.
    await expect(
      page.locator('h2, h3').filter({ hasText: HEADING_QUBIT_GRID }).first()
    ).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    await expect(
      page.locator('h2, h3').filter({ hasText: HEADING_HISTOGRAM }).first()
    ).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    await expect(
      page.locator('h2, h3').filter({ hasText: HEADING_CIRCUIT }).first()
    ).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    await expect(
      page.locator('h2, h3').filter({ hasText: HEADING_CONTROL_PANEL }).first()
    ).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    // Each card must mount with a `data-card-type` ancestor, proving the
    // CardWrapper rendered the body (not just the heading from a fallback).
    for (const heading of [HEADING_QUBIT_GRID, HEADING_HISTOGRAM, HEADING_CIRCUIT, HEADING_CONTROL_PANEL]) {
      const card = findQuantumCardByHeading(page, heading)
      await expect(card).toBeAttached({ timeout: PAGE_LOAD_TIMEOUT_MS })
    }

    // No render-error / cache-hydration crashes should reach the console.
    assertNoUnexpectedErrors()
  })

  test('control panel: shows "Not configured" badge in default demo state', async ({ page }) => {
    // Default demo mode: workload reports nothing because the auth-status hook
    // is short-circuited by the global demo-mode flag (effectiveEnabled=false).
    // The hook returns DEFAULT_AUTH_STATUS (tokenStored:false, lastIbmError:null)
    // → ibmCredentialState="none" → "Not configured" badge renders.
    await setupDemoAndNavigate(page, QUANTUM_ROUTE)
    await waitForQuantumPage(page)

    const controlPanelCard = findQuantumCardByHeading(page, HEADING_CONTROL_PANEL)
    await expect(controlPanelCard).toBeAttached({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    await expect(
      controlPanelCard.getByText(BADGE_NOT_CONFIGURED).first()
    ).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  })
})
