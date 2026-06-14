import { test } from '@playwright/test'
import { attachEvidenceOnFailure } from '../../../harness/evidence/attachEvidence'
import { installEvidenceCollectors } from '../../../harness/evidence/collectEvidence'
import {
  annotateInvariants,
  assertHostedDemoNoLoginInvariant,
  assertNoCriticalRuntimeErrors,
  openDemoEntry,
} from '../helpers/visualLoginAssertions'

const invariantIds = ['hosted-demo-no-login', 'no-critical-runtime-errors']

test('hosted demo does not require login @pr-visual @auth @invariant:hosted-demo-no-login', async ({ page }, testInfo) => {
  annotateInvariants(testInfo, invariantIds)
  const collectors = installEvidenceCollectors(page)
  const appMode = await openDemoEntry(page, '/')

  try {
    await assertHostedDemoNoLoginInvariant(page)
    await assertNoCriticalRuntimeErrors(collectors)
  } finally {
    await attachEvidenceOnFailure({ page, testInfo, invariantIds, collectors, appMode })
  }
})
