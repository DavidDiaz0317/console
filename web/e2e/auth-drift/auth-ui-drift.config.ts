import { defineConfig, devices } from '@playwright/test'

const IS_CI = !!process.env.CI
const DEMO_URL = process.env.AUTH_DRIFT_DEMO_URL || 'https://console.kubestellar.io'
const LOCAL_OAUTH_URL = process.env.AUTH_DRIFT_LOGIN_URL || 'http://127.0.0.1:4176/login'
const USE_MANAGED_LOCAL_PREVIEW = !process.env.AUTH_DRIFT_LOGIN_URL && process.env.AUTH_DRIFT_DISABLE_WEBSERVER !== '1'
const EXPECT_TIMEOUT_MS = IS_CI ? 30_000 : 15_000

export default defineConfig({
  testDir: '.',
  testMatch: '*-drift.spec.ts',
  timeout: IS_CI ? 120_000 : 60_000,
  expect: {
    timeout: EXPECT_TIMEOUT_MS,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.025,
    },
  },
  retries: IS_CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never', outputFolder: '../test-results/auth-drift-report' }],
    ['json', { outputFile: '../test-results/auth-drift-results/results.json' }],
    ['list'],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: DEMO_URL,
    colorScheme: 'dark',
    locale: 'en-US',
    screenshot: 'only-on-failure',
    timezoneId: 'America/New_York',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: USE_MANAGED_LOCAL_PREVIEW
    ? {
        command: 'npm run dev -- --host 127.0.0.1 --port 4176',
        url: LOCAL_OAUTH_URL,
        timeout: 120_000,
        reuseExistingServer: !IS_CI,
        stdout: 'pipe',
        stderr: 'pipe',
      }
    : undefined,
  outputDir: '../test-results/auth-drift',
  snapshotPathTemplate: '__screenshots__/{projectName}/{arg}{ext}',
})
