import { defineConfig } from '@playwright/test'

const isCI = Boolean(process.env.CI)
const baseURL = process.env.VISUAL_LOGIN_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4173'
const hasExternalBaseUrl = Boolean(process.env.VISUAL_LOGIN_BASE_URL || process.env.PLAYWRIGHT_BASE_URL)

export default defineConfig({
  testDir: '.',
  testMatch: [
    'auth/*.spec.ts',
    'visual-pr/*.spec.ts',
  ],
  timeout: isCI ? 35_000 : 45_000,
  expect: { timeout: isCI ? 8_000 : 10_000 },
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 1 : 2,
  reporter: isCI
    ? [
        ['list'],
        ['json', { outputFile: 'test-results/results.json' }],
        ['github'],
      ]
    : [['html', { open: 'never', outputFolder: 'visual-login-pr-report' }], ['list']],
  use: {
    baseURL,
    browserName: 'chromium',
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'pr-visual-login' },
  ],
  webServer: hasExternalBaseUrl
    ? undefined
    : {
        command: 'npm run dev -- --host 127.0.0.1 --port 4173',
        url: baseURL,
        timeout: 120_000,
        reuseExistingServer: !isCI,
        stdout: 'pipe',
        stderr: 'pipe',
      },
  outputDir: 'test-results/visual-login-pr',
})
