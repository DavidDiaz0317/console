import { defineConfig, devices } from '@playwright/test'

const isCI = Boolean(process.env.CI)
const baseURL = process.env.VISUAL_LOGIN_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4173'
const hasExternalBaseUrl = Boolean(process.env.VISUAL_LOGIN_BASE_URL || process.env.PLAYWRIGHT_BASE_URL)

export default defineConfig({
  testDir: '.',
  timeout: isCI ? 90_000 : 75_000,
  expect: { timeout: isCI ? 15_000 : 10_000 },
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1,
  reporter: isCI
    ? [
        ['list'],
        ['json', { outputFile: 'test-results/results.json' }],
        ['github'],
      ]
    : [['html', { open: 'never', outputFolder: 'visual-login-intensive-report' }], ['list']],
  use: {
    baseURL,
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'intensive-visual-login',
      testMatch: [
        'visual-intensive/*.spec.ts',
        'adequacy/*.spec.ts',
      ],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
    {
      name: 'intensive-mobile-visual-login',
      testMatch: ['visual-intensive/responsive-matrix.spec.ts'],
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'semantic-groundtruth',
      testMatch: ['semantic/*.spec.ts'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
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
  outputDir: 'test-results/visual-login-intensive',
})
