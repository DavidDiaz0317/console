require('sucrase/register')

const { writePrSummary } = require('../reports/buildPrSummary.ts')

writePrSummary()
console.log('Wrote test-results/reports/pr-summary.md')
