import { test, expect, type Page } from '@playwright/test'
import { collectK8sGroundTruth } from '../../../harness/groundtruth/collectK8sGroundTruth'

const EXPECTED_LIVE_CONTEXTS = 1
const EXPECTED_OCI_OKE_NODES = 3

async function expectGroundTruthField(page: Page, field: string, expected: number) {
  const marker = page.locator(`[data-groundtruth-field="${field}"]`)
  await expect(marker, `missing data-groundtruth-field="${field}" marker`).toHaveCount(1)
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

  const selfHostedUrl = process.env.SELF_HOSTED_CONSOLE_URL || process.env.VISUAL_LOGIN_BASE_URL || process.env.PLAYWRIGHT_BASE_URL
  if (!selfHostedUrl) {
    if (!liveChecksRequired) {
      test.skip(true, 'SELF_HOSTED_CONSOLE_URL, VISUAL_LOGIN_BASE_URL, or PLAYWRIGHT_BASE_URL is required for UI ground-truth comparison.')
    }
    expect(selfHostedUrl, 'SELF_HOSTED_CONSOLE_URL is required when LIVE_CLUSTER_TESTS=true').toBeTruthy()
    return
  }

  expect(groundTruth.contexts.reachable, 'expected one reachable live cluster context').toBe(EXPECTED_LIVE_CONTEXTS)
  expect(groundTruth.nodes.total, 'OKE live cluster must expose exactly three nodes').toBe(EXPECTED_OCI_OKE_NODES)
  expect(groundTruth.nodes.ready, 'all OKE live cluster nodes must be Ready').toBe(EXPECTED_OCI_OKE_NODES)

  const response = await page.goto(new URL('/clusters?groundtruth=1', selfHostedUrl).toString(), { waitUntil: 'domcontentloaded' })
  expect(response?.ok(), 'self-hosted Console /clusters route must be reachable').toBeTruthy()

  await expect(page.locator('body')).not.toHaveText('', { timeout: 10_000 })
  await expectGroundTruthField(page, 'clusters-total', groundTruth.contexts.reachable)
  await expectGroundTruthField(page, 'nodes-ready', groundTruth.nodes.ready)
  await expectGroundTruthField(page, 'nodes-total', groundTruth.nodes.total)
  await expectGroundTruthField(page, 'pods-running', groundTruth.pods.running)
  await expectGroundTruthField(page, 'pods-pending', groundTruth.pods.pending)
  await expectGroundTruthField(page, 'pods-crashloop', groundTruth.pods.crashLoopBackOff)
})
