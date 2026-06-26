import { test, expect } from '@playwright/test'
import { applyMutation } from '../../../harness/mutations/applyMutation'
import { clearMutation } from '../../../harness/mutations/clearMutation'
import { getMutationScenario } from '../../../harness/mutations/mutationRegistry'
import {
  assertHostedDemoNoLoginInvariant,
  setupLocalDemo,
} from '../helpers/visualLoginAssertions'

test('harmless timestamp and ordering changes do not fail core demo no-login invariant @intensive @adequacy', async ({ page }) => {
  await setupLocalDemo(page, '/')
  await page.evaluate(() => {
    const main = document.querySelector('main')
    const harmless = document.createElement('p')
    harmless.textContent = `Last updated ${new Date().toISOString()}`
    harmless.setAttribute('data-testid', 'harmless-timestamp')
    main?.appendChild(harmless)
  })
  await assertHostedDemoNoLoginInvariant(page)
})

test('hosted demo redirect/login false negative is detected @intensive @adequacy @mutation', async ({ page }) => {
  const scenario = getMutationScenario('force-demo-login')
  await applyMutation(page, scenario)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  let failed = false
  try {
    await assertHostedDemoNoLoginInvariant(page)
  } catch {
    failed = true
  } finally {
    await clearMutation(page)
  }
  expect(failed, 'force-demo-login must fail the strong demo no-login invariant').toBe(true)
})
