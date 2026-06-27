# Post-Merge Canary Stabilization

## Starting State

- Branch: `codex/post-merge-canary-stabilization`
- Base branch requested: `main`
- Current fork `main` commit at branch creation: `380fb7fd016994dd13c1ed96aa1fc46159efbd22`
- Fork `main` after June 26 sync: `c7371aa7c`
- Upstream `main` included after sync: `f1740da9c`
- Backup branch before sync: `backup/fork-main-before-upstream-sync-20260626-215039`
- PR #48 merge commit from GitHub metadata: `02b2dd52a44284aed273a19b8b5af35ab0f311d1`
- Post-merge verification run: `28190200153`
- Current live canary issue: `#54`

## Main Branch Note

GitHub still records PR #48 as merged into `main` at `02b2dd52a44284aed273a19b8b5af35ab0f311d1`, but the current fork `main` now points at `c7371aa7c`, a merge of upstream `main` at `f1740da9c` plus the fork-private live/auth testing layer. Those two commits are not ancestors of each other.

For this stabilization branch, the working base is the current fork `main` so the fork remains aligned with current upstream. The #48 changes are treated as the behavior and evidence to port/stabilize rather than as the branch base.

## Post-Merge Verification Failure Table

| Spec | Failure pattern | Likely cause | Fix path |
|---|---|---|---|
| `e2e/Clusters.spec.ts` | 18 failures waiting for `data-testid="clusters-page"` while the page snapshot was literal `{}` | `mockApiFallback()` registered `https://console.kubestellar.io/**` and fulfilled every hosted URL, including the document shell, with JSON `{}` | Restrict the hosted-console fallback to `/api/*` only and `route.fallback()` for documents/assets |
| `e2e/Dashboard.spec.ts` | 9 failures waiting for `#root`, dashboard API responses, or cluster rows while the page never hydrated | Same app-shell interception; later `waitForResponse` failures were cancellation fallout | Same helper fix, plus avoid running post-merge against stale production when deploy propagation times out |
| `e2e/Events.spec.ts` | 7 failures waiting for Events page/header content | Same app-shell interception | Same helper fix |
| `e2e/GPUOverview.spec.ts` | 3 failures waiting for GPU overview headings/content | Same app-shell interception | Same helper fix |
| `e2e/NamespaceOverview.spec.ts` | 5 failures waiting for namespace cluster selectors | Same app-shell interception | Same helper fix |
| `e2e/navbar-responsive.spec.ts` | 8 failures waiting for `nav[data-tour="navbar"]`; page snapshot was literal `{}` | Same app-shell interception | Same helper fix |
| Workflow run `28190200153` | `Wait for Netlify deploy` timed out, then tests ran against current production anyway; `Run Playwright E2E` later cancelled | Timeout path mixed stale production with checked-out test code and made failure attribution ambiguous | Build and serve a local preview of the checked-out commit when deploy readiness times out |

## Fixes In This Branch

- `web/e2e/helpers/setup.ts`: the hosted `console.kubestellar.io` fallback now only mocks `/api/*`; documents, chunks, CSS, and other assets load normally.
- `.github/workflows/post-merge-verify.yml`: deploy-timeout fallback now builds `web` and serves a local Vite preview instead of testing whatever production currently serves. The targeted-test timeout was raised from 15 to 35 minutes to cover build plus the selected specs.
- `.github/workflows/console-live-promote.yml`: scheduled/manual default is canary-only unless `promoteProduction=true` is explicitly selected. The live route delay defaults to 15 seconds, and browser matrix/adequacy runs are skipped when semantic live checks already failed.
- `.github/workflows/console-live-macos-canary.yml`: macOS/WebKit popup checks use the same 15 second default live-route delay.
- `web/e2e/visual-login/helpers/liveSiteAssertions.ts`: known optional/background live endpoints are recorded but do not block core route checks as generic network failures.
- `.github/scripts/console-live-promote-failure-issue.cjs`: `429` evidence is now split into core resource rate limits versus optional/background endpoint pressure, so issue #54-style reports identify the actual blocker instead of lumping all rate limits together.
- `.github/workflows/build-deploy.yml`: the GHCR image name is normalized to lowercase before Docker metadata/build/manifest/deploy steps. This fixes fork PR builds where `github.repository` is `DavidDiaz0317/console`, because Docker rejects uppercase repository names.
- `web/playwright.config.ts`: the generic Playwright E2E workflow now ignores `auth-drift/**` and `visual-login/**`. Those suites require dedicated configs/workflows for their server, OAuth, and live-session setup; including them in generic E2E produced false `127.0.0.1:4176` and live-canary timeout failures.

## PR #65 Check Triage

