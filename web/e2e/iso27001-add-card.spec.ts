import { test, expect } from '@playwright/test'

test('ISO 27001 Audit card appears in Add Card dialog under Security Posture', async ({ page }) => {
  // Navigate to security dashboard
  await page.goto('http://localhost:5174/security')
  await page.waitForLoadState('networkidle')

  // Look for an "Add Card" button and click it
  const addCardBtn = page.locator('button', { hasText: /add card/i }).first()
  await expect(addCardBtn).toBeVisible({ timeout: 10000 })
  await addCardBtn.click()

  // Wait for the modal to open
  const modal = page.locator('[role="dialog"], [class*="modal"], [class*="Modal"]').first()
  await expect(modal).toBeVisible({ timeout: 5000 })

  // Take a screenshot of the modal
  await page.screenshot({ path: '/tmp/add-card-modal.png', fullPage: false })

  // Search for ISO 27001
  const searchInput = modal.locator('input[type="text"], input[type="search"], input[placeholder*="earch"]').first()
  if (await searchInput.isVisible()) {
    await searchInput.fill('ISO 27001')
    await page.waitForTimeout(500)
  }

  await page.screenshot({ path: '/tmp/add-card-search-iso.png', fullPage: false })

  // Check if the card is listed
  const isoCard = page.locator('text=ISO 27001').first()
  const isVisible = await isoCard.isVisible().catch(() => false)

  if (!isVisible) {
    // Maybe search didn't work - scroll through categories and look for Security Posture
    const securityPosture = page.locator('text=Security Posture').first()
    if (await securityPosture.isVisible().catch(() => false)) {
      await securityPosture.click()
      await page.waitForTimeout(500)
    }
    await page.screenshot({ path: '/tmp/add-card-security-posture.png', fullPage: false })
  }

  // Final check
  await expect(page.locator('text=ISO 27001')).toBeVisible({ timeout: 5000 })
})
