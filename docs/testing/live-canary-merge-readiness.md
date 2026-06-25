# Console Live Canary Merge Readiness

## Scope

Branch: `codex/live-canary-fixes`

Draft PR: <https://github.com/DavidDiaz0317/console/pull/48>

Runtime commit validated by image/canary: `8294233e796cc06f81193f92c662f31e46da0a18`

This report update also includes workflow/evidence classification hardening after that runtime commit. The final pushed branch head is the PR head for this readiness pass.

This branch hardens the fork live-canary path by improving shared `429` backoff handling, avoiding false zero live-data states, adding stable semantic markers, comparing UI/API/Kubernetes facts, expanding browser-matrix evidence, and producing AI-agent-readable failure issues.

This pass did not merge to `main`, did not promote production, did not update screenshot baselines, and did not weaken live/visual assertions.

## Changed Areas

Product/runtime changes tied to canary correctness:

- Shared `429` backoff handling in API, agent, retry, SSE, and polling paths.
- Dashboard partial/unavailable behavior so failed namespace calls are not treated as authoritative zeroes.
- Stable `data-groundtruth-field`, `data-live-route-state`, and `data-live-source` markers.
- Cluster-backed deployment data now uses the backend API path instead of local-agent-only data.
- Optional dashboard data fetches are reduced so the live dashboard does not mount every optional data hook by default.
- Search/onboarding banner layout was tightened to reduce confirmed text-overlap noise.

Test/canary infrastructure changes:

- Deeper live semantic route checks under `web/e2e/visual-login/semantic/**`.
- Cross-browser live browser matrix checks under `web/e2e/visual-login/browser-matrix/**`.
- API-vs-UI and Kubernetes-groundtruth evidence now records route state, API counts, UI counts, request counts, rate-limit evidence, and classifications.
- Browser matrix comparison distinguishes canary setup, rate-limit data loss, browser semantic field mismatches, and generic network errors.
- Failure issue generation prioritizes setup/rate-limit/UI-data/dashboard/core-route failures before secondary text-overlap findings.

Fork/private workflow and docs:

- `Console Live Promote` remains guarded to `github.repository == 'DavidDiaz0317/console'`.
- `docs/testing/upstream-merge-plan.md` documents upstream-safe slices and fork-private infrastructure.
- `docs/testing/live-canary-merge-readiness.md` records this validation pass.

Scope audit notes:

- `.github/workflows/claude-code-review.yml` is included because the fork PR flow needs a safe Claude-auth skip instead of a missing-secret failure.
- `web/e2e/visual/app-visual-regression.spec.ts` is included because it stabilizes local/session state for visual regression and avoids dynamic hint noise.
- `web/src/components/layout/navbar/SearchDropdown.tsx` is included because the live interaction suite caught search/overlay behavior.

## Local Validation

Passing checks run in this pass:

- `git diff --check` - passed before the report update.
- `node --check .github/scripts/console-live-promote-failure-issue.cjs` - passed.
- `node --check .github/scripts/console-live-promote-failure-issue.test.cjs` - passed.
- `node --check web/harness/scripts/compareBrowserMatrix.cjs` - passed.
- `node --test .github/scripts/console-live-promote-failure-issue.test.cjs` - 12 tests passed.
- `cd web && npx eslint "e2e/visual-login/**/*.ts" "harness/**/*.ts"` - passed.
- `cd web && npm run test:visual:adequacy` - analyzed 1385 tests, 172 weak tests.
- `cd web && npx playwright test --config e2e/visual-login/intensive.config.ts --project=semantic-groundtruth --grep "@live-site" --list` - 11 tests listed.
- `cd web && npx playwright test --config e2e/visual-login/browser-matrix.config.ts --list` - 3 tests listed.
- `cd web && npx vitest run src/lib/__tests__/rateLimitBackoff.test.ts src/lib/__tests__/api.test.ts src/lib/__tests__/sseClient.test.ts` - 51 tests passed.
- `cd web && npx vitest run src/hooks/mcp/__tests__/agentFetch.test.ts src/hooks/mcp/__tests__/fetchWithRetry.test.ts src/hooks/mcp/__tests__/pollingManager-coverage.test.ts src/hooks/mcp/__tests__/workloadQueries.test.ts src/hooks/mcp/__tests__/compute.gpu.test.ts src/hooks/mcp/__tests__/compute.nvidia.test.ts` - 183 tests passed.
- `cd web && npx vitest run src/components/dashboard/__tests__/Dashboard.test.tsx src/components/nodes/__tests__/Nodes.test.tsx src/components/pods/__tests__/Pods.test.tsx src/components/clusters/__tests__/Clusters.test.tsx src/components/clusters/__tests__/Clusters.progress.test.tsx src/hooks/__tests__/useUniversalStats.test.ts src/components/InitialInfrastructureGate.test.tsx` - 349 tests passed.
- `cd web && npx vitest run src/hooks/__tests__/useCachedCoreWorkloads.test.ts src/hooks/__tests__/useCachedData.sse-agent.test.ts src/components/deployments/__tests__/Deployments.test.tsx src/components/deployments/__tests__/Deployments.badge.test.tsx src/components/layout/navbar/__tests__/SearchDropdown.test.tsx` - 65 tests passed.
- `cd web && npm run build` - passed with existing dynamic-import and bundle-size warnings; post-build safety checks passed.

