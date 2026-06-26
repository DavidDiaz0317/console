import type { MutationScenario } from '../mutationTypes'
import { appShellHtml, isDocumentRoute, routePath } from './scenarioHtml'

export const hideDashboardContent: MutationScenario = {
  id: 'hide-dashboard-content',
  description: 'Simulates a demo dashboard shell with missing primary content.',
  targetInvariants: ['demo-dashboard-visual-smoke'],
  expectedFailingTests: ['demo-dashboard-visual-smoke'],
  async setup({ page }) {
    await page.route('**/*', async (route) => {
      const path = routePath(route)
      if (isDocumentRoute(route) && (path === '/' || path === '/dashboard')) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: appShellHtml('<main id="main-content" aria-label="empty dashboard"></main>'),
        })
        return
      }
      await route.fallback()
    })
  },
}
