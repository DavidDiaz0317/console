import { test, expect, type Page } from '@playwright/test'
import { setupDemoMode } from '../helpers/setup'
import { waitForDashboardCardsGrid, waitForDocumentHeightStable } from './visual-settle'

/**
 * Full-app visual regression tests.
 *
 * Run with:
 *   cd web && npm run test:visual
 *
 * Update baselines after intentional layout changes:
 *   cd web && npm run test:visual:update
 */

const DASHBOARD_SETTLE_TIMEOUT_MS = 15_000
const ROOT_VISIBLE_TIMEOUT_MS = 15_000

const DESKTOP_VIEWPORT = { width: 1440, height: 900 }
const LAPTOP_VIEWPORT = { width: 1280, height: 720 }
const TABLET_VIEWPORT = { width: 768, height: 1024 }

async function setupAndNavigate(page: Page, path = '/') {
  await setupDemoMode(page)
  await page.goto(path)
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: ROOT_VISIBLE_TIMEOUT_MS })
}

async function settleDashboardForScreenshot(page: Page) {
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: DASHBOARD_SETTLE_TIMEOUT_MS })
  await waitForDashboardCardsGrid(page, DASHBOARD_SETTLE_TIMEOUT_MS)
  await waitForDocumentHeightStable(page)
}

test.describe('Full-app layout — desktop (1440×900)', () => {
  test.use({ viewport: DESKTOP_VIEWPORT })

  test('dashboard with sidebar and card grid', async ({ page }) => {
    // Demo branch: intentionally navigate to a different page so the screenshot mismatches the dashboard baseline.
    await setupAndNavigate(page, '/settings')
    await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: DASHBOARD_SETTLE_TIMEOUT_MS })
    await waitForDocumentHeightStable(page)

    await expect(page).toHaveScreenshot('app-dashboard-desktop-1440.png', {
      fullPage: false,
    })
  })

  test('dashboard header and controls', async ({ page }) => {
    await setupAndNavigate(page)
    await expect(page.getByTestId('dashboard-header')).toBeVisible({
      timeout: DASHBOARD_SETTLE_TIMEOUT_MS,
    })
    await settleDashboardForScreenshot(page)

    await expect(page).toHaveScreenshot('app-header-controls-desktop-1440.png', {
      fullPage: false,
    })
  })
})

test.describe('Full-app layout — laptop (1280×720)', () => {
  test.use({ viewport: LAPTOP_VIEWPORT })

  test('dashboard at laptop resolution', async ({ page }) => {
    await setupAndNavigate(page)
    await settleDashboardForScreenshot(page)

    await expect(page).toHaveScreenshot('app-dashboard-laptop-1280.png', {
      fullPage: false,
    })
  })
})

test.describe('Full-app layout — tablet (768×1024)', () => {
  test.use({ viewport: TABLET_VIEWPORT })

  test('dashboard at tablet resolution', async ({ page }) => {
    await setupAndNavigate(page)
    await settleDashboardForScreenshot(page)

    await expect(page).toHaveScreenshot('app-dashboard-tablet-768.png', {
      fullPage: false,
    })
  })
})

test.describe('Full-app layout — full page scroll', () => {
  test.use({ viewport: DESKTOP_VIEWPORT })

  test('full page screenshot captures below-fold cards', async ({ page }) => {
    await setupAndNavigate(page)
    await settleDashboardForScreenshot(page)

    await expect(page).toHaveScreenshot('app-dashboard-fullpage-1440.png', {
      fullPage: true,
    })
  })
})

// ── Clusters page ────────────────────────────────────────────────────────────

test.describe('Clusters page — desktop (1440×900)', () => {
  test.use({ viewport: DESKTOP_VIEWPORT })

  test('clusters page with sidebar', async ({ page }) => {
    await setupAndNavigate(page, '/clusters')

    await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: DASHBOARD_SETTLE_TIMEOUT_MS })
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: DASHBOARD_SETTLE_TIMEOUT_MS })
    await waitForDocumentHeightStable(page)

    await expect(page).toHaveScreenshot('app-clusters-desktop-1440.png', {
      fullPage: false,
    })
  })

  test('clusters page full-page scroll', async ({ page }) => {
    await setupAndNavigate(page, '/clusters')

    await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: DASHBOARD_SETTLE_TIMEOUT_MS })
    await waitForDocumentHeightStable(page)

    await expect(page).toHaveScreenshot('app-clusters-fullpage-1440.png', {
      fullPage: true,
    })
  })
})

test.describe('Clusters page — tablet (768×1024)', () => {
  test.use({ viewport: TABLET_VIEWPORT })

  test('clusters page at tablet resolution', async ({ page }) => {
    await setupAndNavigate(page, '/clusters')

    await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: DASHBOARD_SETTLE_TIMEOUT_MS })
    await waitForDocumentHeightStable(page)

    await expect(page).toHaveScreenshot('app-clusters-tablet-768.png', {
      fullPage: false,
    })
  })
})

// ── Settings page ────────────────────────────────────────────────────────────

test.describe('Settings page — desktop (1440×900)', () => {
  test.use({ viewport: DESKTOP_VIEWPORT })

  test('settings page layout', async ({ page }) => {
    await setupAndNavigate(page, '/settings')

    await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: DASHBOARD_SETTLE_TIMEOUT_MS })
    await waitForDocumentHeightStable(page)

    await expect(page).toHaveScreenshot('app-settings-desktop-1440.png', {
      fullPage: false,
    })
  })

  test('settings page full-page scroll', async ({ page }) => {
    await setupAndNavigate(page, '/settings')

    await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: DASHBOARD_SETTLE_TIMEOUT_MS })
    await waitForDocumentHeightStable(page)

    await expect(page).toHaveScreenshot('app-settings-fullpage-1440.png', {
      fullPage: true,
    })
  })
})
