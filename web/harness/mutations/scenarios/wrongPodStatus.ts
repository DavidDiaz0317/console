import type { MutationScenario } from '../mutationTypes'
import { appShellHtml, isDocumentRoute, routePath } from './scenarioHtml'

export const wrongPodStatus: MutationScenario = {
  id: 'wrong-pod-status',
  description: 'Simulates the UI reporting healthy pods while ground truth contains degraded pods.',
  targetInvariants: ['cluster-dashboard-groundtruth-match'],
  expectedFailingTests: ['cluster-groundtruth'],
  skipCondition() {
    return process.env.LIVE_CLUSTER_TESTS === 'true' ? null : 'Live cluster ground truth is not enabled.'
  },
  async setup({ page }) {
    await page.route('**/*', async (route) => {
      const path = routePath(route)
      if (isDocumentRoute(route) && (path === '/' || path === '/pods')) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: appShellHtml(`
            <main id="main-content">
              <h1 data-testid="dashboard-title">Pods</h1>
              <div data-groundtruth-field="pods-crashloop">0</div>
              <div data-groundtruth-field="pods-pending">0</div>
              <p>All pods healthy</p>
            </main>
          `),
        })
        return
      }
      await route.fallback()
    })
  },
}
