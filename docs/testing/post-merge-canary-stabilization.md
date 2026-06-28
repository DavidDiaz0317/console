# Post-Merge Canary Stabilization

## Starting State

- Branch: `codex/post-merge-canary-stabilization`
- Base branch requested: `main`
- Current fork `main` commit at branch creation: `380fb7fd016994dd13c1ed96aa1fc46159efbd22`
- Fork `main` after June 26 sync: `c7371aa7c`
- Fork `main` after June 27 fetch: `a3dcd8f99742a92038727dd0ab30e77fd71a43b1`
- Fork `main` after June 27 upstream sync: `f291f3abf84b8f45d251cb6ba9bb1f11e426697a`
- Fork `main` after June 27 final upstream sync: `c7b77094472a3c0f3dac01cf83449dac9acf273a`
- Fork `main` after June 27 follow-up upstream sync: `285a7b93d89616d9703284fe76984b5d839d2841`
- Upstream `main` included after sync: `f1740da9c`
- Upstream `main` included after final June 27 sync: `66f803796`
- Upstream `main` included after latest June 27 sync: `ad71673998f878b4cae8093502d0a0cd8c097855`
- Upstream `main` included after June 27 follow-up sync: `d9bfa9becfc73da9d90c484b012f14471822bdb8`
- Backup branch before sync: `backup/fork-main-before-upstream-sync-20260626-215039`
- Backup branch before final June 27 sync: `backup/fork-main-before-upstream-sync-20260627-115847`
- Backup branch before latest June 27 sync: `backup/fork-main-before-upstream-sync-20260627-154922`
- Backup branch before June 27 follow-up sync: `backup/fork-main-before-upstream-sync-20260627-173353`
- PR #48 merge commit from GitHub metadata: `02b2dd52a44284aed273a19b8b5af35ab0f311d1`
- Post-merge verification run: `28190200153`
- Current live canary issue: `#54`

## Current June 28 Canary Readiness Update

PR #65 is still a canary/live-testing stabilization slice and should stay draft until the canary-only path is validated remotely. The latest local branch work changes `Console Live Promote` dry-run behavior so `promoteProduction=false` now deploys the candidate image into a private `kc-live-canary` Helm release, reaches it through an Actions-only port-forward, and runs the live semantic/browser checks against that candidate URL. Public `https://console-live.kubestellar.io` is still touched only when `promoteProduction=true`.

Failure classification is now:

| Area | Classification | Current handling |
|---|---|---|
| Console Live Promote dry run semantics | Canary-critical workflow gap | Fixed locally: dry runs now test the candidate image privately instead of retesting the already-live public site |
| Candidate image availability | Candidate build blocker if missing | Manual dispatch without `candidate_tag`/`candidate_sha` now resolves to the selected branch SHA. If that SHA image is missing from GHCR, the workflow fails clearly before deployment |
| Live `429` on core Kubernetes APIs | Real canary/product blocker | Still tracked as `live-rate-limit-data-loss` in issue `#54`; the harness skips heavier follow-up checks after the first core rate-limit event to avoid cascades |
| Live `502` runtime/resource failures | Real canary/product blocker | Kept as canary evidence; not hidden by optional/background endpoint handling |
| Generic Playwright and Mobile Browser red checks | Broad app/base-suite debt unless a failure maps to canary code | Out of scope for this canary readiness slice unless they block candidate image creation or canary execution |
| Claude Review | Fork/external setup noise | Requires the Claude Code GitHub App/configuration on the fork; not a canary product failure |

Private canary auth remains strict. The canary release keeps `DEV_MODE=false` and uses the same OAuth/JWT secrets as live, but sets `CONSOLE_LIVE_TEST_USER_BOOTSTRAP=true` only on the private canary so the signed test cookie maps to an active local user in the ephemeral canary database. The production `kc-live` values do not enable this bootstrap.

Local validation after the June 28 private-candidate update:

- `git diff --check`: passed.
- `node --check .github/scripts/console-live-promote-failure-issue.cjs`: passed.
- `node --test .github/scripts/console-live-promote-failure-issue.test.cjs`: passed, 20/20 tests.
- `node --check web/harness/scripts/compareBrowserMatrix.cjs`: passed.
- `cd web && npx eslint e2e/visual-login/**/*.ts harness/**/*.ts`: passed.
- `cd web && npx playwright test --config e2e/visual-login/intensive.config.ts --project=semantic-groundtruth --grep @live-site --list`: listed 12 live-site tests.
- `cd web && npx playwright test --config e2e/visual-login/browser-matrix.config.ts --list`: listed Chromium, Firefox, and WebKit live browser-matrix tests.
- YAML parse with PyYAML: passed for `.github/workflows/console-live-promote.yml`.

Local limitation: this workstation does not have `go`/`gofmt` on `PATH`, so the Go bootstrap helper still needs CI build validation.

Remote validation started after pushing `2f5d340e1`:

