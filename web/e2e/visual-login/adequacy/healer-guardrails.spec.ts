import path from 'node:path'
import { test, expect } from '@playwright/test'
import { compareHealedFiles } from '../../../harness/adequacy/detectHealerWeakening'

test('healer guardrail rejects weakening demo no-login test intent @intensive @adequacy', async () => {
  const findings = compareHealedFiles(
    path.resolve('harness/adequacy/fixtures/bad-healed-demo-no-login.before.ts'),
    path.resolve('harness/adequacy/fixtures/bad-healed-demo-no-login.after.ts'),
  )
  expect(findings.map(finding => finding.type)).toEqual(expect.arrayContaining([
    'removed-invariant',
    'removed-negative-assertion',
    'removed-url-assertion',
    'replaced-with-body-visible',
    'removed-demo-no-login-intent',
  ]))
  expect(findings.some(finding => finding.severity === 'critical')).toBe(true)
})
