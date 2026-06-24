import { test, expect } from '@playwright/test'
import { attachEvidenceOnFailure } from '../../../harness/evidence/attachEvidence'
import { installEvidenceCollectors } from '../../../harness/evidence/collectEvidence'
import { collectK8sGroundTruth } from '../../../harness/groundtruth/collectK8sGroundTruth'
import { assertNoCriticalRuntimeErrors } from '../helpers/visualLoginAssertions'
import {
  annotateLiveInvariant,
  assertLiveDashboardShell,
  assertLiveLayoutStable,
  assertLiveRouteContainsAll,
  assertNoForbiddenLiveUi,
  assertNoUnexpectedLiveNetworkErrors,
  assertNoVisibleTextCollisions,
  establishLiveCanarySession,
  gotoLiveCanaryRoute,
  liveCanaryUrl,
  recordLiveUiFailures,
  writeLiveRouteEvidence,
  writeLiveSiteReport,
} from '../helpers/liveSiteAssertions'

const invariantIds = [
  'live-core-pages-render-real-data',
  'live-canary-ui-layout-stable',
  'live-ui-no-demo-artifacts',
  'live-ui-no-text-collisions',
  'live-ui-no-unexpected-network-errors',
  'no-critical-runtime-errors',
]

const liveCorePageExpectedConsoleNoise = [
  /Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/i,
  /Failed to load resource: the server responded with a status of 403 \(Forbidden\)/i,
  /Failed to load resource: the server responded with a status of 405 \(Method Not Allowed\)/i,
  /\[Missions\] Failed to connect to agent: Error: CONNECTION_FAILED/i,
]

type CoreRoute = {
  route: string
  label: string
  expectedMarkers: (groundTruth: ReturnType<typeof collectK8sGroundTruth>) => Array<string | RegExp>
}

const coreRoutes: CoreRoute[] = [
  {
    route: '/clusters',
    label: 'clusters',
    expectedMarkers: groundTruth => ['Clusters', String(groundTruth.contexts.reachable), String(groundTruth.nodes.total)],
  },
  {
    route: '/nodes',
    label: 'nodes',
    expectedMarkers: groundTruth => ['Nodes', String(groundTruth.nodes.ready), /Ready/i],
  },
  {
    route: '/pods',
    label: 'pods',
    expectedMarkers: groundTruth => ['Pods', String(groundTruth.pods.running), /Running/i],
  },
  {
    route: '/namespaces',
    label: 'namespaces',
    expectedMarkers: groundTruth => ['Namespaces', String(groundTruth.namespaces.total), /kube-system/i],
  },
  {
    route: '/deployments',
    label: 'deployments',
    expectedMarkers: groundTruth => ['Deployments', String(groundTruth.deployments.available), /Available/i],
  },
  {
    route: '/alerts',
    label: 'alerts',
    expectedMarkers: () => ['Alerts', /critical|warning|normal|issue|alert/i],
  },
]

for (const coreRoute of coreRoutes) {
  test(`live core page renders real data: ${coreRoute.label} @intensive @live-site @core-page @invariant:live-core-pages-render-real-data`, async ({ page }, testInfo) => {
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

    const groundTruth = collectK8sGroundTruth()

    try {
      if (groundTruth.skipped) {
        testInfo.annotations.push({ type: 'config-dependent-skip', description: groundTruth.skipped })
        if (!liveChecksRequired) test.skip(true, groundTruth.skipped)
        expect(groundTruth.skipped, 'live ground truth must be configured when live checks are required').toBeUndefined()
      }

      await establishLiveCanarySession(page, baseUrl)
      collectors.consoleErrors.length = 0
      collectors.consoleWarnings.length = 0
      collectors.pageErrors.length = 0
      collectors.failedRequests.length = 0
      collectors.errorResponses.length = 0

      const response = await gotoLiveCanaryRoute(page, baseUrl, coreRoute.route)
      if (!response?.ok()) {
        await recordLiveUiFailures(page, {
          routeFailures: [{
            route: coreRoute.route,
            reason: `route returned HTTP ${response?.status() ?? 'no response'}`,
          }],
        })
      }
      expect(response?.ok(), `live canary ${coreRoute.route} route must be reachable`).toBeTruthy()
      await assertLiveDashboardShell(page)
      await assertLiveRouteContainsAll(page, coreRoute.route, coreRoute.expectedMarkers(groundTruth))
      await assertNoForbiddenLiveUi(page)
      await assertLiveLayoutStable(page)
      await assertNoVisibleTextCollisions(page)
      await assertNoUnexpectedLiveNetworkErrors(collectors, baseUrl)
      await assertNoCriticalRuntimeErrors(collectors, liveCorePageExpectedConsoleNoise)

      writeLiveRouteEvidence({
        route: coreRoute.route,
        kind: 'core-page-pass',
        label: coreRoute.label,
      })
      writeLiveSiteReport({
        target: 'canary',
        route: coreRoute.route,
        checks: {
          corePage: 'ok',
          forbiddenLiveUi: 'ok',
          layout: 'ok',
          networkErrors: 'ok',
        },
      })
    } finally {
      await attachEvidenceOnFailure({
        page,
        testInfo,
        invariantIds,
        collectors,
        appMode: `live-core-page-${coreRoute.label}`,
        boundingBoxes: [
          { label: 'main', locator: page.locator('main') },
        ],
      })
    }
  })
}
