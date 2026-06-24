import fs from 'node:fs'
import path from 'node:path'
import type { MutationResult } from '../mutations/mutationTypes'
import { mapTestToInvariant, likelyProtectedArea } from './mapTestToInvariant'
import { scoreTestAdequacy } from './scoreTestAdequacy'
import { detectWeakAssertions } from './detectWeakAssertions'

export interface TestAdequacyFinding {
  filePath: string
  testTitle: string
  tags: string[]
  invariantIds: string[]
  protectedArea: string
  assertionCount: number
  score: number
  confidence: string
  problems: string[]
}

const TEST_TITLE_PATTERN = /\btest(?:\.(?:only|skip|fixme|describe))?\s*\(\s*['"`]([^'"`]+)['"`]/g
const TAG_PATTERN = /@[a-z0-9:-]+/gi

export function analyzeTestFile(filePath: string, mutationResults: MutationResult[] = []): TestAdequacyFinding[] {
  const absolutePath = path.resolve(filePath)
  const source = fs.readFileSync(absolutePath, 'utf8')
  const titles = [...source.matchAll(TEST_TITLE_PATTERN)].map(match => match[1])
  const testTitles = titles.length > 0 ? titles : [path.basename(filePath)]
  const tags = [...new Set(source.match(TAG_PATTERN) || [])]
  const signals = detectWeakAssertions(source)

  return testTitles.map(testTitle => {
    const invariantIds = mapTestToInvariant(testTitle, source)
    const score = scoreTestAdequacy({ source, invariantIds, mutationResults })
    return {
      filePath: path.relative(process.cwd(), absolutePath).replace(/\\/g, '/'),
      testTitle,
      tags,
      invariantIds,
      protectedArea: likelyProtectedArea(invariantIds),
      assertionCount: signals.assertionCount,
      score: score.score,
      confidence: score.confidence,
      problems: score.problems,
    }
  })
}
