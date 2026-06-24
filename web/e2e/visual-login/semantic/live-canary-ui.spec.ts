import { test, expect, type Page } from '@playwright/test'
import { attachEvidenceOnFailure } from '../../../harness/evidence/attachEvidence'
import { installEvidenceCollectors } from '../../../harness/evidence/collectEvidence'
import { collectK8sGroundTruth } from '../../../harness/groundtruth/collectK8sGroundTruth'
import {
  assertNoCriticalRuntimeErrors,
} from '../helpers/visualLoginAssertions'
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

function readPositiveIntEnv(name: string, fallback: number) {
  const rawValue = process.env[name]
  const value = Number(rawValue || fallback)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got ${rawValue}`)
  }
  return value
}

async function expectGroundTruthField(page: Page, field: string, expected: number) {
  const marker = page.locator(`[data-groundtruth-field="${field}"]`)
  await expect(marker, `missing data-groundtruth-field="${field}" marker`).toHaveCount(1)
  await expect(marker.first(), `data-groundtruth-field="${field}" should match live Kubernetes ground truth`).toHaveText(String(expected), {
    timeout: 20_000,
  })
}

const invariantIds = [
  'cluster-dashboard-groundtruth-match',
  'live-canary-ui-layout-stable',
  'live-ui-no-demo-artifacts',
  'live-ui-no-warning-flood',
  'live-ui-no-text-collisions',
  'live-ui-no-unexpected-network-errors',
  'no-critical-runtime-errors',
]

const liveCanaryExpectedConsoleNoise = [
  /Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/i,
  /Failed to load resource: the server responded with a status of 403 \(Forbidden\)/i,
  /Failed to load resource: the server responded with a status of 405 \(Method Not Allowed\)/i,
  /Failed to load resource: the server responded with a status of 502 \(Bad Gateway\)/i,
  /\[Missions\] Failed to connect to agent: Error: CONNECTION_FAILED/i,
  /\[OfflineDetection\] Error fetching nodes: SyntaxError: Unexpected token '<'/i,
]

test('live canary UI matches Kubernetes groundtruth without screenshot baselines @intensive @live-site @groundtruth @invariant:live-canary-ui-layout-stable', async ({ page }, testInfo) => {
  invariantIds.forEach(id => annotateLiveInvariant(testInfo, id))
  const collectors = installEvidenceCollectors(page)
  const baseUrl = liveCanaryUrl()
  const liveChecksRequired = process.env.LIVE_SITE_TESTS === 'true' || process.env.LIVE_CLUSTER_TESTS === 'true'

  if (!baseUrl) {
    testInfo.annotations.push({ type: 'config-dependent-skip', description: 'LIVE_CANARY_CONSOLE_URL, SELF_HOSTED_CONSOLE_URL, VISUAL_LOGIN_BASE_URL, or PLAYWRIGHT_BASE_URL is not configured.' })
    if (!liveChecksRequired) test.skip(true, 'live canary URL is not configured')
    expect(baseUrl, 'live canary URL is required when LIVE_SITE_TESTS or LIVE_CLUSTER_TESTS is true').toBeTruthy()
    return
  }

  const expectedContexts = readPositiveIntEnv('LIVE_CLUSTER_EXPECTED_CONTEXTS', 3)
  const expectedReadyNodes = readPositiveIntEnv('LIVE_CLUSTER_EXPECTED_READY_NODES', 6)
  const groundTruth = collectK8sGroundTruth()

  try {
    if (groundTruth.skipped) {
      testInfo.annotations.push({ type: 'config-dependent-skip', description: groundTruth.skipped })
      if (!liveChecksRequired) test.skip(true, groundTruth.skipped)
      expect(groundTruth.skipped, 'live ground truth must be configured when live checks are required').toBeUndefined()
    }

    expect(groundTruth.contexts.reachable, `expected ${expectedContexts} reachable live cluster contexts`).toBe(expectedContexts)
    expect(groundTruth.nodes.total, `expected ${expectedReadyNodes} live cluster nodes`).toBe(expectedReadyNodes)
    expect(groundTruth.nodes.ready, `expected ${expectedReadyNodes} Ready live cluster nodes`).toBe(expectedReadyNodes)

    await establishLiveCanarySession(page, baseUrl)
    collectors.consoleErrors.length = 0
    collectors.consoleWarnings.length = 0
    collectors.pageErrors.length = 0
    collectors.failedRequests.length = 0
    collectors.errorResponses.length = 0
    const response = await gotoLiveCanaryRoute(page, baseUrl, '/clusters?groundtruth=1')
    expect(response?.ok(), 'live canary /clusters route must be reachable').toBeTruthy()
    await assertLiveDashboardShell(page)
    await assertNoForbiddenLiveUi(page)
    await expectGroundTruthField(page, 'clusters-total', groundTruth.contexts.reachable)
    await expectGroundTruthField(page, 'nodes-ready', groundTruth.nodes.ready)
    await expectGroundTruthField(page, 'nodes-total', groundTruth.nodes.total)
    await expectGroundTruthField(page, 'pods-total', groundTruth.pods.total)
    await expectGroundTruthField(page, 'pods-running', groundTruth.pods.running)
    await expectGroundTruthField(page, 'pods-pending', groundTruth.pods.pending)
    await expectGroundTruthField(page, 'pods-crashloop', groundTruth.pods.crashLoopBackOff)
    await assertLiveLayoutStable(page)
    await assertNoVisibleTextCollisions(page)
    await assertNoUnexpectedLiveNetworkErrors(collectors, baseUrl)
    await assertNoCriticalRuntimeErrors(collectors, liveCanaryExpectedConsoleNoise)

    writeLiveSiteReport({
      target: 'canary',
      url: baseUrl,
      checks: {
        authenticatedDashboard: 'ok',
        forbiddenLiveUi: 'ok',
        groundtruth: 'ok',
        layout: 'ok',
        networkErrors: 'ok',
      },
      expected: {
        contexts: expectedContexts,
        readyNodes: expectedReadyNodes,
      },
    })
  } finally {
    await attachEvidenceOnFailure({
      page,
      testInfo,
      invariantIds,
      collectors,
      appMode: 'live-canary-groundtruth',
      boundingBoxes: [
        { label: 'main', locator: page.locator('main') },
        { label: 'clusters-page', locator: page.locator('[data-testid="clusters-page"]') },
      ],
    })
  }
})
