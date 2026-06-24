import { test, expect, type Page } from '@playwright/test'
import { collectK8sGroundTruth } from '../../../harness/groundtruth/collectK8sGroundTruth'
import { establishLiveCanarySession, liveCanaryUrl } from '../helpers/liveSiteAssertions'

function readPositiveIntEnv(name: string, fallback: number) {
  const rawValue = process.env[name]
  const value = Number(rawValue || fallback)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got ${rawValue}`)
  }
  return value
}

const EXPECTED_LIVE_CONTEXTS = readPositiveIntEnv('LIVE_CLUSTER_EXPECTED_CONTEXTS', 3)
const EXPECTED_OCI_OKE_READY_NODES = readPositiveIntEnv('LIVE_CLUSTER_EXPECTED_READY_NODES', 6)

async function expectGroundTruthField(page: Page, field: string, expected: number) {
  const marker = page.locator(`[data-groundtruth-field="${field}"]`)
  await expect(marker.first(), `missing data-groundtruth-field="${field}" marker`).toBeAttached()
  await expect(marker.first(), `data-groundtruth-field="${field}" should match live Kubernetes ground truth`).toHaveText(String(expected), {
    timeout: 20_000,
  })
}

test('cluster dashboard can be checked against live Kubernetes ground truth @intensive @groundtruth @invariant:cluster-dashboard-groundtruth-match', async ({ page }, testInfo) => {
  testInfo.annotations.push({ type: 'invariant', description: 'cluster-dashboard-groundtruth-match' })

  const liveChecksRequired = process.env.LIVE_CLUSTER_TESTS === 'true'
  const groundTruth = collectK8sGroundTruth()
  if (groundTruth.skipped) {
    testInfo.annotations.push({ type: 'config-dependent-skip', description: groundTruth.skipped })
    if (!liveChecksRequired) {
      test.skip(true, groundTruth.skipped)
    }
    expect(groundTruth.skipped, 'live ground truth must be configured when LIVE_CLUSTER_TESTS=true').toBeUndefined()
  }

  const selfHostedUrl = liveCanaryUrl()
  if (!selfHostedUrl) {
    if (!liveChecksRequired) {
      test.skip(true, 'SELF_HOSTED_CONSOLE_URL, VISUAL_LOGIN_BASE_URL, or PLAYWRIGHT_BASE_URL is required for UI ground-truth comparison.')
    }
    expect(selfHostedUrl, 'SELF_HOSTED_CONSOLE_URL is required when LIVE_CLUSTER_TESTS=true').toBeTruthy()
    return
  }

  expect(groundTruth.contexts.reachable, `expected ${EXPECTED_LIVE_CONTEXTS} reachable live cluster contexts`).toBe(EXPECTED_LIVE_CONTEXTS)
  expect(groundTruth.nodes.total, `OKE live clusters must expose exactly ${EXPECTED_OCI_OKE_READY_NODES} nodes`).toBe(EXPECTED_OCI_OKE_READY_NODES)
  expect(groundTruth.nodes.ready, `all ${EXPECTED_OCI_OKE_READY_NODES} OKE live cluster nodes must be Ready`).toBe(EXPECTED_OCI_OKE_READY_NODES)

  await establishLiveCanarySession(page, selfHostedUrl)

  const response = await page.goto(new URL('/clusters?groundtruth=1', selfHostedUrl).toString(), { waitUntil: 'domcontentloaded' })
  expect(response?.ok(), 'self-hosted Console /clusters route must be reachable').toBeTruthy()

  await expect(page.locator('body')).not.toHaveText('', { timeout: 10_000 })
  await expectGroundTruthField(page, 'clusters-total', groundTruth.contexts.reachable)
  await expectGroundTruthField(page, 'nodes-ready', groundTruth.nodes.ready)
  await expectGroundTruthField(page, 'nodes-total', groundTruth.nodes.total)
  await expectGroundTruthField(page, 'pods-total', groundTruth.pods.total)
  await expectGroundTruthField(page, 'pods-running', groundTruth.pods.running)
  await expectGroundTruthField(page, 'pods-pending', groundTruth.pods.pending)
  await expectGroundTruthField(page, 'pods-crashloop', groundTruth.pods.crashLoopBackOff)
})
