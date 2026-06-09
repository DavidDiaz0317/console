import { test } from '@playwright/test'
import { attachEvidenceOnFailure } from '../../../harness/evidence/attachEvidence'
import { installEvidenceCollectors } from '../../../harness/evidence/collectEvidence'
import {
  annotateInvariants,
  assertDashboardContentVisible,
  assertNoCriticalRuntimeErrors,
  assertNotBlank,
  assertNotStuckLoading,
  setupLocalDemo,
} from '../helpers/visualLoginAssertions'

const invariantIds = ['demo-dashboard-visual-smoke', 'no-critical-runtime-errors']

test('demo dashboard visual smoke is not blank or stuck loading @pr-visual @visual @invariant:demo-dashboard-visual-smoke', async ({ page }, testInfo) => {
  annotateInvariants(testInfo, invariantIds)
  const collectors = installEvidenceCollectors(page)

  try {
    await setupLocalDemo(page, '/')
    await assertNotBlank(page)
    await assertNotStuckLoading(page)
    await assertDashboardContentVisible(page)
    await assertNoCriticalRuntimeErrors(collectors)
    await page.screenshot({ path: testInfo.outputPath('demo-dashboard.png'), fullPage: false })
  } finally {
    await attachEvidenceOnFailure({ page, testInfo, invariantIds, collectors, appMode: 'local-demo' })
  }
})
