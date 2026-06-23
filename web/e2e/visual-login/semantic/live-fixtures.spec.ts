import { test, expect } from '@playwright/test'
import { attachEvidenceOnFailure } from '../../../harness/evidence/attachEvidence'
import { installEvidenceCollectors } from '../../../harness/evidence/collectEvidence'
import {
  applyLiveFixtures,
  cleanupLiveFixtures,
  collectLiveFixtureState,
} from '../../../harness/groundtruth/liveFixtureManager'
import { assertNoCriticalRuntimeErrors } from '../helpers/visualLoginAssertions'
import {
  annotateLiveInvariant,
  assertFixtureNamesVisible,
  assertLiveDashboardShell,
  assertLiveLayoutStable,
  establishLiveCanarySession,
  liveCanaryUrl,
  writeLiveSiteReport,
} from '../helpers/liveSiteAssertions'

const invariantIds = [
  'live-fixture-ui-match',
  'live-canary-ui-layout-stable',
  'no-critical-runtime-errors',
]

test('live canary UI surfaces injected Kubernetes fixture states @intensive @live-site @fixture @invariant:live-fixture-ui-match', async ({ page }, testInfo) => {
  invariantIds.forEach(id => annotateLiveInvariant(testInfo, id))
  const collectors = installEvidenceCollectors(page)
  const baseUrl = liveCanaryUrl()

  if (process.env.LIVE_CLUSTER_FIXTURES !== 'true') {
    testInfo.annotations.push({ type: 'config-dependent-skip', description: 'LIVE_CLUSTER_FIXTURES is not true.' })
    test.skip(true, 'live fixture injection is not enabled')
  }

  if (!baseUrl) {
    testInfo.annotations.push({ type: 'config-dependent-skip', description: 'LIVE_CANARY_CONSOLE_URL, SELF_HOSTED_CONSOLE_URL, VISUAL_LOGIN_BASE_URL, or PLAYWRIGHT_BASE_URL is not configured.' })
    expect(baseUrl, 'live canary URL is required for fixture UI checks').toBeTruthy()
    return
  }

  let applied = false
  try {
    const fixture = applyLiveFixtures()
    applied = fixture.enabled
    expect(fixture.enabled, 'live fixture manager must apply controlled resources').toBe(true)

    await expect
      .poll(() => collectLiveFixtureState().observed, {
        message: 'live fixtures should reach observable Kubernetes states',
        timeout: 90_000,
      })
      .toEqual(expect.objectContaining({
        deploymentAvailable: true,
        pods: expect.arrayContaining([
          expect.objectContaining({ name: fixture.resources.imagePullPod, reason: expect.stringMatching(/ImagePullBackOff|ErrImagePull/) }),
          expect.objectContaining({ name: fixture.resources.pendingPod, phase: 'Pending' }),
        ]),
      }))

    await establishLiveCanarySession(page, baseUrl)

    await page.goto(new URL('/pods', baseUrl).toString(), { waitUntil: 'domcontentloaded' })
    await assertLiveDashboardShell(page)
    await assertFixtureNamesVisible(page, [fixture.resources.imagePullPod, fixture.resources.pendingPod])
    await assertLiveLayoutStable(page)

    await page.goto(new URL('/deployments', baseUrl).toString(), { waitUntil: 'domcontentloaded' })
    await assertLiveDashboardShell(page)
    await assertFixtureNamesVisible(page, [fixture.resources.healthyDeployment])
    await assertNoCriticalRuntimeErrors(collectors)

    writeLiveSiteReport({
      target: 'canary',
      checks: {
        fixtureInjection: 'ok',
        fixtureUi: 'ok',
      },
      namespace: fixture.namespace,
      resources: fixture.resources,
    })
  } finally {
    if (applied) cleanupLiveFixtures()
    await attachEvidenceOnFailure({
      page,
      testInfo,
      invariantIds,
      collectors,
      appMode: 'live-canary-fixtures',
      boundingBoxes: [
        { label: 'main', locator: page.locator('main') },
        { label: 'dashboard-page', locator: page.locator('[data-testid="dashboard-page"]') },
      ],
    })
  }
})
