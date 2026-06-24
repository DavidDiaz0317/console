export interface TestStaticSignals {
  assertionCount: number
  hasNoOpAssertion: boolean
  hasBodyOnlyAssertion: boolean
  hasRouteAssertion: boolean
  hasNegativeAssertion: boolean
  hasVisualAssertion: boolean
  hasAccessibleLocator: boolean
  genericLocatorCount: number
  waitForTimeoutCount: number
  hasInvariantAnnotation: boolean
  hasLoginAbsenceAssertion: boolean
  hasGitHubLoginAbsenceAssertion: boolean
  hasDashboardContentAssertion: boolean
  screenshotThresholdRisk: boolean
}

export function detectWeakAssertions(source: string): TestStaticSignals {
  const expectMatches = source.match(/\bexpect\s*\(/g) || []
  const genericLocatorMatches = source.match(/locator\s*\(\s*['"`](?:body|html|#root|\*)['"`]\s*\)/g) || []
  const thresholdMatches = source.match(/(?:maxDiffPixels|maxDiffPixelRatio|threshold)\s*:\s*([0-9.]+)/g) || []
  const riskyThreshold = thresholdMatches.some(match => {
    const value = Number(match.split(':').pop()?.trim())
    return Number.isFinite(value) && value > 0.08
  })

  return {
    assertionCount: expectMatches.length,
    hasNoOpAssertion: /expect\s*\(\s*(?:true|false)\s*\)\s*\.\s*toBe\s*\(\s*(?:true|false)\s*\)/.test(source),
    hasBodyOnlyAssertion: genericLocatorMatches.length > 0 && expectMatches.length <= 1 && /toBeVisible\s*\(/.test(source),
    hasRouteAssertion: /toHaveURL|page\.url\s*\(|new URL\s*\(/.test(source),
    hasNegativeAssertion: /\.not\.|toHaveCount\s*\(\s*0\s*\)|not\.toMatch|not\.toContain/.test(source),
    hasVisualAssertion: /toHaveScreenshot|screenshot\s*\(|boundingBox\s*\(|toBeInViewport/.test(source),
    hasAccessibleLocator: /getByRole|getByLabel|getByText|getByTestId|getByPlaceholder/.test(source),
    genericLocatorCount: genericLocatorMatches.length,
    waitForTimeoutCount: (source.match(/waitForTimeout\s*\(/g) || []).length,
    hasInvariantAnnotation: /@invariant:[a-z0-9-]+|type:\s*['"`]invariant['"`]/.test(source),
    hasLoginAbsenceAssertion: /login|signin|auth/i.test(source) && /\.not\.|not\.toMatch|toHaveCount\s*\(\s*0\s*\)/.test(source),
    hasGitHubLoginAbsenceAssertion: /github-login-button|GitHub|Continue with GitHub/i.test(source) && /\.not\.|toHaveCount\s*\(\s*0\s*\)/.test(source),
    hasDashboardContentAssertion: /dashboard|cluster|workload|main-content|dashboard-title|dashboard-header/i.test(source) && /toBeVisible|toContainText|toHaveText/.test(source),
    screenshotThresholdRisk: riskyThreshold,
  }
}

export function weakAssertionProblems(source: string): string[] {
  const signals = detectWeakAssertions(source)
  const problems: string[] = []
  if (signals.assertionCount === 0) problems.push('no expect calls')
  if (signals.hasNoOpAssertion) problems.push('no-op assertion')
  if (signals.hasBodyOnlyAssertion) problems.push('body is visible is the only meaningful assertion')
  if (signals.genericLocatorCount > 0 && !signals.hasAccessibleLocator) problems.push('generic locator without role/name/test id')
  if (signals.waitForTimeoutCount > 0) problems.push('arbitrary waitForTimeout usage')
  if (!signals.hasInvariantAnnotation) problems.push('missing invariant annotation')
  if (signals.screenshotThresholdRisk) problems.push('screenshot threshold appears excessive')
  if (/demo|login|auth/i.test(source) && !signals.hasRouteAssertion && !signals.hasLoginAbsenceAssertion) {
    problems.push('auth/demo test lacks URL or login absence/presence assertion')
  }
  return problems
}
