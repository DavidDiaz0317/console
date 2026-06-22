import { test, expect } from '@playwright/test'
import { mockApiFallback } from '../../helpers/setup'
import { attachEvidenceOnFailure } from '../../../harness/evidence/attachEvidence'
import { installEvidenceCollectors } from '../../../harness/evidence/collectEvidence'
import {
  annotateInvariants,
  assertDashboardContentVisible,
  assertHostedDemoNoLoginInvariant,
  authModeFromEnv,
  setupLocalDemo,
} from '../helpers/visualLoginAssertions'

const invariantIds = ['local-auth-mode-correct']

test('local/full auth behavior matches configured auth mode @pr-visual @auth @invariant:local-auth-mode-correct', async ({ page }, testInfo) => {
  annotateInvariants(testInfo, invariantIds)
  const collectors = installEvidenceCollectors(page)
  const mode = authModeFromEnv()

  try {
    if (mode === 'unknown') {
      testInfo.annotations.push({
        type: 'config-dependent-skip',
        description: 'VISUAL_LOGIN_AUTH_MODE is not set; local/full auth expectation cannot be inferred safely.',
      })
      test.skip(true, 'VISUAL_LOGIN_AUTH_MODE is not set.')
    }

    if (mode === 'demo') {
      await setupLocalDemo(page, '/')
      await assertHostedDemoNoLoginInvariant(page)
      await assertDashboardContentVisible(page)
      return
    }

    await mockApiFallback(page)
    await page.route('**/health', (route) => {
      const url = new URL(route.request().url())
      if (url.pathname !== '/health') return route.fallback()
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', oauth_configured: true, no_local_agent: true }),
      })
    })
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('login-page')).toBeVisible()
    await expect(page.getByTestId('github-login-button')).toBeVisible()
  } finally {
    await attachEvidenceOnFailure({ page, testInfo, invariantIds, collectors, appMode: mode })
  }
})
