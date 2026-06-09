import { test, expect } from '@playwright/test'
import { applyMutation } from '../../../harness/mutations/applyMutation'
import { clearMutation } from '../../../harness/mutations/clearMutation'
import { getMutationScenario } from '../../../harness/mutations/mutationRegistry'
import {
  annotateInvariants,
  assertHostedDemoNoLoginInvariant,
} from '../helpers/visualLoginAssertions'
import { appendMutationResult } from '../helpers/mutationResultWriter'

const mutationIds = [
  'force-demo-login',
  'show-blocking-github-login-on-demo',
  'hide-dashboard-content',
  'stale-loading-state',
]

for (const mutationId of mutationIds) {
  test(`${mutationId} is killed by demo/login invariants @intensive @mutation @invariant:hosted-demo-no-login`, async ({ page }, testInfo) => {
    const scenario = getMutationScenario(mutationId)
    annotateInvariants(testInfo, scenario.targetInvariants)
    const applied = await applyMutation(page, scenario)
    if (applied === 'skipped') {
      appendMutationResult({
        id: scenario.id,
        status: 'skipped',
        targetInvariants: scenario.targetInvariants,
        expectedFailingTests: scenario.expectedFailingTests,
        message: scenario.skipCondition?.() || 'Skipped by scenario.',
        timestamp: new Date().toISOString(),
      })
      test.skip(true, scenario.skipCondition?.() || 'Scenario skipped.')
    }

    let killed = false
    let message = ''
    try {
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      await assertHostedDemoNoLoginInvariant(page)
    } catch (error) {
      killed = true
      message = error instanceof Error ? error.message : String(error)
    } finally {
      await clearMutation(page)
    }

    appendMutationResult({
      id: scenario.id,
      status: killed ? 'killed' : 'survived',
      targetInvariants: scenario.targetInvariants,
      expectedFailingTests: scenario.expectedFailingTests,
      message: killed ? message : 'Invariant assertions passed despite injected login/demo fault.',
      timestamp: new Date().toISOString(),
    })
    expect(killed, `${mutationId} must be killed by hosted demo/login invariant checks`).toBe(true)
  })
}
