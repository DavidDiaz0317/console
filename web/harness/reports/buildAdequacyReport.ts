import fs from 'node:fs'
import path from 'node:path'
import { analyzeTestDirectory, writeAdequacyReport } from '../adequacy/analyzeTestDirectory'

export function buildAdequacyReport() {
  const report = analyzeTestDirectory()
  writeAdequacyReport(report)
  const summaryPath = path.resolve(process.cwd(), 'test-results/reports/adequacy-report.md')
  const markdown = fs.existsSync(summaryPath) ? fs.readFileSync(summaryPath, 'utf8') : ''
  if (process.env.GITHUB_STEP_SUMMARY && markdown) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`)
  }
  return report
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  const report = buildAdequacyReport()
  console.log(`Wrote adequacy report for ${report.testsAnalyzed} analyzed tests.`)
}
