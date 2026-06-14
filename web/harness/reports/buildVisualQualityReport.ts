import fs from 'node:fs'
import path from 'node:path'
import { buildMutationReport, readMutationResults } from './buildMutationReport'
import { analyzeTestDirectory } from '../adequacy/analyzeTestDirectory'
import { safeJsonStringify } from '../evidence/sanitizeEvidence'

function readOptionalJson(filePath: string): unknown {
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

export function buildVisualQualityReport() {
  const outDir = path.resolve(process.cwd(), 'test-results/reports')
  fs.mkdirSync(outDir, { recursive: true })
  const mutationResults = readMutationResults()
  const adequacy = analyzeTestDirectory(undefined, mutationResults)
  const groundTruth = readOptionalJson(path.join(outDir, 'groundtruth.json'))
  const survived = mutationResults.filter(result => result.status === 'survived')
  const weakTests = adequacy.weakTests
  const json = {
    generatedAt: new Date().toISOString(),
    mutationResults,
    adequacy,
    groundTruth,
    executiveSummary: {
      survivedMutants: survived.length,
      weakTests: weakTests.length,
      liveGroundTruthConfigured: Boolean(groundTruth && !(groundTruth as { skipped?: string }).skipped),
    },
  }
  const markdown = [
    '# Visual/Login Intensive Quality Report',
    '',
    '## Executive Summary',
    '',
    `- Survived mutants: ${survived.length}`,
    `- Weak tests detected: ${weakTests.length}`,
    `- Live cluster ground truth: ${json.executiveSummary.liveGroundTruthConfigured ? 'configured' : 'skipped or unavailable'}`,
    '',
    '## Mutation/Fault-Injection Results',
    '',
    buildMutationReport(mutationResults),
    '',
    '## Generated/Hive Test Adequacy Scores',
    '',
    `Tests analyzed: ${adequacy.testsAnalyzed}`,
    `Weak tests: ${weakTests.length}`,
    '',
    ...weakTests.slice(0, 30).map(test => `- ${test.filePath} :: ${test.testTitle} (${test.score}/100)`),
    '',
    '## Live Cluster Groundtruth Results',
    '',
    groundTruth ? 'See `groundtruth.json` for sanitized normalized counts.' : 'Skipped: no groundtruth artifact was produced.',
    '',
    '## Recommended Follow-Up PRs/Issues',
    '',
    ...(survived.length > 0
      ? survived.map(result => `- Add or strengthen tests for survived mutant ${result.id}.`)
      : ['- No survived mutants recorded.']),
    ...(weakTests.length > 0
      ? ['- Replace weak generated/body-only tests with invariant-mapped assertions.']
      : []),
  ].join('\n')

  fs.writeFileSync(path.join(outDir, 'intensive-quality-report.md'), markdown)
  fs.writeFileSync(path.join(outDir, 'intensive-quality-report.json'), safeJsonStringify(json))
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`)
  }
  return json
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  buildVisualQualityReport()
  console.log('Wrote test-results/reports/intensive-quality-report.md')
}
