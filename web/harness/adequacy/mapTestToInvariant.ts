const INVARIANT_TAG_PATTERN = /@invariant:([a-z0-9-]+)/g
const ANNOTATION_PATTERN = /type:\s*['"`]invariant['"`]\s*,\s*description:\s*['"`]([^'"`]+)['"`]/g

export function mapTestToInvariant(title: string, source: string): string[] {
  const ids = new Set<string>()
  for (const match of source.matchAll(INVARIANT_TAG_PATTERN)) ids.add(match[1])
  for (const match of source.matchAll(ANNOTATION_PATTERN)) ids.add(match[1])

  const haystack = `${title}\n${source}`.toLowerCase()
  if (/hosted demo|demo no-login|no login|github login.*absent/.test(haystack)) ids.add('hosted-demo-no-login')
  if (/auth mode|oauth configured|local auth/.test(haystack)) ids.add('local-auth-mode-correct')
  if (/auth.*separation|swapped/.test(haystack)) ids.add('auth-mode-separation')
  if (/login layout|login.*viewport|login.*overlap/.test(haystack)) ids.add('login-layout-stable')
  if (/dashboard.*visual|dashboard.*smoke|blank page|stuck loading/.test(haystack)) ids.add('demo-dashboard-visual-smoke')
  if (/ai mission/.test(haystack)) ids.add('ai-mission-entrypoint-usable-if-enabled')
  if (/ground.?truth|cluster count|pod status/.test(haystack)) ids.add('cluster-dashboard-groundtruth-match')
  if (/console error|runtime error|pageerror/.test(haystack)) ids.add('no-critical-runtime-errors')
  return [...ids]
}

export function likelyProtectedArea(invariantIds: string[]): string {
  if (invariantIds.some(id => id.includes('auth') || id.includes('login'))) return 'auth'
  if (invariantIds.some(id => id.includes('groundtruth'))) return 'semantic'
  if (invariantIds.some(id => id.includes('ai-mission'))) return 'AI mission'
  if (invariantIds.some(id => id.includes('visual') || id.includes('layout'))) return 'visual'
  return 'unknown'
}
