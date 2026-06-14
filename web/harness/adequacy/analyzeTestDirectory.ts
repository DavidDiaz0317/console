import fs from 'node:fs'
import path from 'node:path'
import type { MutationResult } from '../mutations/mutationTypes'
import { analyzeTestFile, type TestAdequacyFinding } from './analyzeTestFile'
import { safeJsonStringify } from '../evidence/sanitizeEvidence'

export interface AdequacyDirectoryReport {
  generatedAt: string
  roots: string[]
  testsAnalyzed: number
  findings: TestAdequacyFinding[]
  scoreDistribution: Record<string, number>
  weakTests: TestAdequacyFinding[]
  unmappedTests: TestAdequacyFinding[]
}

const DEFAULT_SCAN_ROOTS = [
  'tests/generated',
  'tests/hive-generated',
  'tests/e2e',
  'e2e',
  'e2e/visual-login',
  'harness/adequacy/fixtures',
]

function walkFiles(root: string): string[] {
  if (!fs.existsSync(root)) return []
  const stat = fs.statSync(root)
  if (stat.isFile()) return /\.(?:spec|test|before|after)\.(?:ts|tsx|js|jsx)$/.test(root) ? [root] : []
  const entries = fs.readdirSync(root, { withFileTypes: true })
  return entries.flatMap(entry => {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) return walkFiles(fullPath)
    return /\.(?:spec|test|before|after)\.(?:ts|tsx|js|jsx)$/.test(entry.name) ? [fullPath] : []
  })
}

function readMutationResults(): MutationResult[] {
  const resultPath = path.resolve(process.cwd(), 'test-results/reports/mutation-results.json')
  if (!fs.existsSync(resultPath)) return []
  try {
    return JSON.parse(fs.readFileSync(resultPath, 'utf8')) as MutationResult[]
  } catch {
    return []
  }
}

function distributionFor(findings: TestAdequacyFinding[]): Record<string, number> {
  const buckets = { strong: 0, good: 0, partial: 0, weak: 0, unsafe: 0 }
  for (const finding of findings) {
    if (finding.score >= 90) buckets.strong += 1
    else if (finding.score >= 70) buckets.good += 1
    else if (finding.score >= 50) buckets.partial += 1
    else if (finding.score >= 25) buckets.weak += 1
    else buckets.unsafe += 1
  }
  return buckets
}

export function analyzeTestDirectory(
  roots = DEFAULT_SCAN_ROOTS,
  mutationResults = readMutationResults(),
): AdequacyDirectoryReport {
  const existingRoots = roots.filter(root => fs.existsSync(root))
  const files = [...new Set(existingRoots.flatMap(walkFiles))]
  const findings = files.flatMap(file => analyzeTestFile(file, mutationResults))
  return {
    generatedAt: new Date().toISOString(),
    roots: existingRoots,
    testsAnalyzed: findings.length,
    findings,
    scoreDistribution: distributionFor(findings),
    weakTests: findings.filter(finding => finding.score < 50),
    unmappedTests: findings.filter(finding => finding.invariantIds.length === 0),
  }
}

export function writeAdequacyReport(report: AdequacyDirectoryReport) {
  const outDir = path.resolve(process.cwd(), 'test-results/reports')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'adequacy-report.json'), safeJsonStringify(report))
  const lines = [
    '# Generated Test Adequacy Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Tests analyzed: ${report.testsAnalyzed}`,
    '',
    '| Bucket | Count |',
    '| --- | ---: |',
    ...Object.entries(report.scoreDistribution).map(([bucket, count]) => `| ${bucket} | ${count} |`),
    '',
    '## Weak Tests',
    '',
    ...report.weakTests.slice(0, 50).map(finding =>
      `- ${finding.filePath} :: ${finding.testTitle} (${finding.score}/100): ${finding.problems.join('; ') || 'low score'}`,
    ),
    '',
    '## Unmapped Tests',
    '',
    ...report.unmappedTests.slice(0, 50).map(finding => `- ${finding.filePath} :: ${finding.testTitle}`),
  ]
  fs.writeFileSync(path.join(outDir, 'adequacy-report.md'), lines.join('\n'))
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  const roots = process.argv.slice(2)
  const report = analyzeTestDirectory(roots.length > 0 ? roots : DEFAULT_SCAN_ROOTS)
  writeAdequacyReport(report)
  console.log(`Analyzed ${report.testsAnalyzed} tests. Weak tests: ${report.weakTests.length}.`)
  if (report.findings.some(finding => finding.filePath.includes('weak-body-only') && finding.score > 24)) {
    console.error('Weak body-only fixture scored too high.')
    process.exit(1)
  }
}
