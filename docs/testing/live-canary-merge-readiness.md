# Console Live Canary Merge Readiness

## Scope

Branch: `codex/live-canary-fixes`

Draft PR: <https://github.com/DavidDiaz0317/console/pull/48>

Validation baseline before this report/update commit: `552165f2a84d8e60b077edfbca891a8abd3ff1c8`

This branch hardens the fork live-canary path by adding shared rate-limit backoff handling, reducing live Dashboard request fan-out, adding stable live semantic markers, comparing UI/API/Kubernetes facts, expanding browser-matrix evidence, and improving AI-agent-readable failure issues.

The branch is intended for `DavidDiaz0317/console`. It should stay draft until the final pushed SHA has completed CI and the live canary outcome is either green or a documented real product failure.

## Changed Areas

Product/runtime changes directly tied to canary correctness:

- Shared `429` backoff handling in `web/src/lib/rateLimitBackoff.ts`, `web/src/lib/api.ts`, `web/src/hooks/mcp/agentFetch.ts`, `web/src/hooks/mcp/fetchWithRetry.ts`, and `web/src/lib/sseClient.ts`.
- Dashboard live request pressure reduction through `useCoreUniversalStats`.
- Dashboard namespace partial/unavailable handling so failed namespace calls do not become authoritative zeroes.
- Stable `data-groundtruth-field`, `data-live-route-state`, and `data-live-source` markers on dashboard/resource pages.
- Demo-mode guard so synthetic demo clusters are not treated as live namespace failures.

Test/canary infrastructure changes:

- Deeper live semantic route checks under `web/e2e/visual-login/semantic/**`.
- Browser matrix checks under `web/e2e/visual-login/browser-matrix/**`.
- Structured evidence collection in `web/harness/**`.
- Failure issue classification in `.github/scripts/console-live-promote-failure-issue.cjs`.
- Fork-only promotion workflow hardening in `.github/workflows/console-live-promote.yml`.
- Claude review workflow permission fix for OIDC (`id-token: write`).

Docs:

- `docs/testing/upstream-merge-plan.md`
- `docs/testing/live-canary-merge-readiness.md`

## Validation

Passing checks run locally after the final code fixes:

- `git diff --check` - passed.
- `node --check .github/scripts/console-live-promote-failure-issue.cjs` - passed.
- `node --check .github/scripts/console-live-promote-failure-issue.test.cjs` - passed.
- `node --check web/harness/scripts/compareBrowserMatrix.cjs` - passed.
- `node --test .github/scripts/console-live-promote-failure-issue.test.cjs` - 9 passed.
- `cd web && npx eslint "e2e/visual-login/**/*.ts" "harness/**/*.ts" e2e/visual/app-visual-regression.spec.ts src/components/dashboard/__tests__/Dashboard.test.tsx` - passed.
- `cd web && npm run test -- src/lib/__tests__/rateLimitBackoff.test.ts src/lib/__tests__/api.test.ts src/hooks/mcp/__tests__/agentFetch.test.ts src/hooks/mcp/__tests__/fetchWithRetry.test.ts src/components/dashboard/__tests__/Dashboard.test.tsx src/components/nodes/__tests__/Nodes.test.tsx src/components/pods/__tests__/Pods.test.tsx src/components/clusters/__tests__/Clusters.test.tsx src/components/clusters/__tests__/Clusters.progress.test.tsx src/hooks/__tests__/useUniversalStats.test.ts --run` - 10 files, 404 tests passed.
- `cd web && npm run test:visual:adequacy` - analyzed 1385 tests, 172 weak tests.
- `cd web && npx playwright test --config e2e/visual-login/intensive.config.ts --project=semantic-groundtruth --grep "@live-site" --list` - 11 tests listed.
- `cd web && npx playwright test --config e2e/visual-login/browser-matrix.config.ts --list` - 3 tests listed.
- `cd web && npm run build` - passed after 359.5 seconds, including post-build safety checks.

Known validation failures or caveats:

- `cd web && npx tsc -p tsconfig.node.json --noEmit --pretty false` fails on existing repo-wide e2e/import-meta type debt, including benchmark dashboard generics, Playwright fixture typing, `ImportMeta.env`, and several existing e2e type mismatches. These errors are not introduced by this branch.
- Direct `eslint` on `web/src/components/dashboard/DashboardState.ts` reports existing React Compiler lint debt in that large file (`react-hooks/refs`, `react-hooks/set-state-in-effect`, and memo preservation). This branch does not broad-disable those rules.

## CI Status

PR #48 at `552165f2a84d8e60b077edfbca891a8abd3ff1c8` had two notable non-live failures:

- `App Visual Regression` failed on dashboard screenshots. Manual artifact review showed a real branch regression where demo clusters with empty namespace arrays rendered as `namespaces unavailable`, plus nondeterministic dashboard tip text. This report update fixes both without updating baselines.
- `Claude Code Review` failed before review because the workflow could not request an OIDC token. This report update adds `id-token: write` and write scopes needed for PR comments.

After the final push, CI must be checked again on the new PR head before merging.

## GHCR Image

Confirmed existing image before this report/update commit:

- `ghcr.io/daviddiaz0317/console:552165f2a84d8e60b077edfbca891a8abd3ff1c8`
- Digest: `sha256:f6265c0d67d493184c326a67e9bbc809154230841b079d1bd9e66267dcf30d5f`
- Build run: <https://github.com/DavidDiaz0317/console/actions/runs/28151995811>

The final pushed SHA needs its own GHCR image if it will be canary-tested or promoted.

## Canary Status

Latest canary-only run:

- Workflow: `Console Live Promote`
- Run: <https://github.com/DavidDiaz0317/console/actions/runs/28149121962>
- Production promotion: disabled / not run.
- Result: cancelled after canary failures and timeout; production remained blocked.
- Failure issue: <https://github.com/DavidDiaz0317/console/issues/50>
- Current classification: `live-rate-limit-data-loss`

The canary evidence is useful and issue-ready. It shows live route/API data loss and related UI mismatches, including deployment count mismatch evidence and rate-limit/startup-error evidence. The test should not be weakened to pass over these failures.

## Merge Readiness

Fork main merge-ready: no, not yet.

Draft PR review-ready: yes, after the final push and CI rerun starts.

Reasons not to merge yet:

- Final pushed SHA must complete normal PR CI.
- A GHCR image should be produced for the final SHA before a fresh canary-only run.
- `Console Live Promote` should be rerun with `promoteProduction=false`.
- Issue #50 must either be fixed or explicitly accepted as a real live-product blocker that keeps production promotion disabled.

Upstream-ready as one PR: no.

Upstream-ready as sliced PRs: yes. Use `docs/testing/upstream-merge-plan.md` for the planned slices:

1. Semantic markers.
2. Duplicate-safe assertion helpers.
3. PR-safe visual/login harness pieces.
4. Optional live groundtruth collector behind env flags.
5. Browser matrix checks behind env flags.
6. Optional evidence/failure issue workflow.

## Remaining Risks

- Live Kubernetes data is dynamic; semantic/API/Kubernetes comparisons should remain the gate, while raw screenshots stay advisory unless masked.
- Rate limiting can still occur under real cluster pressure; tests should classify it as live data loss rather than converting it to zero-count UI defects.
- Browser matrix failures should continue to fail only on named controls, semantic mismatches, overlay ordering, text collisions, or route content loss.
- Fork-private infrastructure (`console-live.kubestellar.io`, OCI/OKE contexts, OAuth allowlists, and `ghcr.io/daviddiaz0317/console`) must stay out of upstream PRs unless upstream explicitly adopts equivalent infrastructure.
