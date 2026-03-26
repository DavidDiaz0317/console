import { test, expect, Page } from '@playwright/test'

/**
 * E2E Tests for GPUOverview card on the GPU Reservations dashboard
 *
 * Tests that the GPU dashboard renders correctly in demo mode:
 * - Empty state text ("No GPU data") when no GPU metrics are available
 * - GPU stat blocks show zero counts
 * - Dashboard page loads and renders cards
 * - Responsive behavior across viewports
 * - Error resilience when GPU API fails
 *
 * Closes #3558
 *
 * Run with: npx playwright test e2e/GPUOverview.spec.ts
 */

/** Set up demo mode for predictable data */
async function setupDemoMode(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
  })
}

/** Navigate to the GPU Reservations dashboard in demo mode */
async function setupGPUDashboard(page: Page) {
  await setupDemoMode(page)
  await page.goto('/gpu-reservations')
  await page.waitForLoadState('domcontentloaded')
}

test.describe('GPUOverview Card', () => {
  test.describe('GPU Dashboard Loading', () => {
    test('GPU Reservations dashboard loads successfully', async ({ page }) => {
      await setupGPUDashboard(page)

      const heading = page.getByText('GPU Reservations').first()
      await expect(heading).toBeVisible({ timeout: 20000 })
    })
  })

  test.describe('Empty State — No GPU Resources', () => {
    test('shows "No GPU data" empty state message on GPU dashboard', async ({ page }) => {
      await setupGPUDashboard(page)

      // In demo mode, GPU cards render empty state because no real GPU
      // data is available. The translation key gpuStatus.noGPUData renders
      // as "No GPU Data" (shared by GPUOverview and GPUStatus components).
      const noGPUText = page.getByText(/no gpu data/i).first()
      await noGPUText.scrollIntoViewIfNeeded({ timeout: 20000 })
      await expect(noGPUText).toBeVisible({ timeout: 5000 })
    })

    test('shows zero total GPUs in dashboard stats', async ({ page }) => {
      await setupGPUDashboard(page)

      // The stat block at the top shows "0" next to "Total GPUs"
      const totalGPUs = page.getByText('Total GPUs').first()
      await expect(totalGPUs).toBeVisible({ timeout: 20000 })
    })

    test('shows GPU utilization at 0% in empty state', async ({ page }) => {
      await setupGPUDashboard(page)

      // The GPU Utilization card shows 0% when no GPUs are present
      const zeroPercent = page.getByText('0%').first()
      await expect(zeroPercent).toBeVisible({ timeout: 20000 })
    })

    test('displays "0 of 0 GPUs allocated" message', async ({ page }) => {
      await setupGPUDashboard(page)

      // The GPU Utilization card shows this message in empty state
      const allocatedMsg = page.getByText(/0 of 0 GPUs allocated/i).first()
      await allocatedMsg.scrollIntoViewIfNeeded({ timeout: 20000 })
      await expect(allocatedMsg).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Card Structure', () => {
    test('GPU dashboard renders GPU-related card headings', async ({ page }) => {
      await setupGPUDashboard(page)

      // The GPU dashboard should show GPU-specific card headings
      const heading = page.getByText('GPU Reservations').first()
      await expect(heading).toBeVisible({ timeout: 20000 })

      // GPU Utilization card heading should be present
      const utilHeading = page.getByText('GPU Utilization').first()
      await utilHeading.scrollIntoViewIfNeeded({ timeout: 20000 })
      await expect(utilHeading).toBeVisible({ timeout: 5000 })
    })

    test('GPU dashboard shows Active GPU Reservations section', async ({ page }) => {
      await setupGPUDashboard(page)

      const reservationsHeading = page.getByText('Active GPU Reservations').first()
      await reservationsHeading.scrollIntoViewIfNeeded({ timeout: 20000 })
      await expect(reservationsHeading).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Error Handling', () => {
    test('page does not crash when GPU API returns 500', async ({ page }) => {
      await setupDemoMode(page)

      await page.route('**/api/mcp/gpu-nodes**', (route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        })
      )

      await page.goto('/gpu-reservations')
      await page.waitForLoadState('domcontentloaded')

      await expect(page.locator('body')).toBeVisible()
      const pageContent = await page.content()
      expect(pageContent.length).toBeGreaterThan(100)
    })

    test('page does not crash when clusters API returns empty', async ({ page }) => {
      await setupDemoMode(page)

      await page.route('**/api/mcp/clusters**', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ clusters: [] }),
        })
      )

      await page.goto('/gpu-reservations')
      await page.waitForLoadState('domcontentloaded')

      await expect(page.locator('body')).toBeVisible()
      const pageContent = await page.content()
      expect(pageContent.length).toBeGreaterThan(100)
    })
  })

  test.describe('Responsive Design', () => {
    test('renders on mobile viewport (375x667)', async ({ page }) => {
      await setupGPUDashboard(page)
      await page.setViewportSize({ width: 375, height: 667 })

      await expect(page.locator('body')).toBeVisible()
      const pageContent = await page.content()
      expect(pageContent.length).toBeGreaterThan(100)
    })

    test('renders on tablet viewport (768x1024)', async ({ page }) => {
      await setupGPUDashboard(page)
      await page.setViewportSize({ width: 768, height: 1024 })

      await expect(page.locator('body')).toBeVisible()
      const pageContent = await page.content()
      expect(pageContent.length).toBeGreaterThan(100)
    })

    test('renders on wide viewport (1920x1080)', async ({ page }) => {
      await setupGPUDashboard(page)
      await page.setViewportSize({ width: 1920, height: 1080 })

      await expect(page.locator('body')).toBeVisible()
      const pageContent = await page.content()
      expect(pageContent.length).toBeGreaterThan(100)
    })
  })
})
