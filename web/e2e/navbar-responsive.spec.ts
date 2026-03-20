import { test, expect, Page } from '@playwright/test'

async function setupPage(page: Page) {
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '1',
        github_id: '12345',
        github_login: 'testuser',
        email: 'test@example.com',
        onboarded: true,
      }),
    })
  )

  await page.route('**/api/mcp/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ clusters: [], issues: [], events: [], nodes: [] }),
    })
  )

  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('demo-user-onboarded', 'true')
  })
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
}

// Breakpoints from Navbar.tsx:
//   sm  = 640px  (search bar visible in main bar)
//   md  = 768px  (ClusterFilterPanel, AgentStatus, AgentSelector)
//   lg  = 1024px (UpdateIndicator, TokenUsage, FeatureRequest; overflow menu hidden)
// Minimum enforced width is ~511px (observed in issue #2999)
const VIEWPORTS = [
  { name: 'minimum (511px)', width: 511, height: 720 },
  { name: 'small (640px)', width: 640, height: 720 },
  { name: 'medium (768px)', width: 768, height: 720 },
  { name: 'large (1024px)', width: 1024, height: 720 },
  { name: 'full (1280px)', width: 1280, height: 720 },
]

test.describe('Navbar responsive layout', () => {
  // Always-visible elements must be accessible at every allowed viewport width
  for (const { name, width, height } of VIEWPORTS) {
    test(`core navbar items are accessible at ${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await setupPage(page)

      const nav = page.locator('nav[data-tour="navbar"]')
      await expect(nav).toBeVisible()

      // Logo / home button always visible
      await expect(nav.getByRole('button', { name: /go home/i })).toBeVisible()

      // Theme toggle always visible
      await expect(nav.locator('button[title*="theme" i]')).toBeVisible()

      // Alerts badge always visible
      await expect(nav.locator('[data-testid="alert-badge"], button[aria-label*="alert" i]').first()).toBeVisible()

      // User profile dropdown always visible
      await expect(
        nav.locator('[data-testid="user-menu"], button[aria-label*="user" i], button[aria-label*="profile" i]').first()
      ).toBeVisible()
    })
  }

  test('overflow menu button is visible below lg breakpoint (1024px)', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 720 })
    await setupPage(page)

    const nav = page.locator('nav[data-tour="navbar"]')
    const overflowBtn = nav.getByRole('button', { name: /more options/i })
    await expect(overflowBtn).toBeVisible()
  })

  test('overflow menu reveals hidden items when opened below lg', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 720 })
    await setupPage(page)

    const nav = page.locator('nav[data-tour="navbar"]')
    const overflowBtn = nav.getByRole('button', { name: /more options/i })
    await overflowBtn.click()

    // At least one item from the lg-hidden group should now be visible
    const panel = page.locator('.fixed.bg-card').last()
    await expect(panel).toBeVisible()
  })

  test('search bar is in main nav bar at sm+ (640px)', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 720 })
    await setupPage(page)

    const nav = page.locator('nav[data-tour="navbar"]')
    // Search container uses hidden sm:block
    const searchWrapper = nav.locator('.hidden.sm\\:block')
    await expect(searchWrapper).toBeVisible()
  })

  test('desktop item group is visible at md+ (768px)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 720 })
    await setupPage(page)

    const nav = page.locator('nav[data-tour="navbar"]')
    // ClusterFilterPanel/AgentStatus group uses hidden md:flex
    const desktopGroup = nav.locator('.hidden.md\\:flex').first()
    await expect(desktopGroup).toBeVisible()
  })

  test('extended item group is visible at lg+ (1024px)', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 720 })
    await setupPage(page)

    const nav = page.locator('nav[data-tour="navbar"]')
    // UpdateIndicator/TokenUsage/FeatureRequest group uses hidden lg:flex
    const lgGroup = nav.locator('.hidden.lg\\:flex').first()
    await expect(lgGroup).toBeVisible()
  })

  test('overflow menu button is hidden at lg+ (1024px)', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 720 })
    await setupPage(page)

    const nav = page.locator('nav[data-tour="navbar"]')
    // Overflow container uses relative lg:hidden
    const overflowContainer = nav.locator('.relative.lg\\:hidden')
    await expect(overflowContainer).toBeHidden()
  })
})
