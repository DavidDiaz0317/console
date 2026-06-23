const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const LABELS = {
  'console-live': { color: '5319e7', description: 'Issues related to console-live.kubestellar.io' },
  'live-canary': { color: '0e8a16', description: 'Console live canary validation' },
  'test-failure': { color: 'f9d0c4', description: 'Automated test failure' },
  'needs-fix': { color: 'd93f0b', description: 'Needs an implementation fix' },
}

const LIVE_ARTIFACT_NAME = 'console-live-promote-evidence'
const IMAGE_REPOSITORY = 'ghcr.io/daviddiaz0317/console'

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(fullPath)
    return [fullPath]
  })
}

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function truncate(value, limit = 2400) {
  const text = String(value || '')
  return text.length > limit ? `${text.slice(0, limit)}\n...truncated...` : text
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .slice(0, 300)
}

function stripAnsi(value) {
  return String(value || '').replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
}

function sanitizeText(value) {
  return stripAnsi(value)
    .replace(/(client[-_ ]?secret|jwt[-_ ]?secret|kubeconfig|token|password)(\s*[:=]\s*)[^\s"'`]+/gi, '$1$2[REDACTED]')
    .replace(/github_pat_[A-Za-z0-9_]+/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/ghp_[A-Za-z0-9_]+/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[REDACTED_JWT]')
    .replace(/-----BEGIN[\s\S]+?-----END [^-]+-----/g, '[REDACTED_PEM]')
}

function isSensitiveLogLine(line) {
  return /\b[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|COOKIE|KUBECONFIG|CLIENT_ID|CLIENT_SECRET|JWT)[A-Z0-9_]*\b/i.test(line)
}

function dedupe(items) {
  return [...new Set((items || []).filter(Boolean))]
}

function testStatusFailed(status) {
  return status && !['passed', 'skipped', 'expected'].includes(status)
}

function collectPlaywrightFailures(report, sourceFile) {
  const failures = []

  function collectFromSuite(suite, inheritedFile = '') {
    const suiteFile = suite.file || inheritedFile
    for (const spec of suite.specs || []) {
      const title = [spec.title, ...(spec.tags || [])].filter(Boolean).join(' ')
      for (const testCase of spec.tests || []) {
        const outcome = testCase.outcome || ''
        for (const result of testCase.results || []) {
          const status = result.status || outcome
          const errors = result.errors || (result.error ? [result.error] : [])
          const failed = testStatusFailed(status) || outcome === 'unexpected' || errors.length > 0
          if (!failed) continue

          const message = errors
            .map((error) => [error.message, error.stack].filter(Boolean).join('\n'))
            .filter(Boolean)
            .join('\n\n')
          const attachments = (result.attachments || [])
            .map((attachment) => attachment.path || attachment.name)
            .filter(Boolean)

          failures.push({
            sourceFile,
            specPath: spec.file || suiteFile || sourceFile,
            title,
            project: testCase.projectName || '',
            status,
            retry: result.retry ?? 0,
            error: sanitizeText(truncate(message || `${title} failed without a parsed error message.`, 3000)),
            attachments,
          })
        }
      }
    }

    for (const child of suite.suites || []) {
      collectFromSuite(child, suiteFile)
    }
  }

  for (const suite of report.suites || []) {
    collectFromSuite(suite)
  }

  return failures
}

function mergeLiveUiFailures(evidenceItems) {
  return mergeLiveUiFailureObjects(...evidenceItems.map((item) => item.liveUiFailures || {}))
}

function mergeLiveUiFailureObjects(...failureSets) {
  const merged = {
    forbiddenMatches: [],
    warningBadges: [],
    textCollisions: [],
    unexpectedNetworkResponses: [],
    unexpectedRequestFailures: [],
  }

  for (const failures of failureSets) {
    for (const key of Object.keys(merged)) {
      if (Array.isArray(failures[key])) merged[key].push(...failures[key])
    }
  }

  return Object.fromEntries(
    Object.entries(merged).map(([key, value]) => [
      key,
      dedupe(value.map((entry) => JSON.stringify(entry))).map((entry) => JSON.parse(entry)),
    ])
  )
}

function inferLiveUiFailuresFromText(textValue) {
  const text = sanitizeText(textValue)
  const failures = {
    forbiddenMatches: [],
    warningBadges: [],
    textCollisions: [],
    unexpectedNetworkResponses: [],
    unexpectedRequestFailures: [],
  }

  if (/visible text must not severely overlap/i.test(text)) {
    const collisionPattern = /"first":\s*"([^"]+)"[\s\S]{0,400}?"ratio":\s*([0-9.]+)[\s\S]{0,400}?"second":\s*"([^"]+)"/gi
    for (const match of text.matchAll(collisionPattern)) {
      failures.textCollisions.push({
        first: match[1],
        second: match[3],
        ratio: Number(match[2]),
      })
    }
    if (!failures.textCollisions.length) {
      failures.textCollisions.push({
        first: 'not parsed from log',
        second: 'not parsed from log',
        ratio: 1,
      })
    }
  }

  const forbidden = [
    { label: 'demo mode control', regex: /\bDemo Mode\b/gi },
    { label: 'connection log drawer', regex: /\bConnection Log\b/gi },
    { label: 'local agent refresh warning', regex: /Refreshing local agent[^\r\n]*/gi },
    { label: 'endpoint error summary', regex: /endpoint errors?[^\r\n]*/gi },
    { label: 'AI prediction load failure', regex: /\/predictions\/ai\s*-\s*Load failed/gi },
    { label: 'widget install prompt', regex: /\bInstall widget\b/gi },
  ]
  for (const pattern of forbidden) {
    for (const match of text.matchAll(pattern.regex)) {
      failures.forbiddenMatches.push({ label: pattern.label, text: match[0].slice(0, 160) })
    }
  }

  for (const match of text.matchAll(/\b(\d+)\s+warnings?\b/gi)) {
    failures.warningBadges.push({ text: match[0], count: Number(match[1]) })
  }

  for (const match of text.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\s+([45]\d\d)\s+(https?:\/\/[^\s]+)/gi)) {
    failures.unexpectedNetworkResponses.push(`${match[1]} ${match[2]} ${match[3]}`)
  }

  return mergeLiveUiFailureObjects(failures)
}

function invariantIdsFrom(failures, evidenceItems, logText = '') {
  const fromEvidence = evidenceItems.flatMap((item) => item.invariantIds || [])
  const fromFailures = failures.flatMap((failure) =>
    [...`${failure.title || ''}\n${failure.error || ''}\n${failure.specPath || ''}`.matchAll(/@invariant:([A-Za-z0-9_-]+)/g)].map((match) => match[1])
  )
  const fromFailedLogLines = sanitizeText(logText)
    .split(/\r?\n/)
    .filter((line) => /@invariant:/.test(line) && /(✘|##\[error\]|\bfailed\b)/i.test(line))
    .flatMap((line) => [...line.matchAll(/@invariant:([A-Za-z0-9_-]+)/g)].map((match) => match[1]))
  return dedupe([...fromEvidence, ...fromFailures, ...fromFailedLogLines])
}

function artifactPathsFromText(logText) {
  const text = sanitizeText(logText)
  return dedupe(
    [...text.matchAll(/e2e\/visual-login\/test-results\/[^\s)]+/g)]
      .map((match) => match[0].replace(/[.,;:]+$/, ''))
  )
}

function classifyFailure({ failures, evidenceItems, liveUiFailures, logText }) {
  const text = sanitizeText(JSON.stringify({ failures, evidenceItems, liveUiFailures }) + '\n' + logText).toLowerCase()
  if ((liveUiFailures.textCollisions || []).length || text.includes('visible text must not severely overlap')) return 'live-ui-overlap'
  if ((liveUiFailures.forbiddenMatches || []).length || /demo mode|connection log|refreshing local agent/.test(text)) return 'live-ui-forbidden-artifact'
  if ((liveUiFailures.warningBadges || []).length || /\b\d+\s+warnings?\b/.test(text)) return 'live-ui-warning-flood'
  if ((liveUiFailures.unexpectedNetworkResponses || []).length || (liveUiFailures.unexpectedRequestFailures || []).length || /unexpected app-origin|4xx|5xx|bad request/.test(text)) return 'live-network-error'
  if (/cluster-dashboard-groundtruth-match|groundtruth/.test(text)) return 'groundtruth-mismatch'
  if (/oauth|\/api\/me|auth boundary|unauthenticated/.test(text)) return 'auth-boundary'
  return 'canary-setup'
}

function likelyAreasFor(type) {
  if (type === 'live-ui-overlap' || type === 'live-ui-forbidden-artifact' || type === 'live-ui-warning-flood') {
    return [
      'web/src/components/**',
      'web/src/components/dashboard/**',
      'web/src/components/ui/**',
      'web/e2e/visual-login/helpers/liveSiteAssertions.ts',
    ]
  }
  if (type === 'live-network-error') {
    return ['web/src/hooks/**', 'web/src/lib/**', 'web/src/components/cards/**', 'cmd/console/**']
  }
  if (type === 'groundtruth-mismatch') {
    return ['web/src/components/**', 'web/harness/groundtruth/**', 'web/e2e/visual-login/semantic/live-canary-ui.spec.ts']
  }
  if (type === 'auth-boundary') {
    return ['web/src/lib/auth.tsx', 'cmd/console/**', 'deploy/helm/kubestellar-console/**', '.github/workflows/console-live-promote.yml']
  }
  return ['.github/workflows/console-live-promote.yml', 'web/e2e/visual-login/**', 'deploy/helm/kubestellar-console/**']
}

function shortFailure(type, failures) {
  const firstError = failures[0]?.error || ''
  if (type === 'live-ui-overlap') return 'visible text overlap blocks promotion'
  if (type === 'live-ui-forbidden-artifact') return 'live UI shows demo or local-only artifact'
  if (type === 'live-ui-warning-flood') return 'live UI shows warning flood'
  if (type === 'live-network-error') return 'live UI has unexpected network errors'
  if (type === 'groundtruth-mismatch') return 'live UI does not match cluster groundtruth'
  if (type === 'auth-boundary') return 'production auth boundary failed'
  return sanitizeText(firstError.split('\n')[0] || 'canary setup failed').slice(0, 80)
}

async function fetchFailedJobLogs({ github, owner, repo, failedJobs }) {
  const logs = []
  for (const job of failedJobs) {
    try {
      const response = await github.request('GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs', {
        owner,
        repo,
        job_id: job.id,
      })
      const data = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
      logs.push({ job: job.name, text: sanitizeText(data) })
    } catch (error) {
      logs.push({ job: job.name, text: `Could not fetch job log: ${error.message}` })
    }
  }
  return logs
}

function logExcerpt(logs) {
  const primaryPatterns = [
    /visible text must not severely overlap/i,
    /live ui must/i,
    /"first":/i,
    /"second":/i,
    /"ratio":/i,
    /attachment #/i,
    /Error Context:/i,
    /@invariant:/i,
  ]
  const fallbackPatterns = [
    /groundtruth/i,
    /\/api\/me/i,
    /oauth/i,
    /##\[error\]/i,
    /Process completed with exit code/i,
  ]

  function collect(patterns) {
    const excerpts = []
    for (const log of logs) {
      const lines = sanitizeText(log.text).split(/\r?\n/).filter((line) => !isSensitiveLogLine(line))
      const matched = new Set()
      lines.forEach((line, index) => {
        if (!patterns.some((pattern) => pattern.test(line))) return
        for (let i = Math.max(0, index - 4); i <= Math.min(lines.length - 1, index + 8); i += 1) matched.add(i)
      })
      const selected = [...matched].sort((a, b) => a - b).map((index) => lines[index]).join('\n')
      if (selected) excerpts.push(`### ${log.job}\n\n\`\`\`text\n${truncate(selected, 3500)}\n\`\`\``)
    }
    return excerpts
  }

  let excerpts = collect(primaryPatterns)
  if (!excerpts.length) excerpts = collect(fallbackPatterns)
  return excerpts.join('\n\n') || 'No concise log excerpt could be extracted. Use the run link and artifacts.'
}

function parseImageState(logText, run) {
  const cleaned = sanitizeText(logText)
  const currentMatches = [...cleaned.matchAll(/Live currently runs ([^;\r\n]+); candidate is ([^\s\r\n]+)/g)]
    .map((match) => ({ current: match[1].trim(), candidate: match[2].trim().replace(/^"|"$/g, '') }))
    .filter((match) => !match.current.includes('${') && !match.candidate.includes('${'))
  const alreadyMatches = [...cleaned.matchAll(/Live already runs ([^\s\r\n]+)/g)]
    .map((match) => match[1].trim().replace(/^"|"$/g, ''))
    .filter((image) => !image.includes('$'))
  const currentMatch = currentMatches[currentMatches.length - 1]
  const alreadyMatch = alreadyMatches[alreadyMatches.length - 1]
  const candidate = currentMatch?.candidate || `${IMAGE_REPOSITORY}:${run.head_sha}`
  return {
    current: currentMatch?.current || alreadyMatch || 'not parsed',
    candidate,
  }
}

function productionBlocked(jobs) {
  const steps = jobs.flatMap((job) => job.steps || [])
  const promoteStep = steps.find((step) => step.name === 'Promote candidate to production')
  if (!promoteStep) return 'unknown'
  return promoteStep.conclusion === 'skipped' || promoteStep.status !== 'completed' ? 'yes' : 'no'
}

function artifactRows(artifacts, runUrlBase, runId) {
  return artifacts.map((artifact) => {
    const url = `${runUrlBase}/${runId}/artifacts/${artifact.id}`
    return `| [${escapeCell(artifact.name)}](${url}) | ${escapeCell(artifact.size_in_bytes)} | ${escapeCell(artifact.expired ? 'yes' : 'no')} |`
  })
}

function buildReproductionCommand() {
  return [
    '```bash',
    'cd web',
    'LIVE_SITE_TESTS=true \\',
    'LIVE_CLUSTER_TESTS=true \\',
    'LIVE_SITE_AUTH_MODE=dev \\',
    'LIVE_CANARY_CONSOLE_URL=http://127.0.0.1:18080 \\',
    'SELF_HOSTED_CONSOLE_URL=http://127.0.0.1:18080 \\',
    'LIVE_PRODUCTION_CONSOLE_URL=https://console-live.kubestellar.io \\',
    'npm run test:visual:live -- e2e/visual-login/semantic/live-canary-ui.spec.ts',
    '```',
  ].join('\n')
}

function buildBody({
  marker,
  run,
  failedJobs,
  failures,
  evidenceFiles,
  evidenceItems,
  logArtifactPaths,
  reportFiles,
  artifacts,
  logExcerptText,
  liveUiFailures,
  failureType,
  invariantIds,
  imageState,
  blocked,
  runUrlBase,
  runId,
}) {
  const failureRows = failures.map((failure) =>
    `| ${escapeCell(failure.title)} | ${escapeCell(failure.project)} | ${escapeCell(failure.status)} | ${escapeCell(failure.retry)} | ${escapeCell(failure.specPath)} |`
  )
  const attachmentPaths = dedupe(failures.flatMap((failure) => failure.attachments || []))
  const likelyFiles = likelyAreasFor(failureType)

  return [
    marker,
    '# Console Live Promote Failure',
    '',
    'Production promotion was blocked by the console-live canary gate. This issue is structured for an AI agent to fix the underlying UI/test failure without first digging through raw Actions logs.',
    '',
    '## Summary',
    '',
    `- Failure type: \`${failureType}\``,
    `- Production blocked before promotion: \`${blocked}\``,
    `- Candidate image: \`${imageState.candidate}\``,
    `- Current production image: \`${imageState.current}\``,
    `- Run: [#${runId}](${run.html_url})`,
    `- Commit: \`${run.head_sha}\``,
    '',
    '## Failed Invariants',
    '',
    invariantIds.length ? invariantIds.map((id) => `- \`${id}\``).join('\n') : '- No invariant IDs parsed.',
    '',
    '## Failed Tests',
    '',
    '| Test | Project | Status | Retry | Spec |',
    '|---|---|---|---:|---|',
    failureRows.length ? failureRows.join('\n') : '| No Playwright failure rows parsed | n/a | n/a | 0 | n/a |',
    '',
    '## Parsed Failure Details',
    '',
    '```json',
    truncate(JSON.stringify(liveUiFailures, null, 2), 5000),
    '```',
    '',
    '## Evidence',
    '',
    '| Artifact | Size bytes | Expired |',
    '|---|---:|---|',
    artifacts.length ? artifactRows(artifacts, runUrlBase, runId).join('\n') : '| No uploaded evidence artifact found | 0 | n/a |',
    '',
    'Referenced paths inside artifacts:',
    '',
    ...dedupe([...attachmentPaths, ...evidenceFiles, ...reportFiles, ...logArtifactPaths]).slice(0, 30).map((file) => `- \`${file.replace(/\\/g, '/')}\``),
    '',
    '## Log Excerpt',
    '',
    logExcerptText,
    '',
    '## Likely Area',
    '',
    ...likelyFiles.map((file) => `- \`${file}\``),
    '',
    '## Reproduction',
    '',
    'This command assumes the workflow has deployed and port-forwarded the private canary to `127.0.0.1:18080`:',
    '',
    buildReproductionCommand(),
    '',
    '## Agent Instructions',
    '',
    '1. Inspect the failed invariant and screenshot/trace evidence first.',
    '2. Do not update screenshot baselines; live tests intentionally do not use baselines.',
    '3. Fix the UI overlap, forbidden live artifact, network error, or groundtruth mismatch in code.',
    '4. Rerun the live canary test.',
    '5. Confirm production promotion remains blocked until the canary passes.',
  ].join('\n')
}

module.exports = async ({ github, context, core }) => {
  const owner = context.repo.owner
  const repo = context.repo.repo
  const runId = Number(process.env.SOURCE_RUN_ID)
  const artifactRoot = process.env.ARTIFACT_ROOT || 'console-live-promote-artifacts'
  const runUrlBase = `${context.serverUrl}/${owner}/${repo}/actions/runs`

  const { data: repoInfo } = await github.rest.repos.get({ owner, repo })
  if (!repoInfo.has_issues) {
    core.warning(`GitHub Issues are disabled for ${owner}/${repo}; cannot create issue.`)
    return
  }

  const { data: run } = await github.rest.actions.getWorkflowRun({ owner, repo, run_id: runId })
  if (run.name !== 'Console Live Promote') {
    core.warning(`Run ${runId} is "${run.name}", not "Console Live Promote"; skipping.`)
    return
  }
  if (run.conclusion !== 'failure') {
    core.info(`Run ${runId} concluded with ${run.conclusion}; no issue needed.`)
    return
  }

  for (const [name, def] of Object.entries(LABELS)) {
    try {
      await github.rest.issues.getLabel({ owner, repo, name })
    } catch {
      await github.rest.issues.createLabel({ owner, repo, name, color: def.color, description: def.description }).catch((error) => {
        core.warning(`Could not create label ${name}: ${error.message}`)
      })
    }
  }

  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, { owner, repo, run_id: runId, per_page: 100 })
  const failedJobs = jobs.filter((job) => job.conclusion === 'failure' || job.conclusion === 'timed_out')
  const logs = await fetchFailedJobLogs({ github, owner, repo, failedJobs })
  const combinedLogText = logs.map((log) => log.text).join('\n')

  const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, { owner, repo, run_id: runId, per_page: 100 })
  const files = walk(artifactRoot)
  const resultFiles = files.filter((file) => /(^|[\\/])results\.json$/i.test(file))
  const evidenceFiles = files.filter((file) => /(^|[\\/])evidence\.json$/i.test(file)).map((file) => path.relative(process.cwd(), file))
  const reportFiles = files.filter((file) => /[\\/]test-results[\\/]reports[\\/]/i.test(file)).map((file) => path.relative(process.cwd(), file))
  const evidenceItems = evidenceFiles
    .map((file) => readJsonFile(path.resolve(process.cwd(), file)))
    .filter(Boolean)
  const liveReports = files
    .filter((file) => /(^|[\\/])live-site\.json$/i.test(file))
    .flatMap((file) => {
      const parsed = readJsonFile(file)
      return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : [])
    })

  const failures = resultFiles.flatMap((file) => {
    const report = readJsonFile(file)
    return report ? collectPlaywrightFailures(report, path.relative(process.cwd(), file)) : []
  })
  if (!failures.length && combinedLogText) {
    failures.push({
      sourceFile: 'workflow logs',
      specPath: 'not parsed',
      title: 'Console Live Promote failed',
      project: 'not parsed',
      status: 'failed',
      retry: 0,
      error: sanitizeText(truncate(logExcerpt(logs), 2500)),
      attachments: [],
    })
  }

  const liveUiFailures = mergeLiveUiFailureObjects(
    mergeLiveUiFailures(evidenceItems),
    inferLiveUiFailuresFromText(combinedLogText),
  )
  const invariantIds = invariantIdsFrom(failures, evidenceItems, combinedLogText)
  const logArtifactPaths = artifactPathsFromText(combinedLogText)
  const failureType = classifyFailure({ failures, evidenceItems, liveUiFailures, logText: combinedLogText })
  const imageState = parseImageState(combinedLogText, run)
  const blocked = productionBlocked(jobs)
  const signatureSource = [
    failureType,
    invariantIds.join(','),
    failures.map((failure) => `${failure.specPath}:${failure.title}`).sort().join('|'),
    JSON.stringify(liveUiFailures).slice(0, 500),
  ].join('|') || `console-live-promote:${runId}`
  const signature = crypto.createHash('sha256').update(signatureSource).digest('hex').slice(0, 16)
  const marker = `<!-- console-live-promote-signature:${signature} -->`
  const title = `[console-live][canary-blocked][${failureType}] ${shortFailure(failureType, failures)}`

  let body = buildBody({
    marker,
    run,
    failedJobs,
    failures,
    evidenceFiles,
    evidenceItems,
    logArtifactPaths,
    liveReports,
    reportFiles,
    artifacts: artifacts.filter((artifact) => artifact.name === LIVE_ARTIFACT_NAME || artifact.name.includes('console-live')),
    logExcerptText: logExcerpt(logs),
    liveUiFailures,
    failureType,
    invariantIds,
    imageState,
    blocked,
    runUrlBase,
    runId,
  })
  if (body.length > 60000) body = `${body.slice(0, 59000)}\n\n...body truncated...\n${marker}`

  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    state: 'open',
    labels: 'console-live,live-canary,test-failure',
    per_page: 100,
  })
  const runMarker = `actions/runs/${runId}`
  const matchingIssues = issues.filter((issue) => {
    const issueBody = issue.body || ''
    return issueBody.includes(marker)
      || issueBody.includes(runMarker)
      || issue.title === title
  })
  const existing = matchingIssues.find((issue) => issue.body && issue.body.includes(marker)) || matchingIssues[0]

  if (existing) {
    await github.rest.issues.update({ owner, repo, issue_number: existing.number, title, body })
    const duplicates = matchingIssues.filter((issue) => issue.number !== existing.number)
    for (const duplicate of duplicates) {
      await github.rest.issues.createComment({
        owner,
        repo,
        issue_number: duplicate.number,
        body: [
          `Superseded by #${existing.number} for the same Console Live Promote run and failure.`,
          '',
          `- Run: [#${runId}](${run.html_url})`,
          `- Failure type: \`${failureType}\``,
        ].join('\n'),
      })
      await github.rest.issues.update({
        owner,
        repo,
        issue_number: duplicate.number,
        state: 'closed',
        state_reason: 'not_planned',
      })
    }
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: existing.number,
      body: [
        marker,
        `Console Live Promote is still failing with \`${failureType}\`.`,
        '',
        `- Run: [#${runId}](${run.html_url})`,
        `- Candidate image: \`${imageState.candidate}\``,
        `- Production blocked before promotion: \`${blocked}\``,
      ].join('\n'),
    })
    core.info(`Updated existing Console Live Promote failure issue #${existing.number}.`)
    return
  }

  const created = await github.rest.issues.create({
    owner,
    repo,
    title,
    body,
    labels: Object.keys(LABELS),
  })
  core.info(`Created Console Live Promote failure issue #${created.data.number}.`)
}
