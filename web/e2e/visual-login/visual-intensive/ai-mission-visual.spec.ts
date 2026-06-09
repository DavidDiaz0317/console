import { test } from '@playwright/test'
import {
  annotateInvariants,
  assertLocatorInsideViewport,
  setupLocalDemo,
} from '../helpers/visualLoginAssertions'

test('AI Mission entrypoint is usable when enabled @intensive @visual @invariant:ai-mission-entrypoint-usable-if-enabled', async ({ page }, testInfo) => {
  annotateInvariants(testInfo, ['ai-mission-entrypoint-usable-if-enabled'])
  await setupLocalDemo(page, '/')
  const entrypoint = page.getByRole('button', { name: /AI Missions|Try AI Missions|Explore/i })
    .or(page.locator('[data-tour="ai-missions-toggle"]'))
    .or(page.getByText(/AI Missions/i))
  const visible = await entrypoint.first().isVisible({ timeout: 5_000 }).catch(() => false)

  if (!visible && process.env.VISUAL_LOGIN_AI_MISSION_ENABLED !== 'true') {
    testInfo.annotations.push({
      type: 'config-dependent-skip',
      description: 'AI Mission entrypoint not present/enabled in this configuration.',
    })
    return
  }

  await assertLocatorInsideViewport(page, entrypoint, 'AI Mission entrypoint')
})
