import fs from 'node:fs'
import path from 'node:path'
import type { MutationResult } from '../mutations/mutationTypes'
import { analyzeTestDirectory, writeAdequacyReport } from './analyzeTestDirectory'

export function readMutationAdequacyResults(resultPath = 'test-results/reports/mutation-results.json'): MutationResult[] {
  const absolutePath = path.resolve(process.cwd(), resultPath)
  if (!fs.existsSync(absolutePath)) return []
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as MutationResult[]
}

export function runMutationAdequacy() {
  const mutationResults = readMutationAdequacyResults()
  const report = analyzeTestDirectory(undefined, mutationResults)
  writeAdequacyReport(report)
  return report
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  const report = runMutationAdequacy()
  console.log(`Mutation-aware adequacy complete: ${report.testsAnalyzed} tests analyzed.`)
}
