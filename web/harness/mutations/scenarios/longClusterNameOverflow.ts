import type { MutationScenario } from '../mutationTypes'
import { appShellHtml, isDocumentRoute, routePath } from './scenarioHtml'

const LONG_NAME = 'cluster-with-extremely-long-name-that-should-wrap-or-truncate-without-breaking-primary-controls-0123456789'

export const longClusterNameOverflow: MutationScenario = {
  id: 'long-cluster-name-overflow',
  description: 'Simulates very long cluster/resource names that can break layout.',
  targetInvariants: ['demo-dashboard-visual-smoke'],
  expectedFailingTests: ['responsive-matrix', 'dashboard-layout-mutations'],
  async setup({ page }) {
    await page.route('**/*', async (route) => {
      const path = routePath(route)
      if (isDocumentRoute(route) && (path === '/' || path === '/clusters')) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: appShellHtml(`
            <main id="main-content" style="min-width: 1800px;">
              <h1 data-testid="dashboard-title">Clusters</h1>
              <button style="float:right;">Primary action</button>
              <div class="card" data-visual-card="true" style="white-space: nowrap; font-size: 22px; width: max-content;">${LONG_NAME}</div>
            </main>
          `),
        })
        return
      }
      await route.fallback()
    })
  },
}
