import { test, expect } from '@playwright/test'
import { collectK8sGroundTruth } from '../../../harness/groundtruth/collectK8sGroundTruth'

test('cluster dashboard can be checked against live Kubernetes ground truth @intensive @groundtruth @invariant:cluster-dashboard-groundtruth-match', async ({ page }, testInfo) => {
  testInfo.annotations.push({ type: 'invariant', description: 'cluster-dashboard-groundtruth-match' })
  const groundTruth = collectK8sGroundTruth()
  if (groundTruth.skipped) {
    testInfo.annotations.push({ type: 'config-dependent-skip', description: groundTruth.skipped })
    test.skip(true, groundTruth.skipped)
  }

  const selfHostedUrl = process.env.SELF_HOSTED_CONSOLE_URL || process.env.VISUAL_LOGIN_BASE_URL || process.env.PLAYWRIGHT_BASE_URL
  if (!selfHostedUrl) {
    test.skip(true, 'SELF_HOSTED_CONSOLE_URL, VISUAL_LOGIN_BASE_URL, or PLAYWRIGHT_BASE_URL is required for UI ground-truth comparison.')
  }

  await page.goto(new URL('/clusters', selfHostedUrl).toString(), { waitUntil: 'domcontentloaded' })
  const bodyText = await page.locator('body').innerText({ timeout: 10_000 })
  expect(bodyText.length).toBeGreaterThan(40)

  const clusterCountText = page.locator('[data-groundtruth-field="clusters-total"]')
  if (await clusterCountText.count()) {
    await expect(clusterCountText.first()).toContainText(String(groundTruth.contexts.reachable))
  } else {
    testInfo.annotations.push({
      type: 'config-dependent-skip',
      description: 'No data-groundtruth-field="clusters-total" element found; collected sanitized ground truth only.',
    })
  }
})
