import { test } from '@playwright/test'
import {
  annotateInvariants,
  assertDashboardContentVisible,
  assertHostedDemoNoLoginInvariant,
  setupLocalDemo,
} from '../helpers/visualLoginAssertions'

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 900, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]

for (const viewport of viewports) {
  test(`demo dashboard renders in ${viewport.name} viewport @intensive @visual @invariant:demo-dashboard-visual-smoke`, async ({ page }, testInfo) => {
    annotateInvariants(testInfo, ['demo-dashboard-visual-smoke', 'hosted-demo-no-login'])
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await setupLocalDemo(page, '/')
    await assertHostedDemoNoLoginInvariant(page)
    await assertDashboardContentVisible(page)
  })
}
