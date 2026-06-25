# Console Live Canary Merge Readiness

## Scope

Branch: `codex/live-canary-fixes`

Draft PR: <https://github.com/DavidDiaz0317/console/pull/48>

Current validation pass: local working tree on top of `0755c04c1209293ce38744d5fce6a2b8fe0c14d1`. The final pushed SHA is the commit that contains this report update.

This branch hardens the fork live-canary path by improving shared 429 backoff handling, reducing Dashboard request fan-out, preserving partial live data instead of rendering false zeroes, adding stable semantic markers, comparing UI/API/Kubernetes facts, expanding browser-matrix evidence, and producing AI-agent-readable failure issues.

The branch is intended for `DavidDiaz0317/console`. It should stay draft until the final pushed SHA has completed CI and the live canary outcome is either green or a documented real product failure.

## Changed Areas

Product/runtime changes directly tied to canary correctness:

- Shared 429 backoff handling in `web/src/lib/rateLimitBackoff.ts`, `web/src/lib/api.ts`, `web/src/hooks/mcp/agentFetch.ts`, `web/src/hooks/mcp/fetchWithRetry.ts`, and `web/src/lib/sseClient.ts`.
- Shared MCP polling now skips background refresh callbacks while the global Retry-After backoff is active.
- `usePodIssues` preserves cached data and avoids repeated warning logs during active backoff.
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

Docs:

- `docs/testing/upstream-merge-plan.md`
- `docs/testing/live-canary-merge-readiness.md`

## Validation

Passing checks run locally in this validation pass:

- `git diff --check` - passed.
- `node --check .github/scripts/console-live-promote-failure-issue.cjs` - passed.
- `node --check .github/scripts/console-live-promote-failure-issue.test.cjs` - passed.
- `node --check web/harness/scripts/compareBrowserMatrix.cjs` - passed.
- `node --test .github/scripts/console-live-promote-failure-issue.test.cjs` - 10 tests passed.
- `cd web && npx eslint "e2e/visual-login/**/*.ts" "harness/**/*.ts"` - passed.
- `cd web && npx vitest run src/lib/__tests__/rateLimitBackoff.test.ts` - 7 tests passed.
- `cd web && npx vitest run src/hooks/mcp/__tests__/pollingManager-coverage.test.ts` - 12 tests passed.
- `cd web && npx vitest run src/hooks/mcp/__tests__/workloadQueries.test.ts` - 60 tests passed.
- `cd web && npx vitest run src/hooks/mcp/__tests__/agentFetch.test.ts src/hooks/mcp/__tests__/fetchWithRetry.test.ts` - 40 tests passed.
- `cd web && npx vitest run src/lib/__tests__/api.test.ts` - 17 tests passed.
- `cd web && npx vitest run src/components/dashboard/__tests__/Dashboard.test.tsx src/components/nodes/__tests__/Nodes.test.tsx src/components/pods/__tests__/Pods.test.tsx src/components/clusters/__tests__/Clusters.test.tsx src/components/clusters/__tests__/Clusters.progress.test.tsx src/hooks/__tests__/useUniversalStats.test.ts` - 340 tests passed.
- `cd web && npm run test:visual:adequacy` - analyzed 1385 tests, 172 weak tests.
- `cd web && npx playwright test --config e2e/visual-login/intensive.config.ts --project=semantic-groundtruth --grep "@live-site" --list` - 11 tests listed.
- `cd web && npx playwright test --config e2e/visual-login/browser-matrix.config.ts --list` - 3 tests listed.
- `cd web && npm run build` - passed, including post-build safety checks.

Known validation caveats:

- `cd web && npx tsc -p tsconfig.node.json --noEmit --pretty false` still fails on existing repo-wide e2e/import-meta type debt, including benchmark dashboard generics, Playwright fixture typing, `ImportMeta.env`, and existing e2e type mismatches. These errors are not introduced by this branch.
- A combined Vitest invocation with several large hook files initially hit Node heap pressure before the `usePodIssues` backoff loop was fixed. After the fix, the affected workload hook file passes by itself with normal heap.

## CI Status

PR #48 should be rechecked after the final push.

Previous PR CI for `0755c04c1209293ce38744d5fce6a2b8fe0c14d1` was clean before this local hardening pass.

## GHCR Image

Confirmed existing candidate image before this report/update commit:

- `ghcr.io/daviddiaz0317/console:e09f84579f72868a586b5890ce128e090d55155c`
- Digest: `sha256:5c868207f8439a6d49e1c99de9ae0fa5f21ec82b709c2da56b8d5d1517ffd82c`
- Build run: <https://github.com/DavidDiaz0317/console/actions/runs/28156396267>

The final pushed SHA needs its own GHCR image before a fresh canary-only run, because this validation pass changes frontend runtime code.

## Canary Status

Latest completed canary-only run before this local hardening:

- Workflow: `Console Live Promote`
- Run: <https://github.com/DavidDiaz0317/console/actions/runs/28157231355>
- Production promotion: disabled / not run.
- Evidence artifact: <https://github.com/DavidDiaz0317/console/actions/runs/28157231355/artifacts/7873432984>
- Failure issue: <https://github.com/DavidDiaz0317/console/issues/27>

Manual evidence review found the primary current blocker is real `429` rate-limit data loss. The screenshot showed an Infrastructure Connection Error with `/api/stellar/state` and `/api/kagent/status` rate-limited, and the evidence contained repeated `GET 429` responses for `/api/agent/token`, `/api/mcp/pod-issues/stream`, `/api/mcp/clusters`, rewards endpoints, and nightly e2e endpoints.

This local update fixes the issue classifier so rate-limit data loss outranks secondary text-collision evidence, and it reduces avoidable client request pressure during active backoff. The next failed canary should classify this as `live-rate-limit-data-loss` unless a different primary failure appears.

## Merge Readiness

Fork main merge-ready: no, not yet.

Draft PR review-ready: yes, after the final push and CI rerun starts.

Reasons not to merge yet:

- Final pushed SHA must complete normal PR CI.
- A GHCR image must be produced for the final SHA.
- `Console Live Promote` should be rerun with `promoteProduction=false`.
- If the canary still fails, the failure must be either fixed or documented as a real live-product blocker that keeps production promotion disabled.

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
- Browser matrix failures should continue to fail only on named controls, semantic mismatches, overlay ordering, text collisions, or route content loss.
- Fork-private infrastructure (`console-live.kubestellar.io`, OCI/OKE contexts, OAuth allowlists, and `ghcr.io/daviddiaz0317/console`) must stay out of upstream PRs unless upstream explicitly adopts equivalent infrastructure.
