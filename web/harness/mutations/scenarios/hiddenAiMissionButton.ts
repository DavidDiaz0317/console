import type { MutationScenario } from '../mutationTypes'
import { dashboardHtml, isDocumentRoute, routePath } from './scenarioHtml'

export const hiddenAiMissionButton: MutationScenario = {
  id: 'hidden-ai-mission-button',
  description: 'Simulates the AI Mission entry point being hidden while the feature is enabled.',
  targetInvariants: ['ai-mission-entrypoint-usable-if-enabled'],
  expectedFailingTests: ['ai-mission-visual'],
  skipCondition() {
    return process.env.VISUAL_LOGIN_AI_MISSION_ENABLED === 'true' ? null : 'AI Mission entrypoint is config-dependent; set VISUAL_LOGIN_AI_MISSION_ENABLED=true to enforce.'
  },
  async setup({ page }) {
    await page.route('**/*', async (route) => {
      const path = routePath(route)
      if (isDocumentRoute(route) && (path === '/' || path === '/missions')) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: dashboardHtml('<button data-tour="ai-missions-toggle" style="display:none;">AI Missions</button>'),
        })
        return
      }
      await route.fallback()
    })
  },
}
