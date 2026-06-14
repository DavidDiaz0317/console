import fs from 'node:fs'
import path from 'node:path'
import { loadInvariantRegistry } from '../invariants/loadInvariants'
import { safeJsonStringify, sanitizeText } from '../evidence/sanitizeEvidence'
import type { VisualLoginReport } from './reportTypes'

function readJson(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function walkEvidence(root = path.resolve(process.cwd(), 'test-results/evidence')): string[] {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) return walkEvidence(fullPath)
    return entry.name === 'evidence.json' ? [fullPath] : []
  })
}

function statusFromResults(results: unknown): 'passed' | 'failed' | 'unknown' {
  const stats = (results as { stats?: { unexpected?: number; expected?: number } } | null)?.stats
  if (!stats) return 'unknown'
  return (stats.unexpected || 0) > 0 ? 'failed' : 'passed'
}

export function buildPrSummary(): { markdown: string; report: VisualLoginReport } {
  const registry = loadInvariantRegistry()
  const results = readJson(path.resolve(process.cwd(), 'test-results/results.json'))
  const evidenceFiles = walkEvidence()
  const evidence = evidenceFiles.map(file => readJson(file)).filter(Boolean) as Array<{
    invariantIds?: string[]
    status?: string
    testTitle?: string
  }>
  const checkedIds = new Set(evidence.flatMap(item => item.invariantIds || []))
  const failedIds = new Set(evidence.filter(item => item.status === 'failed').flatMap(item => item.invariantIds || []))
  const appUrl = process.env.VISUAL_LOGIN_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4173'
  const report: VisualLoginReport = {
    status: statusFromResults(results),
    generatedAt: new Date().toISOString(),
    appUrl,
    appMode: process.env.VISUAL_LOGIN_AUTH_MODE || 'demo',
    invariants: registry.invariants.map(invariant => ({
      invariantId: invariant.id,
      status: failedIds.has(invariant.id) ? 'failed' : checkedIds.has(invariant.id) ? 'passed' : 'unknown',
      details: invariant.description,
    })),
    artifacts: evidenceFiles.map(file => path.relative(process.cwd(), file).replace(/\\/g, '/')),
    skipped: evidence
      .filter(item => item.status === 'skipped')
      .map(item => item.testTitle || 'config-dependent check skipped'),
  }

  const markdown = [
    '# Visual/Login PR Protection Summary',
    '',
    `- Status: ${report.status}`,
    `- Generated: ${report.generatedAt}`,
    `- Tested app URL/mode: ${report.appUrl} / ${report.appMode}`,
    `- Sanitized artifacts only: yes`,
    '',
    '## Checked Invariants',
    '',
    '| Invariant | Status |',
    '| --- | --- |',
    ...report.invariants.map(item => `| ${item.invariantId} | ${item.status} |`),
    '',
    '## Failures',
    '',
    ...report.invariants.filter(item => item.status === 'failed').map(item => `- ${item.invariantId}: ${item.details || 'failed'}`),
    ...(report.invariants.some(item => item.status === 'failed') ? [] : ['- None recorded.']),
    '',
    '## Artifacts',
    '',
    ...(report.artifacts.length > 0 ? report.artifacts.map(item => `- ${item}`) : ['- No sanitized evidence artifacts recorded.']),
    '',
    '## Skipped Config-Dependent Checks',
    '',
    ...(report.skipped.length > 0 ? report.skipped.map(item => `- ${sanitizeText(item)}`) : ['- None recorded.']),
  ].join('\n')

  return { markdown, report }
}

export function writePrSummary() {
  const outDir = path.resolve(process.cwd(), 'test-results/reports')
  fs.mkdirSync(outDir, { recursive: true })
  const { markdown, report } = buildPrSummary()
  fs.writeFileSync(path.join(outDir, 'pr-summary.md'), markdown)
  fs.writeFileSync(path.join(outDir, 'pr-summary.json'), safeJsonStringify(report))
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`)
  }
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  writePrSummary()
  console.log('Wrote test-results/reports/pr-summary.md')
}