Additional evidence check:

- Replayed the latest downloaded browser-matrix evidence from run `28168717007` through the updated comparer. It still exits nonzero because the canary evidence contains critical failures, but the top-level classification is now `canary-setup` for the port-forward/connection-refused portion, while semantic field failures remain in the details.

Known validation caveat:

- `cd web && npx tsc -p tsconfig.node.json --noEmit --pretty false` still fails on existing repo-wide e2e and `ImportMeta.env` type debt, including benchmark dashboard generics, Playwright fixture typing, `Window`/`ImportMeta` declarations, and existing e2e type mismatches. These are not introduced by this branch.

## PR CI

PR #48 is open as a draft against `DavidDiaz0317/console:main`.

Before the final local changes in this report, PR #48 was `CLEAN` and normal PR checks were success or skipped, including Auth Drift, build, CodeQL, fullstack smoke, visual login guard, and visual regression. PR CI should be rechecked after the final push.

## GHCR Image

Candidate image validated for the latest runtime commit:

- Image: `ghcr.io/daviddiaz0317/console:8294233e796cc06f81193f92c662f31e46da0a18`
- Digest: `sha256:f442b14b5ee1793fb8240ee712214ebabb6a9963422d9b04af16e1fbec2ced83`
- Build run: <https://github.com/DavidDiaz0317/console/actions/runs/28168161662>

The final report/classifier commit does not change frontend runtime source. If a future promotion requires the exact PR head SHA as the image tag, dispatch a fresh `Build and Deploy KC` run for the final head before rerunning canary promotion.

## Canary Status

Latest canary-only run:

- Workflow: `Console Live Promote`
- Run: <https://github.com/DavidDiaz0317/console/actions/runs/28168717007>
- Candidate SHA: `8294233e796cc06f81193f92c662f31e46da0a18`
- Production promotion: skipped / blocked.
- Evidence artifact: <https://github.com/DavidDiaz0317/console/actions/runs/28168717007/artifacts/7877913788>
- Existing generated issue before the final classifier fix: <https://github.com/DavidDiaz0317/console/issues/54>

Groundtruth from that run:

- Reachable contexts: `3`
- Ready nodes: `6`
- Total nodes: `6`
- Pods: `51` total, `51` running at collector time
- Namespaces: `16`
- Deployments: `12` total, `12` available

Observed canary blockers:

- Semantic data drift/data-loss cases: pod totals changed during the run, and later route checks saw zero nodes/pods from unavailable live data.
- Dashboard namespace evidence became unparseable/null instead of a stable authoritative count.
- Deployments rendered `0` in browser-matrix evidence while groundtruth expected `12`.
- A visible text overlap was still present between the update banner and the autonomous-project banner.
- Browser matrix later hit private canary port-forward/connection-refused failures, now classified as `canary-setup` when replayed locally.

These are valid blockers. The branch should keep failing canary promotion until the product/setup issue behind each failure is resolved or proven external and documented.

## Merge Readiness

Draft PR review-ready: yes.

Merge-ready into fork `main`: no, not yet. It needs post-push PR CI and a final canary-only outcome that is either green or accepted as correctly classified existing live-site defects.

Production promotion-ready: no.

Upstream-ready as one PR: no.

Upstream-ready as sliced PRs: yes. Use `docs/testing/upstream-merge-plan.md` for the planned slices:

1. Rate-limit/backoff handling and partial live route state.
2. Semantic markers.
3. Duplicate-safe assertion helpers.
4. PR-safe visual/login harness pieces.
5. Optional live groundtruth collector behind env flags.
6. Browser matrix checks behind env flags.
7. Optional evidence/failure issue workflow.

## Remaining Risks

- Live Kubernetes data is dynamic; semantic/API/Kubernetes comparisons should remain the gate, while raw screenshots stay advisory unless masked.
- Rate limiting can still occur under real cluster pressure; tests should classify it as live data loss rather than converting it to zero-count UI defects.
- Browser matrix failures should continue to fail only on named controls, semantic mismatches, overlay ordering, text collisions, route content loss, or canary setup failures.
- Fork-private infrastructure (`console-live.kubestellar.io`, OCI/OKE contexts, OAuth allowlists, and `ghcr.io/daviddiaz0317/console`) must stay out of upstream PRs unless upstream explicitly adopts equivalent infrastructure.
