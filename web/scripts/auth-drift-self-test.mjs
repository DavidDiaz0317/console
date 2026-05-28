#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(scriptDir, '..')
const testResultsRoot = path.resolve(webRoot, 'e2e', 'test-results')
const reportRoot = path.join(testResultsRoot, 'auth-drift-self-test')
const logsDir = path.join(reportRoot, 'logs')
const screenshotRoot = path.join(reportRoot, 'screenshots')
const htmlReportPath = path.join(reportRoot, 'report.html')
const pdfReportPath = path.join(reportRoot, 'auth-drift-self-test-report.pdf')
const jsonReportPath = path.join(reportRoot, 'results.json')
const authDriftConfig = 'e2e/auth-drift/auth-ui-drift.config.ts'
const oauthSpec = 'e2e/auth-drift/oauth-staging-login-drift.spec.ts'
const hostedSpec = 'e2e/auth-drift/hosted-demo-auth-drift.spec.ts'
const playwrightOutputDir = path.join(testResultsRoot, 'auth-drift')
const localPreviewUrl = 'http://127.0.0.1:4176/login'
const localPreviewPort = '4176'
const scenarioTimeoutMs = 180_000

const localPlaywrightCli = path.join(webRoot, 'node_modules', '@playwright', 'test', 'cli.js')
const localViteCli = path.join(webRoot, 'node_modules', 'vite', 'bin', 'vite.js')
const playwrightCommand = existsSync(localPlaywrightCli)
  ? process.execPath
  : process.platform === 'win32'
    ? 'npx.cmd'
    : 'npx'
const playwrightCommandPrefix = existsSync(localPlaywrightCli) ? [localPlaywrightCli] : ['playwright']