- `Build and Deploy KC` workflow-dispatch run `28314888819` passed for branch `codex/post-merge-canary-stabilization` with `deploy_target=none`; it published the SHA image and skipped deploy jobs.
- `Console Live Promote` workflow-dispatch run `28315130388` used `candidate_sha=2f5d340e125384aa95b0433aa3dd0f3bc439c1f2` and `promoteProduction=false`. It failed before tests at private canary Helm install because Helm 4 tried to patch the already-existing namespace from `--create-namespace`, which the namespace-scoped deploy service account is not allowed to do. Public production was not touched.
- Follow-up fix: remove `--create-namespace` from the canary and production Helm upgrades. The workflow already depends on the namespace existing because it creates live secrets in that namespace before Helm runs.
- `Build and Deploy KC` workflow-dispatch run `28315161886` passed for branch `codex/post-merge-canary-stabilization` with `deploy_target=none`; it published image `ghcr.io/daviddiaz0317/console:d7c3178d714a600e77c00936ecaa5d378ff17d89` and skipped deploy jobs.
- `Console Live Promote` workflow-dispatch run `28315408807` used `candidate_sha=d7c3178d714a600e77c00936ecaa5d378ff17d89` and `promoteProduction=false`. It failed before tests at private canary Helm install because the namespace-scoped deploy service account cannot create a new broad `ClusterRole`/`ClusterRoleBinding` for the canary release. Public production was not touched.
- Follow-up fix: private canary releases now set `serviceAccount.create=false`, reuse the existing live service account, and set `rbac.create=false` so canary dry runs exercise the same cluster permissions as production without requiring the deployer to create new cluster-scoped RBAC.
- `Build and Deploy KC` workflow-dispatch run `28315504674` passed for branch `codex/post-merge-canary-stabilization` with `deploy_target=none`; it published image `ghcr.io/daviddiaz0317/console:4d0524f65a6b52f44841ff292d66f4f02e8508b5` and skipped deploy jobs.
- `Console Live Promote` workflow-dispatch run `28315735307` used `candidate_sha=4d0524f65a6b52f44841ff292d66f4f02e8508b5` and `promoteProduction=false`. It cleared the namespace/RBAC blockers, then failed before tests because the private canary Deployment did not become ready within the Helm timeout. Public production was not touched.
- Follow-up fix: private canary Helm installs no longer use `--atomic`; on install/readiness failure the workflow prints Helm status, canary resources, Deployment/pod descriptions, pod logs, and recent namespace events before the always-run cleanup step removes the canary release.

## Current June 27 Status

PR #65 was rebased onto the synced fork `main` after the fork was brought current with upstream through `d9bfa9becfc73da9d90c484b012f14471822bdb8`. The latest pushed head before this evidence update is `7c474909b3919a1454b8594ea9142ca8149385f2`; the latest code-validation SHA before doc-only status commits is `2af4fa9aeb92a70bf457ac1375587f324149ae4c`.

Remote evidence for `7c474909b3919a1454b8594ea9142ca8149385f2`:

| Area | Result | Evidence |
|---|---|---|
| Build and Deploy KC | Passed | PR run `28302693905`; amd64 and arm64 image builds passed; deploy jobs skipped because this is a PR |
| Manual no-deploy image publish | Passed | Run `28303671338`; image `ghcr.io/daviddiaz0317/console:7c474909b3919a1454b8594ea9142ca8149385f2`; image index digest `sha256:0f54b50c6d48606fcde324fb4021df7252149aeb22291546739910bccbd15c19`; deploy jobs skipped because `deploy_target=none` |
| Auth Drift | Passed | Run `28302693908`; Hosted Demo No-Login, Localhost Login Dashboard, Local Login UI, and Fake OAuth passed; OAuth Staging skipped as expected |
| Visual Login PR Protection | Passed | Run `28302693936`; Fast Visual/Login Guard passed |
| Accessibility | Passed | Run `28302693922`; Accessibility Tests passed |
| Generic Playwright E2E | Failed | Run `28302693922`; shards 1, 2, 3, mobile, and Merge Test Reports failed. The failures are broad generic-suite debt, and the profile dropdown clipping failure also reproduces on fork `main` run `28294272502` |
| Claude Review | Failed external setup | Run `28302693907`; the Claude Code GitHub App is not installed/configured on the fork |
| Console Live Promote dry run | Failed as live blocker | Run `28303928310`; `promoteProduction=false`, production deploy skipped, live health/OAuth boundary and signed-session smoke passed. `/clusters` UI matched groundtruth/API values (`3` clusters, `6` nodes, `6` Ready nodes, `50` pods). `/nodes` groundtruth markers matched `6` total and `6` Ready nodes, then authenticated `/api/mcp/nodes` returned `429` classified as `live-rate-limit-data-loss`. The run also observed a live `502` runtime/resource failure. Browser matrix and adequacy were skipped after semantic failure, avoiding a noisy cascade |
| Failure issue update | Passed | Run `28303982507`; existing issue `#54` was updated/commented instead of creating a duplicate |

Remote evidence for `c67738a28a5fa01205df9e0b664f231a90e4473c`:

| Area | Result | Evidence |
|---|---|---|
| Build and Deploy KC | Passed | PR run `28294963262`; amd64 and arm64 image builds passed; deploy jobs skipped because this is a PR |
| Manual no-deploy image publish | Passed | Run `28295242350`; image `ghcr.io/daviddiaz0317/console:c67738a28a5fa01205df9e0b664f231a90e4473c`; image index digest `sha256:f9883e071e3c075937373cbeed07aee82325d403553284c58f4e215800b521d6` |
| Auth Drift | Passed | Run `28294963231`; Hosted Demo No-Login, Localhost Login Dashboard, Local Login UI, and Fake OAuth passed; OAuth Staging skipped as expected |
| Accessibility | Passed | Run `28294963221` |
| Generic Playwright E2E | Failed | Run `28294963221`; shards 1, 2, 3, and mobile failed. Broad failures reproduce on synced fork `main` run `28294272502`, so they are base-suite debt rather than this branch's live-canary changes |
| Claude Review | Failed external setup | Run `28294963236`; OIDC token is available, but the Claude Code GitHub App is not installed on the fork |
| Console Live Promote dry run | Failed as live blocker | Run `28295615586`; `promoteProduction=false`, no production deploy, auth/session smoke passed, semantic tests stopped on live-site `502` and core `/api/mcp/nodes` `429` classified as `live-rate-limit-data-loss` |
| Failure issue update | Passed | Run `28295673458`; existing issue `#54` was updated/commented instead of creating a duplicate |
| Profile trigger label-in-name follow-up | Passed locally | Fixed `navbar-profile-btn` so the accessible name is derived from the visible GitHub login plus sr-only state text instead of an overriding `aria-label`. `npx vitest run src/components/layout/__tests__/UserProfileDropdown.test.tsx`, `npm run build`, and the exact Playwright check `e2e/a11y.spec.ts --grep "menu items have accessible names from visible text"` passed |
| Final upstream-sync build fix | Passed locally and in CI | After syncing upstream through `e292fb42c`, `MissionExport.tags` now defaults to `[]`; `npm run build` passed locally and CI build/build-gate/TTFI passed on runs `28298137018`, `28298136982`, and `28298137071` |
| Shard 4 targeted follow-up | Passed locally | Fixed the update reconnect test to send progress to the replacement WebSocket route and pre-dismissed the ACMM intro for the post-login route sweep. Both failing shard-4 specs passed locally against `vite preview` with `PLAYWRIGHT_BASE_URL` set |

