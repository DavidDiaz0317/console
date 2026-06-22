import fs from 'node:fs'
import path from 'node:path'

export interface HealerWeakeningFinding {
  type: string
  message: string
  severity: 'critical' | 'major' | 'minor'
}

function count(pattern: RegExp, source: string): number {
  return (source.match(pattern) || []).length
}

function firstRoute(source: string): string | null {
  const match = source.match(/page\.goto\s*\(\s*['"`]([^'"`]+)['"`]/)
  return match?.[1] || null
}

export function detectHealerWeakening(beforeSource: string, afterSource: string): HealerWeakeningFinding[] {
  const findings: HealerWeakeningFinding[] = []
  const checks = [
    {
      type: 'removed-invariant',
      before: count(/@invariant:|type:\s*['"`]invariant['"`]/g, beforeSource),
      after: count(/@invariant:|type:\s*['"`]invariant['"`]/g, afterSource),
      message: 'removed invariant annotation',
      severity: 'critical' as const,
    },
    {
      type: 'removed-negative-assertion',
      before: count(/\.not\.|toHaveCount\s*\(\s*0\s*\)|not\.toMatch|not\.toContain/g, beforeSource),
      after: count(/\.not\.|toHaveCount\s*\(\s*0\s*\)|not\.toMatch|not\.toContain/g, afterSource),
      message: 'removed negative assertion',
      severity: 'critical' as const,
    },
    {
      type: 'removed-url-assertion',
      before: count(/toHaveURL|page\.url\s*\(/g, beforeSource),
      after: count(/toHaveURL|page\.url\s*\(/g, afterSource),
      message: 'removed URL assertion',
      severity: 'major' as const,
    },
    {
      type: 'removed-visual-assertion',
      before: count(/toHaveScreenshot|screenshot\s*\(|boundingBox\s*\(/g, beforeSource),
      after: count(/toHaveScreenshot|screenshot\s*\(|boundingBox\s*\(/g, afterSource),
      message: 'removed visual/layout assertion',
      severity: 'major' as const,
    },
    {
      type: 'removed-groundtruth',
      before: count(/ground.?truth|kubectl|KUBECONFIG|cluster count|pod status/gi, beforeSource),
      after: count(/ground.?truth|kubectl|KUBECONFIG|cluster count|pod status/gi, afterSource),
      message: 'removed ground-truth comparison',
      severity: 'critical' as const,
    },
  ]

  for (const check of checks) {
    if (check.before > check.after) {
      findings.push({ type: check.type, message: check.message, severity: check.severity })
    }
  }

  if (/locator\s*\(\s*['"`]body['"`]\s*\).*toBeVisible/s.test(afterSource)
    && !/locator\s*\(\s*['"`]body['"`]\s*\).*toBeVisible/s.test(beforeSource)) {
    findings.push({
      type: 'replaced-with-body-visible',
      message: 'replaced specific assertions with body-visible smoke',
      severity: 'critical',
    })
  }

  if (/maxDiff(?:Pixels|PixelRatio)|threshold/.test(afterSource)) {
    const beforeThresholds = count(/maxDiff(?:Pixels|PixelRatio)|threshold/g, beforeSource)
    const afterThresholds = count(/maxDiff(?:Pixels|PixelRatio)|threshold/g, afterSource)
    if (afterThresholds > beforeThresholds && !/allowlist|intentional|approved/i.test(afterSource)) {
      findings.push({
        type: 'increased-screenshot-threshold',
        message: 'increased screenshot threshold without an allowlist comment',
        severity: 'major',
      })
    }
  }

  const beforeRoute = firstRoute(beforeSource)
  const afterRoute = firstRoute(afterSource)
  if (beforeRoute && afterRoute && beforeRoute !== afterRoute) {
    findings.push({
      type: 'changed-route-under-test',
      message: `changed route under test from ${beforeRoute} to ${afterRoute}`,
      severity: 'critical',
    })
  }

  if (/demo.*not.*login|hosted-demo-no-login/i.test(beforeSource)
    && !/demo.*not.*login|hosted-demo-no-login/i.test(afterSource)) {
    findings.push({
      type: 'removed-demo-no-login-intent',
      message: 'removed demo must not require login intent',
      severity: 'critical',
    })
  }

  return findings
}

export function compareHealedFiles(beforePath: string, afterPath: string): HealerWeakeningFinding[] {
  return detectHealerWeakening(
    fs.readFileSync(path.resolve(beforePath), 'utf8'),
    fs.readFileSync(path.resolve(afterPath), 'utf8'),
  )
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  const [beforePath, afterPath] = process.argv.slice(2)
  const defaultBefore = 'harness/adequacy/fixtures/bad-healed-demo-no-login.before.ts'
  const defaultAfter = 'harness/adequacy/fixtures/bad-healed-demo-no-login.after.ts'
  const findings = compareHealedFiles(beforePath || defaultBefore, afterPath || defaultAfter)
  console.log(JSON.stringify({ findings }, null, 2))
  if (findings.some(finding => finding.severity === 'critical')) process.exitCode = 2
}
