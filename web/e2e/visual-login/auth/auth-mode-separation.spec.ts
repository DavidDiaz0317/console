import { test, expect } from '@playwright/test'
import { mockApiFallback } from '../../helpers/setup'
import { attachEvidenceOnFailure } from '../../../harness/evidence/attachEvidence'
import { installEvidenceCollectors } from '../../../harness/evidence/collectEvidence'
import {
  annotateInvariants,
  assertHostedDemoNoLoginInvariant,
  authModeFromEnv,
  setupLocalDemo,
} from '../helpers/visualLoginAssertions'

const invariantIds = ['auth-mode-separation', 'hosted-demo-no-login']

test('demo and local/full auth modes are not swapped @pr-visual @auth @invariant:auth-mode-separation', async ({ page }, testInfo) => {
  annotateInvariants(testInfo, invariantIds)
  const collectors = installEvidenceCollectors(page)
  const mode = authModeFromEnv()

  try {
    await setupLocalDemo(page, '/')
    await assertHostedDemoNoLoginInvariant(page)

    if (mode !== 'oauth') {
      testInfo.annotations.push({
        type: 'config-dependent-skip',
        description: 'Self-hosted OAuth branch skipped because VISUAL_LOGIN_AUTH_MODE is not oauth.',
      })
      return
    }

    await page.context().clearCookies()
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
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
    await expect(page.getByTestId('github-login-button')).toBeVisible()
  } finally {
    await attachEvidenceOnFailure({ page, testInfo, invariantIds, collectors, appMode: mode })
  }
})
