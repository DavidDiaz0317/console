import { test, expect } from '@playwright/test'
import { mutationScenarios } from '../../../harness/mutations/mutationRegistry'

test('mutation registry maps scenarios to expected invariant failures @intensive @adequacy @mutation', async () => {
  const ids = mutationScenarios.map(scenario => scenario.id)
  expect(ids).toEqual(expect.arrayContaining([
    'force-demo-login',
    'show-blocking-github-login-on-demo',
    'hide-dashboard-content',
    'stale-loading-state',
    'login-layout-overlap',
    'card-overlap',
    'long-cluster-name-overflow',
    'hidden-ai-mission-button',
    'wrong-cluster-count',
    'wrong-pod-status',
  ]))
  for (const scenario of mutationScenarios) {
    expect(scenario.targetInvariants.length, `${scenario.id} must target invariants`).toBeGreaterThan(0)
    expect(scenario.expectedFailingTests.length, `${scenario.id} must define expected failing tests`).toBeGreaterThan(0)
  }
})
