import type { MutationScenario } from '../mutationTypes'
import { isDocumentRoute, loginHtml, routePath } from './scenarioHtml'

export const forceDemoLogin: MutationScenario = {
  id: 'force-demo-login',
  description: 'Simulates hosted/demo mode rendering a blocking login screen.',
  targetInvariants: ['hosted-demo-no-login', 'auth-mode-separation'],
  expectedFailingTests: ['demo-no-login', 'auth-mode-separation'],
  async setup({ page }) {
    await page.route('**/*', async (route) => {
      const path = routePath(route)
      if (isDocumentRoute(route) && (path === '/' || path === '/dashboard')) {
        await route.fulfill({ status: 200, contentType: 'text/html', body: loginHtml() })
        return
      }
      await route.fallback()
    })
  },
}
