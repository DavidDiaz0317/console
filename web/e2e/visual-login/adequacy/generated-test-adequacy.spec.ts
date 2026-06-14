import path from 'node:path'
import { test, expect } from '@playwright/test'
import { analyzeTestFile } from '../../../harness/adequacy/analyzeTestFile'

test('weak body-only smoke scores low and strong demo no-login scores higher @intensive @adequacy', async () => {
  const weak = analyzeTestFile(path.resolve('harness/adequacy/fixtures/weak-body-only.spec.ts'))[0]
  const strong = analyzeTestFile(path.resolve('harness/adequacy/fixtures/strong-demo-no-login.spec.ts'))[0]

  expect(weak.score).toBeLessThanOrEqual(24)
  expect(weak.problems).toContain('body is visible is the only meaningful assertion')
  expect(strong.score).toBeGreaterThan(weak.score)
  expect(strong.invariantIds).toContain('hosted-demo-no-login')
})