Pre-rebase CI evidence for equivalent code at `1d884e2f720e7124239f4b2d06659de865bb2ce8`:

| Area | Result | Evidence |
|---|---|---|
| Build and Deploy KC | Passed | Run `28298813801`; amd64 and arm64 image builds passed; deploy jobs skipped because this is a PR |
| Auth Drift | Passed | Run `28298813831`; Hosted Demo No-Login, Localhost Login Dashboard, Local Login UI, and Fake OAuth passed; OAuth Staging skipped as expected |
| Build Frontend | Passed | Run `28298813853` |
| Accessibility | Passed | Run `28298813853` |
| Generic Playwright shard 4 | Passed | Run `28298813853`; includes the locally fixed update reconnect and post-login dashboard UX targets |
| Generic Playwright shards 1-3 | Failed | Run `28298813853`; broad generic-suite failures remain in auth logout, CI/CD, cluster dialogs, mission-control/mission-journey, namespace, navbar, GPU route, dashboard, and drag/drop areas |
| Mobile Browser Tests | Failed | Run `28298813853`; failures remain in mobile accessibility, AI mode/CardChat, auth logout, CI/CD, and related generic-suite areas |
| Merge Test Reports | Failed | Run `28298813853`; expected downstream result of failed Playwright shards/mobile |
| Claude Review | Failed external setup | Run `28298813833`; OIDC permission is present, but the Claude Code GitHub App is not installed on the fork |

After rebasing onto fork `main` at `c7b77094472a3c0f3dac01cf83449dac9acf273a`, the branch is no longer behind upstream. Fresh PR checks are required on the rebased head. Local rebase validation passed for the conflict area:

- `git diff --check`
- `cd web && npx eslint src/components/layout/mission-sidebar/missionSidebarHelpers.ts src/components/layout/mission-sidebar/__tests__/missionSidebarHelpers.test.ts`
- `cd web && npx vitest run src/components/layout/mission-sidebar/__tests__/missionSidebarHelpers.test.ts`

The first rebased PR check run found one branch-actionable shard-4 race in `web/e2e/UpdateSettings.spec.ts`: the reconnect test sent its initial `update_progress` event before the React WebSocket handler was always registered. Commit `b6aaaf833014caee881c2e774c354bac5d714283` now reuses the retry-until-banner pattern for that initial progress state. Local validation passed:

- `cd web && npx eslint e2e/UpdateSettings.spec.ts`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4178 npx playwright test e2e/UpdateSettings.spec.ts --project=chromium --grep "recovers state after WebSocket disconnect" --reporter=line`

The final rebased PR check run also found the same profile trigger label/content mismatch on the demo-user path. Commit `40da0f4f4853aee3f54f5b75497a6ae1c2a5c975` makes the accessible name start with the visible GitHub login before the menu action. Local validation passed:

- `cd web && npx eslint src/components/layout/UserProfileDropdown.tsx src/components/layout/__tests__/UserProfileDropdown.test.tsx` (warning only: existing `react-hooks/set-state-in-effect`)
- `cd web && npx vitest run src/components/layout/__tests__/UserProfileDropdown.test.tsx`
- `cd web && npm run build`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4179 npx playwright test e2e/a11y.spec.ts --project=chromium --grep "menu items have accessible names from visible text" --reporter=line`

The next shard-4 run exposed a weak onboarding-tour selector: the test clicked a dashboard "Dismiss banner" button instead of a tour skip/close control. Commit `e21d58269f201183063268c7cc196b675c7c8231` scopes the dismissal controls to the tour container. Local validation passed:

- `cd web && npx eslint e2e/user-flows/onboarding-tour.spec.ts`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4180 npx playwright test e2e/user-flows/onboarding-tour.spec.ts --project=chromium --grep "Skip dismisses tour" --reporter=line` (skipped locally because no tour was visible, without clicking the unrelated banner)

The following accessibility run still reported `label-content-name-mismatch` for the profile trigger because the `aria-label` path continued to override visible button content. Rebased commit `2af4fa9aeb92a70bf457ac1375587f324149ae4c` removes the trigger `aria-label` and lets the accessible name come from the visible login text plus sr-only state text. Local validation passed:

- `cd web && npx eslint src/components/layout/UserProfileDropdown.tsx src/components/layout/__tests__/UserProfileDropdown.test.tsx` (warning only: existing `react-hooks/set-state-in-effect`)
- `cd web && npx vitest run src/components/layout/__tests__/UserProfileDropdown.test.tsx`
- `cd web && npm run build`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4181 npx playwright test e2e/a11y.spec.ts --project=chromium --grep "menu items have accessible names from visible text" --reporter=line`

After the follow-up upstream sync, fork `main` was updated to `285a7b93d89616d9703284fe76984b5d839d2841` and PR #65 was rebased onto it without conflicts. Follow-up local validation passed:

