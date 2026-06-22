import type { MutationScenario } from '../mutationTypes'
import { appShellHtml, isDocumentRoute, routePath } from './scenarioHtml'

export const staleLoadingState: MutationScenario = {
  id: 'stale-loading-state',
  description: 'Simulates an unrecoverable dashboard loading state.',
  targetInvariants: ['hosted-demo-no-login', 'demo-dashboard-visual-smoke'],
  expectedFailingTests: ['demo-no-login', 'demo-dashboard-visual-smoke'],
  async setup({ page }) {
    await page.route('**/*', async (route) => {
      const path = routePath(route)
      if (isDocumentRoute(route) && (path === '/' || path === '/dashboard')) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: appShellHtml(`
            <main id="main-content">
              <div role="status" aria-label="Loading" class="spinner">Loading KubeStellar Console...</div>
            </main>
          `),
        })
        return
      }
      await route.fallback()
    })
  },
}
