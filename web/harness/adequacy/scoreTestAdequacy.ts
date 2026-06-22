import type { MutationResult } from '../mutations/mutationTypes'
import { detectWeakAssertions, weakAssertionProblems } from './detectWeakAssertions'

export interface AdequacyScoreInput {
  source: string
  invariantIds: string[]
  mutationResults?: MutationResult[]
}

export interface AdequacyScore {
  score: number
  problems: string[]
  confidence: 'strong' | 'good' | 'partial' | 'weak' | 'unsafe'
}

export function scoreTestAdequacy(input: AdequacyScoreInput): AdequacyScore {
  const signals = detectWeakAssertions(input.source)
  const problems = weakAssertionProblems(input.source)
  let score = 10

  if (signals.assertionCount > 0) score += Math.min(25, signals.assertionCount * 6)
  if (signals.hasInvariantAnnotation) score += 15
  if (input.invariantIds.length > 0) score += 12
  if (signals.hasAccessibleLocator) score += 8
  if (signals.hasRouteAssertion) score += 10
  if (signals.hasNegativeAssertion) score += 10
  if (signals.hasVisualAssertion) score += 8
  if (signals.hasLoginAbsenceAssertion) score += 10
  if (signals.hasGitHubLoginAbsenceAssertion) score += 10
  if (signals.hasDashboardContentAssertion) score += 8

  if (signals.hasNoOpAssertion) score -= 40
  if (signals.hasBodyOnlyAssertion) score -= 50
  if (signals.assertionCount === 0) score -= 45
  if (signals.waitForTimeoutCount > 0) score -= Math.min(20, signals.waitForTimeoutCount * 8)
  if (signals.screenshotThresholdRisk) score -= 20

  const relevantMutations = (input.mutationResults || []).filter(result =>
    result.targetInvariants.some(id => input.invariantIds.includes(id)),
  )
  const killed = relevantMutations.filter(result => result.status === 'killed').length
  const survived = relevantMutations.filter(result => result.status === 'survived').length
  score += Math.min(18, killed * 6)
  score -= Math.min(35, survived * 12)
  if (survived > 0) problems.push(`survived ${survived} relevant mutation(s)`)
  if (killed > 0) problems.push(`killed ${killed} relevant mutation(s)`)

  score = Math.max(0, Math.min(100, Math.round(score)))
  const confidence =
    score >= 90 ? 'strong'
      : score >= 70 ? 'good'
        : score >= 50 ? 'partial'
          : score >= 25 ? 'weak'
            : 'unsafe'

  return { score, problems, confidence }
}
