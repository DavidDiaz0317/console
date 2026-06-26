require('sucrase/register')

const { buildAdequacyReport } = require('../reports/buildAdequacyReport.ts')

const report = buildAdequacyReport()
console.log(`Wrote adequacy report for ${report.testsAnalyzed} analyzed tests.`)