const scenarios = [
  {
    category: 'Public demo no-login contract',
    id: 'pass-public-demo-root-no-login',
    title: 'Public console root stays in demo mode without login',
    description: 'Checks console.kubestellar.io itself does not expose login UI on the dashboard route.',
    expected: 'pass',
    grep: 'root route renders demo dashboard without any login workflow',
    mode: '',
    spec: hostedSpec,
  },
  {
    category: 'Public demo no-login contract',
    id: 'pass-public-demo-login-no-login',
    title: 'Public console /login auto-enters demo mode without auth UI',
    description: 'Checks direct navigation to /login does not reveal GitHub auth on the public demo.',
    expected: 'pass',
    grep: 'direct /login route auto-enters demo mode instead of exposing auth UI',
    mode: '',
    spec: hostedSpec,
  },
  {
    category: 'Public demo no-login contract',
    id: 'fail-public-demo-login-present',
    title: 'Unexpected public-demo login page is detected',
    description: 'Injects a fake hosted-demo regression where the public console shows a GitHub login page.',
    expected: 'fail',
    grep: 'root route renders demo dashboard without any login workflow',
    hostedMode: 'login-present',
    mode: '',
    spec: hostedSpec,
  },
  {
    category: 'OAuth login expected state',
    id: 'pass-oauth-login-ui',
    title: 'OAuth login UI passes with expected local OAuth chrome',
    description: 'Checks the expected OAuth login card, branding, GitHub button, and absent fallback UI.',
    expected: 'pass',
    grep: 'OAuth staging login page renders stable GitHub login UI',
    mode: '',
    spec: oauthSpec,
  },
  {
    category: 'OAuth login expected state',
    id: 'pass-mobile-login-card',
    title: 'OAuth login card passes mobile fit check',
    description: 'Checks the login card stays within a mobile viewport and matches the mobile baseline.',
    expected: 'pass',
    grep: 'OAuth staging login card fits mobile viewport',
    mode: '',
    spec: oauthSpec,
  },
  {
    category: 'OAuth login expected state',
    id: 'pass-auth-route',
    title: 'GitHub button passes backend route wiring check',
    description: 'Checks the GitHub login button still points at the backend OAuth entry route.',
    expected: 'pass',
    grep: 'OAuth staging login button points at backend auth route',
    mode: '',
    spec: oauthSpec,
  },
  {
    category: 'OAuth login drift examples',
    id: 'fail-missing-github-button',
    title: 'Missing GitHub button is detected as UI drift',
    description: 'Hides the GitHub button so the visibility contract fails.',
    expected: 'fail',
    grep: 'OAuth staging login page renders stable GitHub login UI',
    mode: 'missing-github-button',
    spec: oauthSpec,
  },
  {
    category: 'OAuth login drift examples',
    id: 'fail-disabled-github-button',
    title: 'Disabled GitHub button is detected as state drift',
    description: 'Disables the GitHub button so the enabled-state contract fails.',
    expected: 'fail',
    grep: 'OAuth staging login page renders stable GitHub login UI',
    mode: 'disabled-github-button',
    spec: oauthSpec,
  },
  {
    category: 'OAuth login drift examples',
    id: 'fail-renamed-github-button',
    title: 'Changed GitHub button label is detected as copy drift',
    description: 'Renames the GitHub button so the expected login copy no longer matches.',
    expected: 'fail',
    grep: 'OAuth staging login page renders stable GitHub login UI',
    mode: 'renamed-github-button',
    spec: oauthSpec,
  },
  {
    category: 'OAuth login drift examples',
    id: 'fail-brand-heading-changed',
    title: 'Changed KubeStellar heading is detected as branding drift',
    description: 'Changes the login card heading so the expected KubeStellar branding is absent.',
    expected: 'fail',
    grep: 'OAuth staging login page renders stable GitHub login UI',
    mode: 'brand-heading-changed',
    spec: oauthSpec,
  },
  {
    category: 'OAuth visual diff example',
    id: 'fail-visual-card-drift',
    title: 'Login card visual drift produces actual/expected/diff evidence',
    description: 'Changes button styling so Playwright emits a visual baseline diff for the login card.',
    expected: 'fail',
    grep: 'OAuth staging login page renders stable GitHub login UI',
    mode: 'visual-card-drift',
    spec: oauthSpec,
  },
  {
    category: 'OAuth login drift examples',
    id: 'fail-mobile-card-overflow',
    title: 'Mobile card overflow is detected as layout drift',
    description: 'Forces the login card wider than the mobile viewport so the layout assertion fails.',
    expected: 'fail',
    grep: 'OAuth staging login card fits mobile viewport',
    mode: 'mobile-card-overflow',
    spec: oauthSpec,
  },
  {
    category: 'OAuth login drift examples',
    id: 'fail-setup-fallback-visible',
    title: 'OAuth setup fallback notice is detected as wrong UI state',
    description: 'Injects the OAuth setup notice so the login page state contract fails.',
    expected: 'fail',
    grep: 'OAuth staging login page renders stable GitHub login UI',
    mode: 'setup-fallback-visible',
    spec: oauthSpec,
  },
]

