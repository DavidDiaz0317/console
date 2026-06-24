import fs from 'node:fs'
import path from 'node:path'
import type { MutationResult } from '../mutations/mutationTypes'
import { safeJsonStringify } from '../evidence/sanitizeEvidence'

export function readMutationResults(): MutationResult[] {
  const resultPath = path.resolve(process.cwd(), 'test-results/reports/mutation-results.json')
  if (!fs.existsSync(resultPath)) return []
  return JSON.parse(fs.readFileSync(resultPath, 'utf8')) as MutationResult[]
}

export function buildMutationReport(results = readMutationResults()): string {
  const lines = [
    '# Mutation/Fault-Injection Report',
    '',
    '| Mutation | Status | Target invariants |',
    '| --- | --- | --- |',
    ...results.map(result => `| ${result.id} | ${result.status} | ${result.targetInvariants.join(', ')} |`),
    '',
    '## Survived Mutants',
    '',
    ...results
      .filter(result => result.status === 'survived')
      .map(result => `- ${result.id}: ${result.message || 'Expected invariant test passed despite broken behavior.'}`),
    ...(results.some(result => result.status === 'survived') ? [] : ['- None recorded.']),
  ]
  return lines.join('\n')
}

export function writeMutationReport() {
  const outDir = path.resolve(process.cwd(), 'test-results/reports')
  fs.mkdirSync(outDir, { recursive: true })
  const results = readMutationResults()
  fs.writeFileSync(path.join(outDir, 'mutation-report.md'), buildMutationReport(results))
  fs.writeFileSync(path.join(outDir, 'mutation-results.json'), safeJsonStringify(results))
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  writeMutationReport()
  console.log('Wrote test-results/reports/mutation-report.md')
}
