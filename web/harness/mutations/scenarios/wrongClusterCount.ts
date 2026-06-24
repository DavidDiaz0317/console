import type { MutationScenario } from '../mutationTypes'
import { appShellHtml, isDocumentRoute, routePath } from './scenarioHtml'

export const wrongClusterCount: MutationScenario = {
  id: 'wrong-cluster-count',
  description: 'Simulates the UI displaying an incorrect live-cluster count.',
  targetInvariants: ['cluster-dashboard-groundtruth-match'],
  expectedFailingTests: ['cluster-groundtruth'],
  skipCondition() {
    return process.env.LIVE_CLUSTER_TESTS === 'true' ? null : 'Live cluster ground truth is not enabled.'
  },
  async setup({ page }) {
    await page.route('**/*', async (route) => {
      const path = routePath(route)
      if (isDocumentRoute(route) && (path === '/' || path === '/clusters')) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: appShellHtml(`
            <main id="main-content">
              <h1 data-testid="dashboard-title">Clusters</h1>
              <div data-groundtruth-field="clusters-total">0</div>
            </main>
          `),
        })
        return
      }
      await route.fallback()
    })
  },
}