function assertReportPathIsSafe() {
  const relative = path.relative(testResultsRoot, reportRoot)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to clear report path outside test-results: ${reportRoot}`)
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function summarizeLog(stdout, stderr) {
  const combined = `${stdout || ''}\n${stderr || ''}`
  const lines = combined
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)

  const relevant = lines.filter((line) =>
    /Running|passed|failed|Error|expect|Timeout|toBeVisible|toHaveCount|toBeLessThanOrEqual|locator|Expected|Received/i.test(line)
  )

  return (relevant.length ? relevant : lines).slice(-28).join('\n')
}

async function listPngFiles(dir) {
  if (!existsSync(dir)) return []

  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => a.localeCompare(b))
}

async function listPngFilesRecursive(dir) {
  if (!existsSync(dir)) return []

  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return listPngFilesRecursive(entryPath)
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) return [entryPath]
    return []
  }))

  return files.flat().sort((a, b) => a.localeCompare(b))
}

async function copyPlaywrightScreenshotsToScenario(scenarioId) {
  const scenarioScreenshotDir = path.join(screenshotRoot, scenarioId)
  const screenshots = await listPngFilesRecursive(playwrightOutputDir)
  if (!screenshots.length) return

  await mkdir(scenarioScreenshotDir, { recursive: true })

  await Promise.all(screenshots.map(async (screenshotPath, index) => {
    const artifactLabel = path.basename(screenshotPath)
    const parentLabel = path.basename(path.dirname(screenshotPath))
    const targetPath = path.join(
      scenarioScreenshotDir,
      `playwright-${index + 1}-${parentLabel}-${artifactLabel}`
    )
    await copyFile(screenshotPath, targetPath)
  }))
}

async function canReachLocalPreview() {
  try {
    const response = await fetch(localPreviewUrl, {
      signal: AbortSignal.timeout(1_000),
    })
    return response.status < 500
  } catch {
    return false
  }
}

async function ensureLocalPreviewServer() {
  if (await canReachLocalPreview()) {
    console.log(`[auth-drift-self-test] Reusing existing local preview at ${localPreviewUrl}`)
    return {
      reused: true,
      stop: async () => {},
    }
  }

  if (!existsSync(localViteCli)) {
    throw new Error(`Cannot find Vite CLI at ${localViteCli}`)
  }

  const logPath = path.join(logsDir, 'dev-server.log')
  const logStream = createWriteStream(logPath, { flags: 'a' })
  const server = spawn(process.execPath, [
    localViteCli,
    '--host',
    '127.0.0.1',
    '--port',
    localPreviewPort,
  ], {
    cwd: webRoot,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  server.stdout.pipe(logStream, { end: false })
  server.stderr.pipe(logStream, { end: false })
  console.log(`[auth-drift-self-test] Started local Vite preview on ${localPreviewUrl}`)

  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) {
      logStream.end()
      throw new Error(`Local Vite preview exited before becoming ready. See ${logPath}`)
    }

    if (await canReachLocalPreview()) {
      return {
        reused: false,
        stop: async () => {
          if (server.exitCode !== null) {
            logStream.end()
            return
          }

          await new Promise((resolve) => {
            const forceKill = setTimeout(() => {
              if (server.exitCode === null) server.kill('SIGKILL')
              resolve()
            }, 5_000)

            server.once('exit', () => {
              clearTimeout(forceKill)
              resolve()
            })

            server.kill('SIGTERM')
          })
          logStream.end()
        },
      }
    }

    await sleep(500)
  }

  server.kill('SIGTERM')
  logStream.end()
  throw new Error(`Timed out waiting for local Vite preview at ${localPreviewUrl}. See ${logPath}`)
}

async function imageToDataUri(filePath) {
  const image = await readFile(filePath)
  return `data:image/png;base64,${image.toString('base64')}`
}

function buildScenarioEnv(scenario) {
  const env = {
    ...process.env,
    AUTH_DRIFT_DISABLE_WEBSERVER: '1',
    AUTH_DRIFT_SELF_TEST_ARTIFACT_DIR: reportRoot,
    AUTH_DRIFT_SELF_TEST_SCENARIO: scenario.id,
  }

  delete env.AUTH_DRIFT_LOGIN_URL
  delete env.AUTH_DRIFT_SELF_TEST_MODE
  delete env.AUTH_DRIFT_HOSTED_SELF_TEST_MODE

  if (scenario.mode) {
    env.AUTH_DRIFT_SELF_TEST_MODE = scenario.mode
  }

  if (scenario.hostedMode) {
    env.AUTH_DRIFT_HOSTED_SELF_TEST_MODE = scenario.hostedMode
  }

  return env
}

async function runScenario(scenario) {
  const args = [
    ...playwrightCommandPrefix,
    'test',
    '--config',
    authDriftConfig,
    scenario.spec,
    '--grep',
    scenario.grep,
    '--reporter=list',
  ]

  const startedAt = new Date()
  console.log(`[auth-drift-self-test] ${scenario.id}: expected ${scenario.expected}`)

  const result = spawnSync(playwrightCommand, args, {
    cwd: webRoot,
    env: buildScenarioEnv(scenario),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: scenarioTimeoutMs,
  })

  const finishedAt = new Date()
  const timedOut = result.error?.code === 'ETIMEDOUT'
  const completed = !result.error && !result.signal
  const exitCode = typeof result.status === 'number' ? result.status : 1
  const actual = exitCode === 0 ? 'pass' : 'fail'
  const matched = completed && actual === scenario.expected
  const command = `${path.basename(playwrightCommand)} ${args.join(' ')}`
  const stdoutPath = path.join(logsDir, `${scenario.id}.stdout.log`)
  const stderrPath = path.join(logsDir, `${scenario.id}.stderr.log`)

  await writeFile(stdoutPath, result.stdout || '')
  await writeFile(stderrPath, result.stderr || '')
  await copyPlaywrightScreenshotsToScenario(scenario.id)

  const screenshots = await listPngFiles(path.join(screenshotRoot, scenario.id))

  return {
    ...scenario,
    actual,
    command,
    completed,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    error: result.error ? String(result.error.message || result.error) : '',
    exitCode,
    finishedAt: finishedAt.toISOString(),
    matched,
    screenshots,
    startedAt: startedAt.toISOString(),
    stderrPath,
    stdoutPath,
    timedOut,
    summaryLog: summarizeLog(result.stdout, result.stderr),
  }
}

async function buildHtmlReport(results) {
  const generatedAt = new Date().toISOString()
  const passedHarnessChecks = results.filter((result) => result.matched).length
  const scenarioBlocks = await Promise.all(results.map(async (result) => {
    const statusClass = result.matched ? 'ok' : 'bad'
    const screenshotBlocks = await Promise.all(result.screenshots.map(async (screenshotPath) => {
      const dataUri = await imageToDataUri(screenshotPath)
      const label = path.basename(screenshotPath)
      return `
        <figure>
          <img src="${dataUri}" alt="${escapeHtml(label)}" />
          <figcaption>${escapeHtml(label)}</figcaption>
        </figure>
      `
    }))

    return `
      <section class="scenario">
        <div class="scenario-header">
          <div>
            <h2>${escapeHtml(result.title)}</h2>
            <p class="scenario-id">${escapeHtml(result.id)}</p>
          </div>
          <span class="pill ${statusClass}">${result.matched ? 'Desired outcome reached' : 'Needs attention'}</span>
        </div>
        <dl>
          <div><dt>Category</dt><dd>${escapeHtml(result.category || 'Auth drift')}</dd></div>
          <div><dt>Expected test outcome</dt><dd>${escapeHtml(result.expected.toUpperCase())}</dd></div>
          <div><dt>Actual test outcome</dt><dd>${escapeHtml(result.actual.toUpperCase())}</dd></div>
          <div><dt>Exit code</dt><dd>${escapeHtml(result.exitCode)}</dd></div>
          <div><dt>Duration</dt><dd>${Math.round(result.durationMs / 100) / 10}s</dd></div>
          <div><dt>Injected mode</dt><dd>${escapeHtml(result.mode || result.hostedMode || 'none')}</dd></div>
          <div><dt>Timed out</dt><dd>${result.timedOut ? 'yes' : 'no'}</dd></div>
        </dl>
        ${result.description ? `<p>${escapeHtml(result.description)}</p>` : ''}
        <p class="command">${escapeHtml(result.command)}</p>
        ${result.error ? `<p class="error">${escapeHtml(result.error)}</p>` : ''}
        <pre>${escapeHtml(result.summaryLog || 'No relevant output captured.')}</pre>
        <div class="screenshots">
          ${screenshotBlocks.join('\n') || '<p>No screenshots were captured for this scenario.</p>'}
        </div>
      </section>
    `
  }))

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Auth Drift Self-Test Report</title>
  <style>
    :root {
      color: #172033;
      background: #f6f7fb;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body {
      margin: 0;
      padding: 32px;
    }
    main {
      margin: 0 auto;
      max-width: 1060px;
    }
    header {
      border-bottom: 1px solid #d7dce8;
      margin-bottom: 24px;
      padding-bottom: 20px;
    }
    h1 {
      font-size: 30px;
      line-height: 1.2;
      margin: 0 0 10px;
    }
    h2 {
      font-size: 18px;
      line-height: 1.3;
      margin: 0;
    }
    p {
      line-height: 1.55;
    }
    .summary {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      margin: 24px 0;
    }
    .metric {
      background: #ffffff;
      border: 1px solid #dce1ea;
      border-radius: 8px;
      padding: 16px;
    }
    .metric strong {
      display: block;
      font-size: 26px;
      margin-bottom: 4px;
    }
    .scenario {
      background: #ffffff;
      border: 1px solid #dce1ea;
      border-radius: 8px;
      margin: 0 0 20px;
      padding: 20px;
      page-break-inside: avoid;
    }
    .scenario-header {
      align-items: flex-start;
      display: flex;
      gap: 16px;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .scenario-id {
      color: #5c667a;
      font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      margin: 4px 0 0;
    }
    .pill {
      border-radius: 999px;
      display: inline-block;
      font-size: 12px;
      font-weight: 700;
      padding: 6px 10px;
      white-space: nowrap;
    }
    .pill.ok {
      background: #e5f7ed;
      color: #17633a;
    }
    .pill.bad {
      background: #fde8e8;
      color: #9b1c1c;
    }
    dl {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      margin: 0 0 14px;
    }
    dt {
      color: #5c667a;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    dd {
      font-size: 14px;
      margin: 3px 0 0;
    }
    .command,
    pre {
      background: #111827;
      border-radius: 6px;
      color: #f8fafc;
      font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      overflow-wrap: anywhere;
      padding: 12px;
      white-space: pre-wrap;
    }
    .error {
      background: #fff1f1;
      border: 1px solid #f4b9b9;
      border-radius: 6px;
      color: #8a1f1f;
      padding: 10px 12px;
    }
    .screenshots {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      margin-top: 16px;
    }
    figure {
      border: 1px solid #dce1ea;
      border-radius: 8px;
      margin: 0;
      overflow: hidden;
    }
    img {
      background: #0b1020;
      display: block;
      max-width: 100%;
      width: 100%;
    }
    figcaption {
      color: #4b5565;
      font-size: 12px;
      padding: 8px 10px;
    }
    @media print {
      body {
        background: #ffffff;
        padding: 0;
      }
      .scenario {
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Auth Drift Self-Test Report</h1>
      <p>This harness demonstrates how Playwright detects login-related UI drift across the public KubeStellar Console demo and an OAuth-enabled login page. It includes expected pass cases plus controlled regressions that must fail.</p>
      <p>The OAuth scenarios do not use GitHub credentials or complete OAuth; they validate login page UI, route wiring, and visual stability before the credentialed part of the flow.</p>
      <p>Generated at ${escapeHtml(generatedAt)} from ${escapeHtml(webRoot)}.</p>
    </header>
    <section class="summary">
      <div class="metric"><strong>${passedHarnessChecks}/${results.length}</strong>Desired outcomes</div>
      <div class="metric"><strong>${results.filter((result) => result.expected === 'pass').length}</strong>Expected pass scenarios</div>
      <div class="metric"><strong>${results.filter((result) => result.expected === 'fail').length}</strong>Expected fail scenarios</div>
    </section>
    ${scenarioBlocks.join('\n')}
  </main>
</body>
</html>`
}

async function renderPdf(html) {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    await page.pdf({
      path: pdfReportPath,
      format: 'Letter',
      margin: {
        top: '0.4in',
        right: '0.4in',
        bottom: '0.4in',
        left: '0.4in',
      },
      printBackground: true,
    })
  } finally {
    await browser.close()
  }
}

async function main() {
  assertReportPathIsSafe()
  await rm(reportRoot, { recursive: true, force: true })
  await mkdir(logsDir, { recursive: true })

  const previewServer = await ensureLocalPreviewServer()
  const results = []

  try {
    for (const scenario of scenarios) {
      results.push(await runScenario(scenario))
    }
  } finally {
    await previewServer.stop()
  }

  await writeFile(jsonReportPath, JSON.stringify(results, null, 2))

  const html = await buildHtmlReport(results)
  await writeFile(htmlReportPath, html)
  await renderPdf(html)

  const allMatched = results.every((result) => result.matched)
  console.log(`[auth-drift-self-test] HTML report: ${htmlReportPath}`)
  console.log(`[auth-drift-self-test] PDF report: ${pdfReportPath}`)
  console.log(`[auth-drift-self-test] JSON results: ${jsonReportPath}`)

  if (!allMatched) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