- `git diff --check`
- `node --check .github/scripts/console-live-promote-failure-issue.cjs`
- `node --check .github/scripts/console-live-promote-failure-issue.test.cjs`
- `node --check web/harness/scripts/compareBrowserMatrix.cjs`
- `node --test .github/scripts/console-live-promote-failure-issue.test.cjs`
- `cd web && npx eslint "e2e/visual-login/**/*.ts" "harness/**/*.ts"`
- `cd web && npx playwright test --config e2e/visual-login/intensive.config.ts --project=semantic-groundtruth --grep "@live-site" --list`
- `cd web && npx playwright test --config e2e/visual-login/browser-matrix.config.ts --list`
- `cd web && npx playwright test --config e2e/visual-login/macos-popup.config.ts --list`
- `cd web && npx eslint src/components/layout/UserProfileDropdown.tsx src/components/layout/__tests__/UserProfileDropdown.test.tsx` (warning only: existing `react-hooks/set-state-in-effect`)
- `cd web && npx vitest run src/components/layout/__tests__/UserProfileDropdown.test.tsx`
- `cd web && npm run build`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4182 npx playwright test e2e/a11y.spec.ts --project=chromium --grep "menu items have accessible names from visible text" --reporter=line`
- `cd web && npx playwright test --config e2e/auth-drift/auth-ui-drift.config.ts e2e/auth-drift/oauth-staging-login-drift.spec.ts` (3 passed, 1 expected local skip for external OAuth backend redirect contract)

The only branch-caused generic Playwright failure identified after the rebase was `web/e2e/deep-links-and-data-flow.spec.ts` waiting for `networkidle` on `/clusters`. That route has long-lived stream/polling requests, so the test now waits for `domcontentloaded` and then asserts the subroute UI. The targeted local regression test passed after the change.

## June 28 PR #65 Status

Latest pushed PR head before the compact AI Missions follow-up: `2db35679b97ba34385cfab336636284d4d68e7ac`. Compact AI Missions source/evidence commit: `ea91bc939`.

Remote evidence for `2db35679b97ba34385cfab336636284d4d68e7ac`:

| Area | Result | Evidence |
|---|---|---|
| Build and Deploy KC | Passed | Run `28309505077`; amd64 and arm64 image builds passed; deploy jobs skipped because this is a PR |
| Auth Drift | Passed | Run `28309505088`; Hosted Demo No-Login, Localhost Login Dashboard, Local Login UI, and Fake OAuth passed; OAuth Staging skipped as expected |
| Visual Login PR Protection | Passed | Run `28309505070`; Fast Visual/Login Guard passed |
| Accessibility | Passed | Run `28309505063`; Accessibility Tests passed |
| Build Frontend | Passed | Run `28309505063`; frontend build job passed |
| Generic Playwright E2E | Failed | Run `28309505063`; chromium shards 1, 2, and 3 failed, shard 4 passed, Mobile Browser Tests cancelled at the 30 minute job limit, and Merge Test Reports failed downstream of failed shards |
| Claude Review | Failed external setup | Run `28309505082`; the action received an OIDC token but failed app-token exchange with `401 Unauthorized - Claude Code is not installed on this repository` |

Generic Playwright comparison against fork `main`:

- Latest fork `main` Playwright run `28302453959` also failed, with `133` parsed unexpected outcomes.
- PR run `28309505063` had `70` parsed unexpected outcomes.
- The follow-up auth/logout and navbar/profile failures that were present on fork `main` are no longer present in the PR run: `auth/logout-flow.spec.ts`, `navbar-responsive.spec.ts`, and `nightly/navbar-dropdown-visibility.spec.ts`.
- The PR run eliminated the generic config false positives from `auth-drift/**` and `visual-login/**`; those suites remain covered by their dedicated workflows.
- Three PR-only failures were traced to the branch navbar overflow change: `ResolutionMemory.spec.ts` could no longer see `data-tour="ai-missions-toggle"` at the default 1280px viewport after the wide AI Missions button moved into overflow below `2xl`.
- The branch now uses one responsive AI Missions trigger: icon-only at `xl` widths and text+icon at `2xl+`. This avoids duplicate hidden `data-tour="ai-missions-toggle"` elements while keeping the 1280px user menu from overflowing. The overflow-hidden-at-2xl test now uses `data-testid="navbar-overflow-btn"` instead of a broad Tailwind utility selector.

June 28 local validation after the compact AI Missions follow-up:

- `git diff --check`: passed.
- `node --check .github/scripts/console-live-promote-failure-issue.cjs`: passed.
- `node --check .github/scripts/console-live-promote-failure-issue.test.cjs`: passed.
- `node --check web/harness/scripts/compareBrowserMatrix.cjs`: passed.
- `node --test .github/scripts/console-live-promote-failure-issue.test.cjs`: passed, 20/20 tests.
- `cd web && npx eslint "e2e/visual-login/**/*.ts" "harness/**/*.ts"`: passed.
- `cd web && npx eslint src/components/layout/navbar/Navbar.tsx e2e/navbar-responsive.spec.ts e2e/nightly/navbar-dropdown-visibility.spec.ts e2e/ResolutionMemory.spec.ts`: exit `0`; two existing `react-hooks/set-state-in-effect` warnings remain in `Navbar.tsx`.
- `cd web && npx playwright test --config e2e/visual-login/intensive.config.ts --project=semantic-groundtruth --grep "@live-site" --list`: passed, 12 tests selected.
- `cd web && npx playwright test --config e2e/visual-login/browser-matrix.config.ts --list`: passed, 3 browser projects selected.
- `cd web && npx playwright test --config e2e/visual-login/macos-popup.config.ts --list`: passed, 1 macOS/WebKit popup test selected.
- Vite dev server on `127.0.0.1:4202`, then `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4202 npx playwright test e2e/navbar-responsive.spec.ts e2e/nightly/navbar-dropdown-visibility.spec.ts --project=chromium --workers=1 --reporter=line`: passed.
- Vite dev server on `127.0.0.1:4203`, then `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4203 npx playwright test e2e/ResolutionMemory.spec.ts --project=chromium --grep "AI missions sidebar toggle button is visible|mission sidebar opens when clicking toggle|fullscreen mode expands" --workers=1 --reporter=line`: passed.
- Vite dev server on `127.0.0.1:4204`, then `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4204 npx playwright test e2e/CardChat.spec.ts --project=chromium --grep "switching AI mode to high" --workers=1 --reporter=line`: passed; the PR-only CI failure did not reproduce locally.
- Vite dev server on `127.0.0.1:4205`, then `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4205 npx playwright test e2e/network-deep.spec.ts --project=chromium --grep "shows endpoints stat" --workers=1 --reporter=line`: passed; the PR-only CI failure did not reproduce locally.
- Vite dev server on `127.0.0.1:4206`, then `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4206 npx playwright test e2e/marketplace-deep.spec.ts e2e/mission-regression.spec.ts e2e/mission-share.spec.ts --project=chromium --grep "type filter buttons are present|missions listing page loads|share channels are shown" --workers=1 --reporter=line`: passed; the sampled PR-only CI failures did not reproduce locally.
- Vite dev server on `127.0.0.1:4207`, then `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4207 npx playwright test e2e/deep-links-and-data-flow.spec.ts --project=mobile-chrome --grep "direct URL to /settings loads settings page" --workers=1 --reporter=line`: passed; the mobile CI failure did not reproduce locally.
- `cd web && npm run build`: passed, including post-build vendor safety checks. Local build time was `442s`.
- Follow-up after CI showed the first compact attempt still duplicated the hidden tour marker: Vite dev server on `127.0.0.1:4208`, then `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4208 npx playwright test e2e/navbar-responsive.spec.ts e2e/nightly/navbar-dropdown-visibility.spec.ts e2e/ResolutionMemory.spec.ts --project=chromium --grep "Navbar responsive layout|Navbar dropdown visibility|AI missions sidebar toggle button is visible|mission sidebar opens when clicking toggle|fullscreen mode expands" --workers=1 --reporter=line`: passed. `cd web && npm run build`: passed, including post-build vendor safety checks. Local build time was `353s`.