| Check | Observed run | Classification | Current handling |
|---|---|---|---|
| Build and Deploy KC | `28274238048` | Branch/fork workflow bug | Fixed by lowercasing `IMAGE_NAME`; failed log showed `failed to parse ref "ghcr.io/DavidDiaz0317/console"` |
| Auth Drift / Local Login UI Drift | `28274238064` | Existing fork-main auth drift baseline mismatch | Not changed here. The product unit test asserts no terms footer, while the screenshot baseline still expects `By signing in... Terms of Service`; this should be handled as an auth-drift baseline/product-contract decision outside this PR |
| Playwright E2E / special-suite failures | `28274238051` | Generic E2E was running dedicated suites with missing setup | Fixed by excluding `auth-drift/**` and `visual-login/**` from the generic config; dedicated Auth Drift and Visual Login workflows still run them |
| Playwright E2E / broad app failures | `28274238051` | Existing generic E2E instability/debt | Not fixed in this PR. Examples include deep-link routes stuck/loading, mission UI expectations, CI/CD controls, and cache compliance failures unrelated to the PR diff |
| Claude Code Review | `28274238085` | Workflow configuration | Not branch-caused. The action failed before review because it could not fetch an OIDC token and reported missing `id-token: write`/credentials |

## Canary Issue #54 Summary

Issue #54 currently classifies the live canary blocker as `live-rate-limit-data-loss`. The latest issue body shows core and optional endpoints both returning `429`, including `/api/mcp/clusters`, `/api/mcp/pod-issues/stream`, `/api/agent/token`, `/api/stellar/stream`, `/api/gitops/helm-releases`, and `/api/public/nightly-e2e/runs`. The next fixes should distinguish core resource data loss from optional/background endpoint pressure and prevent fake zero counts after rate limiting.

## Validation Log

- `git diff --check`: passed.
- `node --check .github/scripts/console-live-promote-failure-issue.cjs`: passed.
- `node --test .github/scripts/console-live-promote-failure-issue.test.cjs`: passed, 19/19 tests.
- `node --check web/harness/scripts/compareBrowserMatrix.cjs`: passed.
- YAML parse with the installed YAML parser: passed for `build-deploy.yml`, `post-merge-verify.yml`, `console-live-promote.yml`, and `console-live-macos-canary.yml`.
- `cd web && npx eslint e2e/visual-login/**/*.ts harness/**/*.ts`: passed.
- `cd web && npx playwright test --config e2e/visual-login/intensive.config.ts --project=semantic-groundtruth --grep @live-site --list`: passed, 12 tests selected.
- `cd web && npx playwright test --config e2e/visual-login/browser-matrix.config.ts --list`: passed, 3 browser projects selected.
- `cd web && npx playwright test --config e2e/visual-login/macos-popup.config.ts --list`: passed, 1 macOS/WebKit popup test selected.
- Generic Playwright discovery checks:
  - `cd web && npx playwright test e2e/smoke.spec.ts --project=chromium --list`: exit `0`.
  - `cd web && npx playwright test e2e/auth-drift/oauth-staging-login-drift.spec.ts --project=chromium --list`: exit `1` because the generic config ignores `auth-drift/**`.
  - `cd web && npx playwright test e2e/visual-login/semantic/live-core-pages.spec.ts --project=chromium --list`: exit `1` because the generic config ignores `visual-login/**`.
- `cd web && npm run build`: passed, including post-build vendor safety checks. Local build time was about 12 minutes.
- Representative hosted smoke sample:
  - Command: `PLAYWRIGHT_BASE_URL=https://console.kubestellar.io npx playwright test e2e/Clusters.spec.ts e2e/navbar-responsive.spec.ts --project=chromium --grep "displays clusters page|overflow menu button is visible"`
  - Result: failed on the hosted login page, but no longer failed with the literal `{}` document shell. This confirms the route fallback no longer intercepts the app document. The remaining hosted-login behavior is why the workflow uses a local preview fallback when deploy readiness is not confirmed.
- Representative local-preview smoke sample:
  - Command: build, `npm run preview -- --host 127.0.0.1 --port 4173`, then `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npx playwright test e2e/Clusters.spec.ts e2e/navbar-responsive.spec.ts --project=chromium --grep "displays clusters page|overflow menu button is visible"`.
  - Result: passed.

## Remaining Validation Needed

- Manual canary-only run: `Console Live Promote` run `28273722548`, branch `codex/post-merge-canary-stabilization`, `promoteProduction=false`.
  - Setup, required secrets, kubeconfig, candidate image resolution, live deployment/auth-boundary smoke, and signed-session smoke passed.
  - `Deploy candidate to console-live` was skipped as intended.
  - Live semantic checks failed with one clear blocker: `live-rate-limit-data-loss` on core endpoint `/api/mcp/clusters` during the `/nodes` route API/UI check.
  - Route evidence also showed `/clusters` initially rendering zero values before hydrating to the expected `3` clusters, `6` nodes, and `50` pods. This confirms the remaining blocker is not the old broad false-positive cascade; it is core resource API pressure/fake-zero behavior.
  - Browser matrix and adequacy were skipped after the semantic failure, reducing follow-on live-site load as intended.
  - Failure issue workflow updated existing issue `#54` instead of creating a duplicate.

## Remaining Blocker

The branch now reduces false positives and cascade load, but `console-live` still hits a core resource `429` during a single serial semantic pass. The next implementation slice should address product-side request pressure/backoff or fake-zero rendering for core Kubernetes resource APIs.

PR #65 also depends on follow-up reruns after this branch is pushed. The local changes fix the fork GHCR uppercase failure and generic-E2E special-suite false positives, but the Auth Drift screenshot mismatch is an existing fork-main contract conflict and the broad generic Playwright failures are outside this PR's canary stabilization scope.
