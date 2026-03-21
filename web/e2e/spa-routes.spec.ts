import { test, expect, Page } from '@playwright/test'
import { ROUTES } from '../src/config/routes'

/**
 * SPA Route Regression Tests
 *
 * Validates that every route defined in routes.ts actually loads
 * without returning a 404 or blank page. Catches regressions like:
 * - #3046: Backend dev server returns 404 for SPA routes
 * - #3008: chunk_load errors on routes
 *
 * Run with: npx playwright test e2e/spa-routes.spec.ts
 */

// Derive the route list programmatically from routes.ts so this list
// stays in sync automatically as routes are added or removed.
// Parameterized routes (containing ':') and internal test/perf routes
// are excluded because they require dynamic IDs or are not user-facing.
const ALL_ROUTES = Object.entries(ROUTES)
  .filter(([, path]) => !path.includes(':') && !path.startsWith('/__') && !path.startsWith('/test/'))
  .map(([key, path]) => ({
    path,
    name: key
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' '),
  }))

async function setupDemoMode(page: Page) {
  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
  })
}

test.describe('SPA Route Coverage', () => {
  test.beforeEach(async ({ page }) => {
    await setupDemoMode(page)
  })

  for (const { path, name } of ALL_ROUTES) {
    test(`${name} (${path}) loads without blank page or crash`, async ({ page }) => {
      // Navigate to the route
      const response = await page.goto(path)

      // Should not get a server-side 404 (regression #3046)
      if (response) {
        expect(
          response.status(),
          `${path} returned HTTP ${response.status()}`
        ).toBeLessThan(400)
      }

      await page.waitForLoadState('domcontentloaded')

      // Page should have meaningful content (not blank)
      const bodyText = await page.textContent('body')
      expect(
        bodyText?.length,
        `${path} rendered a blank or near-empty page`
      ).toBeGreaterThan(20)

      // Should have the root React mount point (not a raw 404 page)
      const rootDiv = page.locator('#root')
      await expect(rootDiv).toBeVisible({ timeout: 10000 })
    })
  }

  test('unknown route shows 404 page, not a crash', async ({ page }) => {
    await page.goto('/this-route-definitely-does-not-exist-xyz')
    await page.waitForLoadState('domcontentloaded')

    // Should still render the React app (SPA handles 404 in-app)
    const rootDiv = page.locator('#root')
    await expect(rootDiv).toBeVisible({ timeout: 10000 })

    const bodyText = await page.textContent('body')
    expect(bodyText?.length).toBeGreaterThan(20)
  })
})