Current readiness assessment:

- Build and Deploy KC, Auth Drift, Accessibility, Visual Login PR Protection, CodeQL, Pre-Merge Build Gate, and the targeted navbar/logout/AI-Missions checks are green or locally fixed.
- Claude Review is an external fork setup blocker until the Claude Code GitHub App is installed on `DavidDiaz0317/console`.
- Generic Playwright remains red. Most remaining failures reproduce on fork `main`; the branch-caused AI Missions visibility regression is fixed locally and needs a fresh PR run after push.
- The latest canary-only evidence remains run `28303928310`, classified as `live-rate-limit-data-loss` plus live runtime/resource failures; the workflow avoided the old noisy cascade by skipping heavier follow-up checks after semantic failure.
- After the June 28 fetch, fork `main` is again behind upstream `kubestellar/console:main` by 3 commits (`8d4a427eb`, `f7dc64231`, `9ba01150c`). This PR branch is current with fork `main`, but a final upstream sync/rebase should be done before removing draft if the requirement is strict alignment with upstream `main`.

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
- `.github/workflows/console-live-promote.yml`: scheduled/manual default is canary-only unless `promoteProduction=true` is explicitly selected. Dry runs deploy the resolved candidate image to a private `kc-live-canary` Helm release, test it through an Actions-only port-forward, and keep public `console-live` unchanged. The live route delay defaults to 15 seconds, and browser matrix/adequacy runs are skipped when semantic live checks already failed.
- `pkg/api/server.go`: added an opt-in `CONSOLE_LIVE_TEST_USER_BOOTSTRAP=true` startup seed for the private canary's signed-cookie test user. It keeps auth strict by creating/updating the configured user in the canary DB; production values do not enable it.
- `.github/workflows/console-live-macos-canary.yml`: macOS/WebKit popup checks use the same 15 second default live-route delay.
- `web/e2e/visual-login/helpers/liveSiteAssertions.ts`: known optional/background live endpoints are recorded but do not block core route checks as generic network failures.
- `web/e2e/visual-login/helpers/liveSiteAssertions.ts`: core Kubernetes API `429` responses are now blocking `live-rate-limit-data-loss` failures. The first core rate-limit event writes a job-local marker so later live semantic tests skip instead of continuing to stress the same live site and generating secondary failures.
- `web/e2e/visual-login/intensive.config.ts`: live-site/live-cluster runs now use zero Playwright retries, while normal CI keeps its existing retry behavior. This avoids doubling live API pressure and duplicate failure artifacts during scheduled canary runs.
- `.github/scripts/console-live-promote-failure-issue.cjs`: `429` evidence is now split into core resource rate limits versus optional/background endpoint pressure, so issue #54-style reports identify the actual blocker instead of lumping all rate limits together. Raw log `429` parsing is line-scoped to avoid treating a websocket `429` plus later `/api/mcp/*` stack text as a core API rate-limit failure.
- `.github/workflows/build-deploy.yml`: the GHCR image name is normalized to lowercase before Docker metadata/build/manifest/deploy steps. This fixes fork PR builds where `github.repository` is `DavidDiaz0317/console`, because Docker rejects uppercase repository names.
- `web/playwright.config.ts`: the generic Playwright E2E workflow now ignores `auth-drift/**` and `visual-login/**`. Those suites require dedicated configs/workflows for their server, OAuth, and live-session setup; including them in generic E2E produced false `127.0.0.1:4176` and live-canary timeout failures.
- `web/e2e/auth-drift/oauth-staging-login-drift.spec.ts`: the local OAuth login UI drift check no longer compares against the stale screenshot baseline that expected the removed Terms of Service footer. It now asserts the intended login contract directly: logo, heading, GitHub button, no demo/hosted setup UI, no misleading Terms footer, card geometry, and mobile fit. Current screenshots are attached as evidence, not used as auto-updated baselines.
- `.github/workflows/auth-drift.yml`: the Local Login UI Drift context now records the intended no-misleading-Terms-footer contract.
- `.github/workflows/claude-code-review.yml`: the Claude review job now grants `id-token: write`, matching the OIDC error reported by the action.
- `web/e2e/visual-login/helpers/liveSiteAssertions.ts` and `web/e2e/visual-login/semantic/live-core-pages.spec.ts`: the `/nodes` live route no longer fetches cluster summary data just to assert pod totals. Node-route checks stay focused on node facts, reducing avoidable `/api/mcp/clusters` pressure in the paced canary.
- `web/src/components/layout/UserProfileDropdown.tsx`: the profile dropdown trigger now derives its accessible name from the visible GitHub login and sr-only state text, fixing the generic Playwright label-in-name failure for `navbar-profile-btn`.
- `web/src/components/layout/__tests__/UserProfileDropdown.test.tsx`: added a regression test for the profile trigger accessible name before and after opening the menu.
- `web/src/components/layout/mission-sidebar/missionSidebarHelpers.ts`: exported missions now default missing imported tags to `[]`, matching the required `MissionExport.tags` type and fixing the TypeScript build failure introduced by the latest upstream sync.
- `web/src/components/layout/mission-sidebar/__tests__/missionSidebarHelpers.test.ts`: updated the regression expectation for the required empty tag array.
- `web/e2e/UpdateSettings.spec.ts`: the reconnect recovery test now targets only replacement WebSocket routes and retries until the reconnected socket receives the resumed progress event, preserving the update-state assertion without racing the reconnect handshake. The update-complete banner checks also retry the mocked `done` event until the UI observes the WebSocket message, fixing the final-head shard-4 health-banner flake without weakening the refresh-link assertions.
- `web/e2e/user-flows/post-login-dashboard-ux.spec.ts`: the post-login route sweep now starts with the ACMM intro dismissed so the first-run education modal cannot intercept sidebar navigation while the test walks all visible routes.

