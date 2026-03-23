import { test, expect } from '@playwright/test'

test('LLMdFlow card fullscreen renders wide', async ({ page }) => {
  // Set up demo mode
  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
  })

  // Navigate to the perf test page that renders all cards
  await page.goto('/__perf/all-cards?batch=0&size=200')
  await page.waitForLoadState('domcontentloaded')

  // Find the llmd_flow card by type
  const card = page.locator('[data-card-type="llmd_flow"]')
  await expect(card).toBeVisible({ timeout: 15000 })

  // Find and click the expand button within the card
  const expandBtn = card.locator('button[aria-label*="xpand"], button[aria-label*="ullscreen"], button:has(svg.lucide-maximize-2)').first()
  await expect(expandBtn).toBeVisible({ timeout: 5000 })
  await expandBtn.click()

  // Wait for the modal
  const modal = page.locator('[role="dialog"]')
  await expect(modal).toBeVisible({ timeout: 5000 })

  // Wait for SVG to render
  await page.waitForTimeout(1000)

  // Get the flow diagram SVG (has viewBox with 140 height, not the tiny 24x24 icon SVGs)
  const flowSvg = modal.locator('svg[viewBox*="140"]')
  await expect(flowSvg).toBeVisible({ timeout: 3000 })
  const svgViewBox = await flowSvg.getAttribute('viewBox')
  console.log('SVG viewBox:', svgViewBox)

  // Should be the expanded viewBox (170 width)
  expect(svgViewBox).toContain('170')

  // Get modal dimensions
  const modalBox = await modal.boundingBox()
  console.log('Modal dimensions:', JSON.stringify(modalBox))

  // Get SVG dimensions
  const svgBox = await flowSvg.boundingBox()
  console.log('SVG dimensions:', JSON.stringify(svgBox))

  // SVG should use a good portion of the modal width
  if (modalBox && svgBox) {
    const widthRatio = svgBox.width / modalBox.width
    console.log('SVG width ratio:', widthRatio)
    expect(widthRatio).toBeGreaterThan(0.7)
  }

  // Take screenshot
  await page.screenshot({ path: 'test-results/llmd-flow-fullscreen.png', fullPage: false })
  console.log('Screenshot saved to test-results/llmd-flow-fullscreen.png')

  // Close modal
  await page.keyboard.press('Escape')
  await expect(modal).not.toBeVisible({ timeout: 3000 })
})
