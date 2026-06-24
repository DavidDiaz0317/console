import type { MutationScenario } from '../mutationTypes'
import { appShellHtml, isDocumentRoute, routePath } from './scenarioHtml'

export const cardOverlap: MutationScenario = {
  id: 'card-overlap',
  description: 'Simulates dashboard cards overlapping in the first viewport.',
  targetInvariants: ['demo-dashboard-visual-smoke'],
  expectedFailingTests: ['dashboard-layout-mutations'],
  async setup({ page }) {
    await page.route('**/*', async (route) => {
      const path = routePath(route)
      if (isDocumentRoute(route) && (path === '/' || path === '/dashboard')) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: appShellHtml(`
            <main id="main-content">
              <h1 data-testid="dashboard-title">KubeStellar Dashboard</h1>
              <section style="position:relative; height:240px;">
                <article class="card" data-visual-card="true" style="position:absolute; left:20px; top:60px; width:320px; height:160px;">Clusters</article>
                <article class="card" data-visual-card="true" style="position:absolute; left:120px; top:100px; width:320px; height:160px;">Workloads</article>
              </section>
            </main>
          `),
        })
        return
      }
      await route.fallback()
    })
  },
}