## PR #65 Check Triage

| Check | Observed run | Classification | Current handling |
|---|---|---|---|
| Build and Deploy KC | `28277130608`, `28277989008` | Branch/fork workflow bug | Fixed by lowercasing `IMAGE_NAME`. PR build passed, and manual branch image publish succeeded for SHA `83a29e5cf253d7066bc27d361faa078d4cc14279`; deploy jobs were skipped because the ref was not `main` |
| Pre-Merge Build Gate | `28277130628` | Branch/sync syntax issue | Passed after removing unmatched braces from three synced hook test files |
| Lint Warning Gate | `28277130619` | Fork-main warning baseline drift | Passed after comparing PR warnings against the base branch instead of the stale static count |
| Auth Drift / Local Login UI Drift | `28280401235` | Branch/fork test contract drift after upstream removed the misleading Terms footer | Fixed locally by replacing the stale screenshot assertion with semantic/geometry contract checks and screenshot evidence attachments. Local run passed: 3 passed, 1 expected external-backend contract skip |
| Playwright E2E / Accessibility Tests | `28277130604` | Branch-caused timing/order sensitivity | Passed after waiting for the first focusable element and making the dashboard keyboard reachability assertion order-tolerant |
| Playwright E2E / special-suite failures | `28274238051` | Generic E2E was running dedicated suites with missing setup | Fixed by excluding `auth-drift/**` and `visual-login/**` from the generic config; dedicated Auth Drift and Visual Login workflows still run them |
| Playwright E2E / broad app failures | `28277130604` | Existing generic E2E instability/debt after upstream sync | Not fixed in this PR. The failing specs are unrelated to this diff and include mission journey/composer expectations, CI/CD controls, namespace persistence, GPU reservation auth console errors, update WebSocket progress, navbar/dropdown layout, and dashboard drag/drop/layout assertions |
| Claude Code Review | `28280401226` | Workflow configuration | Fixed locally by adding `id-token: write` to the Claude review job permissions. Needs remote rerun on the pushed SHA |

## Canary Issue #54 Summary

Issue #54 currently classifies the live canary blocker as `live-rate-limit-data-loss`. The latest issue body shows core and optional endpoints both returning `429`, including `/api/mcp/clusters`, `/api/mcp/pod-issues/stream`, `/api/agent/token`, `/api/stellar/stream`, `/api/gitops/helm-releases`, and `/api/public/nightly-e2e/runs`. The next fixes should distinguish core resource data loss from optional/background endpoint pressure and prevent fake zero counts after rate limiting.

## Validation Log

