# Adding Invariants And Mutations

## Add An Invariant

Edit:

```text
web/harness/invariants/visual-login-invariants.yml
```

Use product truths, not implementation trivia. Good invariants describe behavior a maintainer would care about:

- "Hosted demo must not require GitHub login."
- "Cluster dashboard UI should match Kubernetes ground truth when live clusters are configured."

Each invariant needs:

- `id`
- `area`
- `severity`
- `description`
- `required`
- `forbidden`

## Tag A Test

Use both a tag and an annotation when practical:

```ts
test('hosted demo does not require login @invariant:hosted-demo-no-login', async ({ page }, testInfo) => {
  testInfo.annotations.push({ type: 'invariant', description: 'hosted-demo-no-login' })
})
```

## Add A Mutation Scenario

Add a scenario under:

```text
web/harness/mutations/scenarios/
```

Then register it in:

```text
web/harness/mutations/mutationRegistry.ts
```

A scenario defines:

- `id`
- `description`
- `targetInvariants`
- `expectedFailingTests`
- `setup`
- optional `cleanup`
- optional `skipCondition`

Prefer Playwright route interception, deterministic HTML/API mocks, or test-only init scripts. Do not add production-visible broken behavior.

## Interpret Results

- `killed`: expected invariant test failed under the injected fault
- `survived`: expected invariant test passed despite broken behavior
- `invalid`: mutation setup failed
- `skipped`: required feature/config was unavailable
- `flaky`: repeated attempts disagreed

Critical survived mutants should block the intensive workflow and should become follow-up PRs that add stronger invariant-mapped tests.
