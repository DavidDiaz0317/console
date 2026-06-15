import { expect, type Page } from '@playwright/test'

const LAYOUT_STABILITY_POLL_INTERVAL_MS = 250
const REQUIRED_STABLE_LAYOUT_SAMPLES = 6
const LAYOUT_SHIFT_TOLERANCE_PX = 2
const VISUAL_SETTLE_TIMEOUT_MS = 20_000

/**
 * Wait until document scroll height stops shifting — reduces flaky full-page screenshots.
 */
export async function waitForDocumentHeightStable(page: Page) {
  let previousHeight: number | null = null
  let stableSamples = 0

  await expect
    .poll(async () => {
      const height = await page.evaluate(() => document.documentElement.scrollHeight)
      const isStable = previousHeight !== null &&
        Math.abs(height - previousHeight) <= LAYOUT_SHIFT_TOLERANCE_PX
      stableSamples = isStable ? stableSamples + 1 : 0
      previousHeight = height
      return stableSamples >= REQUIRED_STABLE_LAYOUT_SAMPLES
    }, {
      message: 'page layout should settle before visual screenshot',
      timeout: VISUAL_SETTLE_TIMEOUT_MS,
      intervals: [LAYOUT_STABILITY_POLL_INTERVAL_MS],
    })
    .toBe(true)
}

/**
 * Wait for dashboard card grid when present (most dashboard routes).
 */
export async function waitForDashboardCardsGrid(page: Page, timeoutMs: number) {
  const grid = page.getByTestId('dashboard-cards-grid')
  await grid.waitFor({ state: 'visible', timeout: timeoutMs }).catch(() => {
    // Not every route renders the cards grid.
  })
}
