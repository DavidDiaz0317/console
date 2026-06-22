import type { MutationScenario } from '../mutationTypes'
import { appShellHtml, isDocumentRoute, routePath } from './scenarioHtml'

export const loginLayoutOverlap: MutationScenario = {
  id: 'login-layout-overlap',
  description: 'Simulates primary login controls overlapping and clipping.',
  targetInvariants: ['login-layout-stable'],
  expectedFailingTests: ['login-layout.pr'],
  async setup({ page }) {
    await page.route('**/*', async (route) => {
      if (isDocumentRoute(route) && routePath(route) === '/login') {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: appShellHtml(`
            <main data-testid="login-page" style="position: relative; width: 320px; height: 180px; overflow: hidden;">
              <h1 data-testid="login-welcome-heading">KubeStellar Console</h1>
              <button data-testid="github-login-button" style="position:absolute; left: 260px; top: 110px; width: 220px; height: 48px;">Continue with GitHub</button>
              <button style="position:absolute; left: 280px; top: 118px; width: 200px; height: 48px;">Overlapping Button</button>
            </main>
          `),
        })
        return
      }
      await route.fallback()
    })
  },
}
