import { test } from '@playwright/test'
import { attachEvidenceOnFailure } from '../../../harness/evidence/attachEvidence'
import { installEvidenceCollectors } from '../../../harness/evidence/collectEvidence'
import {
  annotateLiveInvariant,
  assertLiveDashboardShell,
  assertLiveLayoutStable,
  assertNoForbiddenLiveUi,
  assertNoUnexpectedLiveNetworkErrors,
  assertNoVisibleTextCollisions,
  establishLiveCanarySession,
  gotoLiveCanaryRoute,
  liveCanaryUrl,
  writeLiveSiteReport,
} from '../helpers/liveSiteAssertions'
import { assertNoCriticalRuntimeErrors } from '../helpers/visualLoginAssertions'

const invariantIds = [
  'live-ui-no-demo-artifacts',
  'live-ui-no-warning-flood',
  'live-ui-no-text-collisions',
  'live-ui-no-unexpected-network-errors',
]

test('live canary dashboard avoids demo artifacts, warning floods, and visible layout collisions @intensive @live-site @invariant:live-ui-no-demo-artifacts', async ({ page }, testInfo) => {
  invariantIds.forEach(id => annotateLiveInvariant(testInfo, id))
  const collectors = installEvidenceCollectors(page)
  const baseUrl = liveCanaryUrl()
  const liveChecksRequired = process.env.LIVE_SITE_TESTS === 'true' || process.env.LIVE_CLUSTER_TESTS === 'true'

  if (!baseUrl) {
    testInfo.annotations.push({ type: 'config-dependent-skip', description: 'LIVE_CANARY_CONSOLE_URL, SELF_HOSTED_CONSOLE_URL, VISUAL_LOGIN_BASE_URL, or PLAYWRIGHT_BASE_URL is not configured.' })
    test.skip(!liveChecksRequired, 'live canary URL is not configured')
    throw new Error('live canary URL is required when LIVE_SITE_TESTS or LIVE_CLUSTER_TESTS is true')
  }

  try {
    await establishLiveCanarySession(page, baseUrl)
    await gotoLiveCanaryRoute(page, baseUrl, '/clusters?groundtruth=1')
    await assertLiveDashboardShell(page)
    await assertNoForbiddenLiveUi(page)
    await assertLiveLayoutStable(page)
    await assertNoVisibleTextCollisions(page)
    await assertNoUnexpectedLiveNetworkErrors(collectors, baseUrl)
    await assertNoCriticalRuntimeErrors(collectors)

    writeLiveSiteReport({
      target: 'canary',
      url: baseUrl,
      checks: {
        forbiddenLiveUi: 'ok',
        warningBadges: 'ok',
        textCollisions: 'ok',
        networkErrors: 'ok',
      },
    })
  } finally {
    await attachEvidenceOnFailure({
      page,
      testInfo,
      invariantIds,
      collectors,
      appMode: 'live-ui-regression',
      boundingBoxes: [
        { label: 'main', locator: page.locator('main') },
        { label: 'clusters-page', locator: page.locator('[data-testid="clusters-page"]') },
        { label: 'warning-badges', locator: page.getByText(/\b\d+\s+warnings?\b/i) },
      ],
    })
  }
})