- `git diff --check`: passed.
- `node --check .github/scripts/console-live-promote-failure-issue.cjs`: passed.
- `node --test .github/scripts/console-live-promote-failure-issue.test.cjs`: passed, 20/20 tests.
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
- `cd web && npx eslint src/components/layout/mission-sidebar/missionSidebarHelpers.ts src/components/layout/mission-sidebar/__tests__/missionSidebarHelpers.test.ts`: passed.
- `cd web && npx vitest run src/components/layout/mission-sidebar/__tests__/missionSidebarHelpers.test.ts`: passed, 13 tests.
- `cd web && npm run build`: passed after the final upstream-sync type fix.
- `cd web && npx eslint e2e/auth-drift/oauth-staging-login-drift.spec.ts`: passed.
- `cd web && npx eslint e2e/visual-login/helpers/liveSiteAssertions.ts e2e/visual-login/semantic/live-core-pages.spec.ts`: passed.
- `cd web && npx playwright test --config e2e/auth-drift/auth-ui-drift.config.ts e2e/auth-drift/oauth-staging-login-drift.spec.ts`: passed, 3 tests passed and the external OAuth backend redirect contract skipped locally as expected.
- `cd web && npx eslint e2e/visual-login/**/*.ts harness/**/*.ts e2e/auth-drift/oauth-staging-login-drift.spec.ts`: passed.
- `cd web && npx vitest run src/components/auth/Login.test.tsx src/lib/__tests__/api-methods.test.ts`: passed, 56 tests.
- `cd web && npx vitest run src/lib/__tests__/sseClient.test.ts src/hooks/__tests__/useCachedData-kubectl.test.ts src/hooks/__tests__/useCertManager-caching.test.ts src/hooks/__tests__/useMetricsHistory-advanced.test.ts`: passed, 61 passed and 1 skipped.
- Follow-up navbar/auth targeted validation:
  - `cd web && npx eslint src/components/layout/navbar/Navbar.tsx e2e/navbar-responsive.spec.ts e2e/auth/logout-flow.spec.ts`: exit `0`; two existing `react-hooks/set-state-in-effect` warnings remain in `Navbar.tsx`.
  - Vite preview on `127.0.0.1:4198`, then `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4198 npx playwright test e2e/auth/logout-flow.spec.ts --project=chromium --workers=1 --reporter=line`: passed, 4 tests.
  - Vite preview on `127.0.0.1:4199`, then `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4199 npx playwright test e2e/nightly/navbar-dropdown-visibility.spec.ts e2e/navbar-responsive.spec.ts e2e/auth/logout-flow.spec.ts --project=chromium --workers=1 --reporter=line`: passed, 19 tests and 1 expected skip.
  - `git diff --check`: passed after the follow-up changes.
- Representative hosted smoke sample:
  - Command: `PLAYWRIGHT_BASE_URL=https://console.kubestellar.io npx playwright test e2e/Clusters.spec.ts e2e/navbar-responsive.spec.ts --project=chromium --grep "displays clusters page|overflow menu button is visible"`
  - Result: failed on the hosted login page, but no longer failed with the literal `{}` document shell. This confirms the route fallback no longer intercepts the app document. The remaining hosted-login behavior is why the workflow uses a local preview fallback when deploy readiness is not confirmed.
- Representative local-preview smoke sample:
  - Command: build, `npm run preview -- --host 127.0.0.1 --port 4173`, then `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npx playwright test e2e/Clusters.spec.ts e2e/navbar-responsive.spec.ts --project=chromium --grep "displays clusters page|overflow menu button is visible"`.
  - Result: passed.
- Shard 4 targeted local-preview follow-up:
  - Command: `npm run preview -- --host 127.0.0.1 --port 4177`, then `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4177 npx playwright test e2e/UpdateSettings.spec.ts --project=chromium --grep "recovers state after WebSocket disconnect" --reporter=line`.
  - Result: passed, 1 test.
  - Command: `npx vite preview --host 127.0.0.1 --port 4185`, then `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4185 npx playwright test e2e/UpdateSettings.spec.ts --project=chromium --reporter=line`.
  - Result: passed, 11 tests.
  - Command: `npm run preview -- --host 127.0.0.1 --port 4177`, then `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4177 npx playwright test e2e/user-flows/post-login-dashboard-ux.spec.ts --project=chromium --reporter=line`.
  - Result: passed, 1 test.

## Remaining Validation Needed

- Manual canary-only run: `Console Live Promote` run `28273722548`, branch `codex/post-merge-canary-stabilization`, `promoteProduction=false`.
  - Setup, required secrets, kubeconfig, candidate image resolution, live deployment/auth-boundary smoke, and signed-session smoke passed.
  - `Deploy candidate to console-live` was skipped as intended.
  - Live semantic checks failed with one clear blocker: `live-rate-limit-data-loss` on core endpoint `/api/mcp/clusters` during the `/nodes` route API/UI check.
  - Route evidence also showed `/clusters` initially rendering zero values before hydrating to the expected `3` clusters, `6` nodes, and `50` pods. This confirms the remaining blocker is not the old broad false-positive cascade; it is core resource API pressure/fake-zero behavior.
  - Browser matrix and adequacy were skipped after the semantic failure, reducing follow-on live-site load as intended.
  - Failure issue workflow updated existing issue `#54` instead of creating a duplicate.
- Manual branch image publish: `Build and Deploy KC` run `28277989008`, branch `codex/post-merge-canary-stabilization`, `deploy_target=none`.
  - Published `ghcr.io/daviddiaz0317/console:83a29e5cf253d7066bc27d361faa078d4cc14279`.
  - `deploy-vllm-d` and `deploy-pok-prod` were skipped because the ref was not `main`.
- Manual canary-only run: `Console Live Promote` run `28278236739`, branch `codex/post-merge-canary-stabilization`, `candidate_sha=83a29e5cf253d7066bc27d361faa078d4cc14279`, `promoteProduction=false`.
  - Production deploy was skipped.
  - Production health, OAuth boundary, and signed-session smoke passed.
  - Groundtruth collection confirmed `3` reachable contexts, `6` Ready nodes, `50` running pods, `16` namespaces, and `11` available deployments.
  - The run still hit core `429` pressure on `/api/mcp/clusters` and `/api/mcp/nodes`, then produced multiple secondary route/layout failures. This branch now treats that first core `429` as blocking and skips later live semantic tests in the same job to avoid that cascade.
- Manual branch image publish: `Build and Deploy KC` run `28278984046`, branch `codex/post-merge-canary-stabilization`, `deploy_target=none`.
  - Published `ghcr.io/daviddiaz0317/console:420144a58890874a8e7a8d2bad182441273b6943`.
  - `deploy-vllm-d` and `deploy-pok-prod` were skipped because the ref was not `main`.
