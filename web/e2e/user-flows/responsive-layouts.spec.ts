import { test, expect, type Page } from '@playwright/test'
import { setupDemoAndNavigate } from '../helpers/setup'
import { assertNoLayoutOverflow } from '../helpers/ux-assertions'

/**
 * Responsive layout UX tests.
 *
 * Validates key routes at mobile, tablet, and desktop viewports.
 * Checks for horizontal overflow, non-blank rendering, and captures
 * screenshots for visual review.
 */

/** Minimum body text length to consider a page "not blank" */
const MIN_BODY_TEXT_LENGTH = 10
const ROUTE_CONTENT_TIMEOUT_MS = 20_000

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const

const ROUTES = ['/', '/clusters', '/settings', '/missions', '/deploy'] as const

async function expectRenderedContent(page: Page, route: string, viewportName: string) {
  await page.waitForLoadState('domcontentloaded')
  await expect.poll(
    () => page.evaluate(() => (document.body.innerText || '').trim().length),
    {
      timeout: ROUTE_CONTENT_TIMEOUT_MS,
      message: `Route "${route}" at ${viewportName} rendered blank`,
    },
  ).toBeGreaterThan(MIN_BODY_TEXT_LENGTH)
}

for (const viewport of VIEWPORTS) {
  for (const route of ROUTES) {
    const routeLabel = route === '/' ? 'home' : route.replace('/', '')

    test.describe(`${viewport.name} @ ${routeLabel}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } })

      test('no horizontal overflow', async ({ page }) => {
        await setupDemoAndNavigate(page, route)
        await expectRenderedContent(page, route, viewport.name)

        await assertNoLayoutOverflow(page)
      })

      test('renders content (not blank)', async ({ page }) => {
        await setupDemoAndNavigate(page, route)
        await expectRenderedContent(page, route, viewport.name)
      })

      test('screenshot for visual review', async ({ page }) => {
        await setupDemoAndNavigate(page, route)
        await expectRenderedContent(page, route, viewport.name)

        const screenshotPath = `test-results/ux/responsive-${viewport.name}-${routeLabel}.png`
        await page.screenshot({ path: screenshotPath, fullPage: false })

        // Attach for test report
        test.info().attachments.push({
          name: `${viewport.name}-${routeLabel}`,
          path: screenshotPath,
          contentType: 'image/png',
        })
      })
    })
  }
}
