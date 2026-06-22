import type { MutationScenario } from '../mutationTypes'
import { appShellHtml, isDocumentRoute, routePath } from './scenarioHtml'

export const showBlockingGithubLoginOnDemo: MutationScenario = {
  id: 'show-blocking-github-login-on-demo',
  description: 'Simulates the demo dashboard showing a blocking GitHub sign-in affordance.',
  targetInvariants: ['hosted-demo-no-login'],
  expectedFailingTests: ['demo-no-login'],
  async setup({ page }) {
    await page.route('**/*', async (route) => {
      const path = routePath(route)
      if (isDocumentRoute(route) && (path === '/' || path === '/dashboard')) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: appShellHtml(`
            <main id="main-content">
              <h1>KubeStellar Dashboard</h1>
              <p>Demo content is blocked until sign-in.</p>
              <button data-testid="github-login-button">Continue with GitHub</button>
            </main>
          `),
        })
        return
      }
      await route.fallback()
    })
  },
}
