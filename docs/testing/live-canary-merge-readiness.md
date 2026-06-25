# Console Live Canary Merge Readiness

## Scope

Branch: `codex/live-canary-fixes`

Draft PR: <https://github.com/DavidDiaz0317/console/pull/48>

Starting commit for this readiness pass: `a2261b17d2c9a27445b6301b3105190857ca307d`

Final commit: the pushed PR head for `codex/live-canary-fixes` after this report update.

This branch hardens the fork live-canary path by improving shared 429 backoff handling, reducing false zero live data states, adding stable semantic markers, comparing UI/API/Kubernetes facts, expanding browser-matrix evidence, and producing AI-agent-readable failure issues.

The branch is intended for `DavidDiaz0317/console`. It should not be promoted to production from this validation pass.

## Changed Areas

Product/runtime changes directly tied to canary correctness:

- Shared 429 backoff handling in API, agent, retry, SSE, and polling paths.
- Dashboard partial/unavailable behavior so failed namespace calls do not become authoritative zeroes.
- Stable `data-groundtruth-field`, `data-live-route-state`, and `data-live-source` markers.
- Deployment page data path now avoids local-agent fetches in cluster-backed mode and uses the backend API instead.
- Cmd/Ctrl+K onboarding hint no longer renders while the autonomous banner is active, preventing the confirmed visible text overlap.

Test/canary infrastructure changes:

- Deeper live semantic route checks under `web/e2e/visual-login/semantic/**`.
- Browser matrix checks under `web/e2e/visual-login/browser-matrix/**`.
- Browser matrix now waits for semantic field hydration before classifying field mismatches.
- Positive-count contradiction checks are scoped to the active route surface and do not treat unrelated dashboard picker/sidebar text as resource empty-state evidence.
- Browser matrix connection-refused/port-forward failures classify as `canary-setup`.
- Failure issue generation consumes structured browser-matrix `canary-setup` evidence.

Docs:

- `docs/testing/upstream-merge-plan.md`
- `docs/testing/live-canary-merge-readiness.md`

## Validation

Passing checks run locally in this validation pass:

- `git diff --check` - passed.
- `node --check .github/scripts/console-live-promote-failure-issue.cjs` - passed.
- `node --check .github/scripts/console-live-promote-failure-issue.test.cjs` - passed.
- `node --check web/harness/scripts/compareBrowserMatrix.cjs` - passed.
- `node --test .github/scripts/console-live-promote-failure-issue.test.cjs` - 11 tests passed.
- `cd web && npx eslint "e2e/visual-login/**/*.ts" "harness/**/*.ts"` - passed.
- `cd web && npm run test:visual:adequacy` - analyzed 1385 tests, 172 weak tests.
- `cd web && npx playwright test --config e2e/visual-login/intensive.config.ts --project=semantic-groundtruth --grep "@live-site" --list` - 11 tests listed.
- `cd web && npx playwright test --config e2e/visual-login/browser-matrix.config.ts --list` - 3 tests listed.
- `cd web && npx vitest run src/lib/__tests__/rateLimitBackoff.test.ts src/lib/__tests__/api.test.ts` - 24 tests passed.
- `cd web && npx vitest run src/hooks/mcp/__tests__/agentFetch.test.ts src/hooks/mcp/__tests__/fetchWithRetry.test.ts src/hooks/mcp/__tests__/pollingManager-coverage.test.ts src/hooks/mcp/__tests__/workloadQueries.test.ts` - 112 tests passed.
- `cd web && npx vitest run src/components/dashboard/__tests__/Dashboard.test.tsx src/components/nodes/__tests__/Nodes.test.tsx src/components/pods/__tests__/Pods.test.tsx src/components/clusters/__tests__/Clusters.test.tsx src/components/clusters/__tests__/Clusters.progress.test.tsx src/hooks/__tests__/useUniversalStats.test.ts` - 340 tests passed.
- `cd web && npx vitest run src/hooks/__tests__/useCachedCoreWorkloads.test.ts src/components/layout/navbar/__tests__/SearchDropdown.test.tsx src/components/deployments/__tests__/Deployments.test.tsx src/hooks/__tests__/useCachedData.sse-agent.test.ts` - 61 tests passed.
- `cd web && npm run build` - passed with existing bundle/dynamic-import warnings.

Additional evidence check:

- Replayed the prior `28161503418` browser-matrix artifact through the updated comparer. It exited nonzero as expected because the artifact contains critical failures, but the top-level classification changed to `canary-setup` for the connection-refused/port-forward portion instead of mislabeling those routes as semantic UI mismatches.

Known validation caveats:

- `cd web && npx tsc -p tsconfig.node.json --noEmit --pretty false` still fails on existing repo-wide e2e/import-meta type debt, including benchmark dashboard generics, Playwright fixture typing, `ImportMeta.env`, and existing e2e type mismatches. These errors are not introduced by this branch.
- Targeted ESLint over changed source files produced one pre-existing warning for the raw search `<input>` in `SearchDropdown.tsx`; the broader required e2e/harness lint passed.

## CI Status

PR #48 is open as a draft against `DavidDiaz0317/console:main`.

Normal PR CI should be rechecked after the final push for this validation pass.

## GHCR Image

Previous candidate image before this validation pass:

- `ghcr.io/daviddiaz0317/console:a2261b17d2c9a27445b6301b3105190857ca307d`
- Digest: `sha256:0a7c53eb08d2b88bf6097e455f76f253faacacabc0796225990646cf4ae70691`
- Build run: <https://github.com/DavidDiaz0317/console/actions/runs/28160923496>

The final pushed SHA needs a fresh GHCR image before a new canary-only run because this validation pass changes frontend runtime code.

## Canary Status

Latest completed canary-only run before this validation pass:

- Workflow: `Console Live Promote`
- Run: <https://github.com/DavidDiaz0317/console/actions/runs/28161503418>
- Production promotion: disabled / not run.
- Evidence artifact: <https://github.com/DavidDiaz0317/console/actions/runs/28161503418/artifacts/7874820478>
- Corrected branch-local failure issue: <https://github.com/DavidDiaz0317/console/issues/50>

Observed blockers from that run:

- `live-rate-limit-data-loss` from startup/resource API rate limiting.
- Deployment UI showed `0` deployments while API/Kubernetes evidence reported `12`.
- Search hint text overlapped the autonomous banner.
- Browser matrix later saw connection-refused routes from the private port-forward and those are now classified as `canary-setup`.

This validation pass fixed the deployment backend route, tooltip/banner overlap, false dashboard deployment contradiction, browser-matrix hydration timing, and setup classification. A fresh canary-only run is required after the final SHA image is available.

## Merge Readiness

Fork main merge-ready: pending fresh PR CI, GHCR image, and canary-only documentation for the final pushed SHA.

Draft PR review-ready: yes.

Production promotion-ready: no.

Reasons not to promote yet:

- A fresh image must be produced for the final pushed SHA.
- `Console Live Promote` must be rerun with `promoteProduction=false`.
- If the canary still fails, the failure must remain blocking unless it is proven to be external setup and documented.

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