- Manual canary-only run: `Console Live Promote` run `28279228318`, branch `codex/post-merge-canary-stabilization`, `candidate_sha=420144a58890874a8e7a8d2bad182441273b6943`, `promoteProduction=false`.
  - Production deploy was skipped.
  - Production health, OAuth boundary, and signed-session smoke passed.
  - Live route evidence showed `/clusters`, `/nodes`, `/pods`, and Dashboard count markers matching groundtruth/API counts: `3` clusters, `6` Ready nodes, `50` pods, and `16` namespaces on Dashboard.
  - The current live site still failed on real runtime/layout/data-availability issues: 502 console errors, blank card shells, `/namespaces` and `/deployments` unavailable state, and `/alerts` timing out. These are live product/UI issues, not screenshot-baseline noise.
  - The failure-issue workflow updated existing issue `#54`. The follow-up classifier fix in this branch prevents websocket `429` log text from incorrectly dominating those UI/data failures as core API rate-limit failures.

## Remaining Blocker

The branch now reduces false positives and cascade load, and the latest dry run shows the main count assertions can pass against the current live site. The remaining blockers are live product/UI stability issues: optional/background service errors still surface as console/runtime failures, some routes render blank card shells, Namespaces and Deployments can render unavailable, and Alerts can time out. Those are the right failures for the canary to expose, but they are not fixed by this harness stabilization slice.

PR #65 also depends on follow-up reruns after this branch is pushed. The local changes now fix the fork GHCR uppercase failure, generic-E2E special-suite false positives, pre-merge build syntax errors, lint warning baseline drift, branch-caused accessibility timing/order issues, Local Login UI Drift stale screenshot contract, Claude OIDC permission, and one avoidable live canary `/nodes` route cluster-summary fetch.

As of the latest June 27 follow-up sync, the fork is current with upstream for this work: `origin/main...fork/main` is `0 7`, so fork `main` is ahead with fork-private work and not behind upstream. PR #65 is ahead of fork `main` after the latest rebase and follow-up fixes. The broad generic Playwright shard failures also reproduce on fork `main` at `a3dcd8f99742a92038727dd0ab30e77fd71a43b1`, including mission-control, deep-link blank-page, logout/dropdown, CI/CD, and keyboard-navigation failures. They are not introduced by the current PR diff, but they still keep the overall Playwright workflow red until that suite debt is handled separately.

The fresh CI pass on pre-rebase code SHA `1d884e2f720e7124239f4b2d06659de865bb2ce8` completed. The branch-specific build, Auth Drift, accessibility, and shard-4 fixes were green there, but PR #65 is still not merge-ready while required checks remain red. After the latest upstream rebase, fresh checks are required on the rebased head; the expected remaining red checks are broad generic Playwright shards 1-3, Mobile Browser Tests, Merge Test Reports, and the external Claude Review app setup check unless those are fixed or explicitly treated as pre-existing/non-blocking by project policy.

## Final Merge-Readiness Assessment

As of pushed head `7c474909b3919a1454b8594ea9142ca8149385f2`, PR #65 is not ready to remove from draft and is not merge-safe under normal required-check rules until the remaining required-check failures are explicitly fixed or accepted as non-branch blockers by project policy.

Fixed or proven non-branch blockers:

- Build and Deploy KC is fixed for fork image publishing and passed on the PR.
- Auth Drift Local Login UI Drift is fixed and passed on the PR.
- Accessibility passed on the PR after the branch fixes.
- Generic Playwright shard 4 passed on the PR after the update reconnect and post-login route-sweep fixes.
- The PR-head profile trigger `label-content-name-mismatch` failure was fixed by deriving the trigger accessible name from visible login text and sr-only state text, then verified with the exact Playwright axe check.
- The PR-head navbar/profile overflow failure at the 1280px viewport was fixed by keeping extended navbar actions in the overflow menu until `2xl`, preserving alert/profile clickability at desktop CI widths.
- The auth logout E2E spec now follows the actual menuitem plus confirmation-dialog flow, uses the current `kc-auth-token-sync` cross-tab logout event, and prevents one-time test auth seeding from re-authenticating later post-logout navigations.
- The branch-only `/clusters` reload flake in generic Playwright was fixed and passed locally.
- Console Live Promote now avoids the old noisy cascade: after the first blocking live semantic failure, later semantic/browser/adequacy checks are skipped instead of adding extra live-site pressure.
- The failure issue workflow updates existing matching issue `#54` instead of opening duplicate issues.
- Current-head image publishing is verified: `Build and Deploy KC` workflow-dispatch run `28303671338` published `ghcr.io/daviddiaz0317/console:7c474909b3919a1454b8594ea9142ca8149385f2` and skipped deploy jobs.
- Current-head no-promote live canary is verified: `Console Live Promote` run `28303928310` skipped production deploy, passed live auth/session smoke, matched `/clusters` and `/nodes` groundtruth fields, then failed cleanly on a core `/api/mcp/nodes` `429` classified as `live-rate-limit-data-loss`.

Remaining blockers:

- Claude Review is blocked by fork setup, not branch code: the Claude Code GitHub App is not installed.
- Generic Playwright E2E is still red. The broad shard failures reproduce on synced fork `main`, but they are still required-check blockers unless the project explicitly treats them as pre-existing base-suite debt for this PR.
- Mobile Browser Tests is still red with broad generic-suite failures.
- The live canary dry run still finds real live-site/API pressure issues: a live `502` runtime/resource failure plus a core `/api/mcp/nodes` `429` classified as `live-rate-limit-data-loss`. This is no longer a noisy fake-zero cascade; it remains a real live product/infrastructure blocker tracked by issue `#54`.

Recommended next action: keep PR #65 draft, fix or policy-exempt the broad generic Playwright base failures separately, install/configure the Claude app if that check remains required, and continue live-site product/infrastructure work from issue `#54`.
