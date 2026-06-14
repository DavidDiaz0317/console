import { test, expect } from '@playwright/test'

test('hosted demo does not require login @pr-visual @auth @invariant:hosted-demo-no-login', async ({ page }, testInfo) => {
  testInfo.annotations.push({ type: 'invariant', description: 'hosted-demo-no-login' })
  await page.goto('/')
  await expect(page).not.toHaveURL(/\/(?:login|signin|auth)(?:$|[/?#])/i)
  await expect(page.getByTestId('github-login-button')).toHaveCount(0)
  await expect(page.getByTestId('dashboard-header').or(page.getByText(/KubeStellar|Dashboard|Clusters|Workloads/i)).first()).toBeVisible()
})
