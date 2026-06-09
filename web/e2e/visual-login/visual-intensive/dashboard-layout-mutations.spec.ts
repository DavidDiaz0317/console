import { test, expect } from '@playwright/test'
import { applyMutation } from '../../../harness/mutations/applyMutation'
import { clearMutation } from '../../../harness/mutations/clearMutation'
import { getMutationScenario } from '../../../harness/mutations/mutationRegistry'
import {
  annotateInvariants,
  assertLocatorInsideViewport,
  assertNoSevereOverlap,
} from '../helpers/visualLoginAssertions'
import { appendMutationResult } from '../helpers/mutationResultWriter'

async function expectMutationKilled(id: string, action: () => Promise<void>) {
  const scenario = getMutationScenario(id)
  let killed = false
  let message = ''
  try {
    await action()
  } catch (error) {
    killed = true
    message = error instanceof Error ? error.message : String(error)
  }
  appendMutationResult({
    id: scenario.id,
    status: killed ? 'killed' : 'survived',
    targetInvariants: scenario.targetInvariants,
    expectedFailingTests: scenario.expectedFailingTests,
    message: killed ? message : 'Layout assertion passed despite injected visual fault.',
    timestamp: new Date().toISOString(),
  })
  expect(killed, `${id} must be killed by layout assertions`).toBe(true)
}

test('login-layout-overlap is killed by login layout invariant @intensive @mutation @visual @invariant:login-layout-stable', async ({ page }, testInfo) => {
  const scenario = getMutationScenario('login-layout-overlap')
  annotateInvariants(testInfo, scenario.targetInvariants)
  await applyMutation(page, scenario)
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await expectMutationKilled('login-layout-overlap', async () => {
    await assertLocatorInsideViewport(page, page.getByTestId('github-login-button'), 'mutated GitHub login button')
    await assertNoSevereOverlap(page, page.locator('button'))
  })
  await clearMutation(page)
})

test('card-overlap is killed by dashboard layout invariant @intensive @mutation @visual @invariant:demo-dashboard-visual-smoke', async ({ page }, testInfo) => {
  const scenario = getMutationScenario('card-overlap')
  annotateInvariants(testInfo, scenario.targetInvariants)
  await applyMutation(page, scenario)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expectMutationKilled('card-overlap', async () => {
    await assertNoSevereOverlap(page, page.locator('[data-visual-card="true"]'))
  })
  await clearMutation(page)
})

test('long-cluster-name-overflow is killed when layout becomes horizontally unusable @intensive @mutation @visual @invariant:demo-dashboard-visual-smoke', async ({ page }, testInfo) => {
  const scenario = getMutationScenario('long-cluster-name-overflow')
  annotateInvariants(testInfo, scenario.targetInvariants)
  await applyMutation(page, scenario)
  await page.goto('/clusters', { waitUntil: 'domcontentloaded' })
  await expectMutationKilled('long-cluster-name-overflow', async () => {
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 8)
    expect(hasHorizontalOverflow, 'long names must not create page-level horizontal overflow').toBe(false)
  })
  await clearMutation(page)
})
