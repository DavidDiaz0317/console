import { test, expect } from '@playwright/test'
import { mockApiFallback } from '../../helpers/setup'
import { attachEvidenceOnFailure } from '../../../harness/evidence/attachEvidence'
import { installEvidenceCollectors } from '../../../harness/evidence/collectEvidence'
import {
  annotateInvariants,
  assertLocatorInsideViewport,
  assertNoCriticalRuntimeErrors,
  assertNoSevereOverlap,
} from '../helpers/visualLoginAssertions'

const invariantIds = ['login-layout-stable', 'no-critical-runtime-errors']

test('login page primary controls render without clipping or overlap @pr-visual @visual @auth @invariant:login-layout-stable', async ({ page }, testInfo) => {
  annotateInvariants(testInfo, invariantIds)
  const collectors = installEvidenceCollectors(page)

  try {
    await mockApiFallback(page)
    await page.route('**/health', (route) => {
      const url = new URL(route.request().url())
      if (url.pathname !== '/health') return route.fallback()
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', version: 'dev', oauth_configured: true, no_local_agent: true }),
      })
    })
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('login-page')).toBeVisible()
    await assertLocatorInsideViewport(page, page.getByTestId('login-welcome-heading'), 'login heading')
    await assertLocatorInsideViewport(page, page.getByTestId('github-login-button'), 'GitHub login button')
    await assertNoSevereOverlap(page, page.getByTestId('login-welcome-heading').or(page.getByTestId('github-login-button')))
    await assertNoCriticalRuntimeErrors(collectors)
    await page.screenshot({ path: testInfo.outputPath('login-layout.png'), fullPage: false })
  } finally {
    await attachEvidenceOnFailure({
      page,
      testInfo,
      invariantIds,
      collectors,
      appMode: 'oauth-login-layout',
      boundingBoxes: [
        { label: 'login-heading', locator: page.getByTestId('login-welcome-heading') },
        { label: 'github-login-button', locator: page.getByTestId('github-login-button') },
      ],
    })
  }
})
