require('sucrase/register')

const { buildVisualQualityReport } = require('../reports/buildVisualQualityReport.ts')

buildVisualQualityReport()
console.log('Wrote test-results/reports/intensive-quality-report.md')
