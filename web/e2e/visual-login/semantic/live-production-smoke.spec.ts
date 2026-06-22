import { test, expect } from '@playwright/test'
import { attachEvidenceOnFailure } from '../../../harness/evidence/attachEvidence'
import { installEvidenceCollectors } from '../../../harness/evidence/collectEvidence'
import { assertNoCriticalRuntimeErrors } from '../helpers/visualLoginAssertions'
import {
  annotateLiveInvariant,
  assertProductionOAuthBoundary,
  liveProductionUrl,
  writeLiveSiteReport,
} from '../helpers/liveSiteAssertions'

const invariantIds = ['live-production-auth-boundary', 'no-critical-runtime-errors']

test('production live site keeps OAuth boundary intact @intensive @live-site @invariant:live-production-auth-boundary', async ({ page }, testInfo) => {
  invariantIds.forEach(id => annotateLiveInvariant(testInfo, id))
  const collectors = installEvidenceCollectors(page)
  const baseUrl = liveProductionUrl()

  if (!baseUrl) {
    testInfo.annotations.push({ type: 'config-dependent-skip', description: 'LIVE_PRODUCTION_CONSOLE_URL, LIVE_SITE_URL, or CONSOLE_LIVE_URL is not configured.' })
    test.skip(true, 'production live URL is not configured')
    return
  }
  const productionUrl = baseUrl

  try {
    await assertProductionOAuthBoundary(page, productionUrl)
    const response = await page.goto(productionUrl, { waitUntil: 'domcontentloaded' })
    expect(response?.ok(), 'production live root should serve the login/app shell').toBeTruthy()
    await expect(page.locator('body'), 'production live root must not serve an ingress/nginx error').not.toContainText(/403 Forbidden|404 Not Found|502 Bad Gateway|503 Service Unavailable/i)
    await assertNoCriticalRuntimeErrors(collectors)
    writeLiveSiteReport({
      target: 'production',
      url: productionUrl,
      checks: {
        health: 'ok',
        unauthenticatedApiMe: 401,
        oauthRedirect: 'ok',
      },
    })
  } finally {
    await attachEvidenceOnFailure({ page, testInfo, invariantIds, collectors, appMode: 'live-production-smoke' })
  }
})
