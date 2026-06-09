require('sucrase/register')

const { analyzeTestDirectory, writeAdequacyReport } = require('../adequacy/analyzeTestDirectory.ts')

const roots = process.argv.slice(2)
const report = analyzeTestDirectory(roots.length > 0 ? roots : undefined)
writeAdequacyReport(report)
console.log(`Analyzed ${report.testsAnalyzed} tests. Weak tests: ${report.weakTests.length}.`)

if (report.findings.some((finding) => finding.filePath.includes('weak-body-only') && finding.score > 24)) {
  console.error('Weak body-only fixture scored too high.')
  process.exit(1)
}
