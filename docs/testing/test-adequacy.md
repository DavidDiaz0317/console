# Test Adequacy

Adequacy is the harness layer that asks whether a Playwright test protects a product invariant or merely passes.

Invariant registry:

```text
web/harness/invariants/visual-login-invariants.yml
```

Analyzer command:

```bash
cd web
npm run test:visual:adequacy
```

Outputs:

- `web/test-results/reports/adequacy-report.json`
- `web/test-results/reports/adequacy-report.md`

## Scoring

The analyzer scans Playwright tests and fixtures for:

- invariant annotations and `@invariant:<id>` tags
- meaningful `expect` calls
- route assertions
- negative assertions
- visual/layout assertions
- accessible locators and stable test ids
- generic/body-only locators
- arbitrary `waitForTimeout`
- no-op assertions
- risky screenshot thresholds

Scores:

- `90-100`: strong, invariant-mapped, meaningful, mutation-proven
- `70-89`: good, meaningful, missing one dimension
- `50-69`: partial smoke coverage
- `25-49`: weak smoke coverage
- `0-24`: unsafe/no-op/body-only/misleading

The fixture `web/harness/adequacy/fixtures/weak-body-only.spec.ts` must score low. The fixture `strong-demo-no-login.spec.ts` must score higher because it asserts URL, absence of GitHub login, and dashboard content.

## Healer Guardrail

`web/harness/adequacy/detectHealerWeakening.ts` compares before/after tests and flags:

- removed invariant annotations
- removed negative assertions
- removed URL assertions
- removed visual assertions
- specific assertions replaced with body-visible checks
- increased screenshot thresholds without an allowlist comment
- removed ground-truth comparisons
- changed route under test
- removed "demo must not require login" intent

Generated or healed tests should not be accepted as strong until they preserve invariant intent and kill relevant mutations.
