import type { Page } from '@playwright/test'
import type { MutationScenario } from './mutationTypes'

export async function applyMutation(page: Page, scenario: MutationScenario): Promise<'applied' | 'skipped'> {
  const skipReason = scenario.skipCondition?.()
  if (skipReason) {
    testOnlyMutationLog(`Skipping ${scenario.id}: ${skipReason}`)
    return 'skipped'
  }
  await scenario.setup({ page })
  await page.addInitScript((id) => {
    window.localStorage.setItem('visual-login-mutation', id)
  }, scenario.id)
  return 'applied'
}

function testOnlyMutationLog(message: string) {
  if (process.env.VISUAL_LOGIN_MUTATION_DEBUG === 'true') {
    console.warn(`[visual-login-mutation] ${message}`)
  }
}
