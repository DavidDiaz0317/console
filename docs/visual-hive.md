# Visual Hive for KubeStellar Console

Visual Hive is being dogfooded in this repository as a deterministic-first visual QA orchestrator. It plans which console contracts to run from changed files, executes Playwright visual/user-flow checks, writes machine-readable artifacts, and generates sanitized triage/report markdown. It does not call an LLM or any paid visual provider by default.

The config lives at `web/e2e/visual-hive.config.yaml` so generated Visual Hive specs land inside the existing Playwright `testDir` while still resolving `web/node_modules`.

## What Runs on PRs

`.github/workflows/visual-hive-pr.yml` runs on `pull_request` with read-only permissions and no secrets. It checks out this repo, checks out `DavidDiaz0317/visual-hive` from `codex/v0.2-core-completion`, builds Visual Hive, creates a Vite production bundle for the frontend visual lane, then runs:

```bash
node visual-hive-tooling/packages/cli/dist/index.js doctor --config web/e2e/visual-hive.config.yaml
node visual-hive-tooling/packages/cli/dist/index.js plan --config web/e2e/visual-hive.config.yaml --mode pr --changed-files .visual-hive/changed-files.txt --ci
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 node visual-hive-tooling/packages/cli/dist/index.js run --config web/e2e/visual-hive.config.yaml --skip-install --skip-build
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 node visual-hive-tooling/packages/cli/dist/index.js run --config web/e2e/visual-hive.config.yaml --skip-install --skip-build --ci
node visual-hive-tooling/packages/cli/dist/index.js triage --config web/e2e/visual-hive.config.yaml
node visual-hive-tooling/packages/cli/dist/index.js report --config web/e2e/visual-hive.config.yaml --github-step-summary
```

The workflow sets `VISUAL_HIVE_CI=false` for the first run so Visual Hive can create deterministic local baselines even though GitHub Actions sets `CI=true`. The second run sets `VISUAL_HIVE_CI=true` and enforces those baselines with `--ci`. The generated `.visual-hive` artifacts are uploaded for review.

The visual tolerance is intentionally broad for this dogfood pass because the console demo data, banners, and agent status surfaces can change between page loads. The selector contracts are the strict oracle; screenshots provide route-level drift evidence without making PRs fail on expected demo data churn.

The frontend-only local preview also records expected API/backend console noise such as `502`, `503`, `ERR_CONNECTION_REFUSED`, and CORS messages. Those messages are captured in `report.json` for evidence, but they are not the pass/fail oracle for this no-secret PR lane.

The current PR-safe lanes are:

- `hosted-demo-never-login`: checks `https://console.kubestellar.io` renders the dashboard and does not expose login/OAuth controls. It intentionally does not capture a hosted screenshot because live demo content drifts too often for a stable PR baseline.
- `local-preview-dashboard-visual`: builds the frontend and checks the dashboard header/card grid on desktop and mobile.
- `local-preview-dashboard-desktop-shell`: checks the desktop sidebar, header, and card grid without reusing that sidebar assertion for mobile.
- `local-preview-clusters-visual`: checks the `/clusters` route-level shell.
- `local-preview-settings-visual`: checks the `/settings` route-level shell.

Docs-only PRs are intentionally modeled as a no-op. The config uses `selection.ignoreChangedFiles` for documentation and Markdown-only changes, so `docs/visual-hive-fixtures/docs-only-changed-files.txt` should produce an empty plan with ignored-file evidence instead of starting the preview server.

## What Does Not Run on PRs Yet

`fakeOAuthFullstackPlanOnly` models the existing no-secret auth-drift fake OAuth path as a Visual Hive `commandGroup`, but it is not executed from untrusted PRs yet. Auth-related changes still make the planner surface the `fake-oauth-login-dashboard-plan` contract, but the target is marked `prSafe: false` so the PR plan excludes it unless `--allow-unsafe-targets` is used.

No live cluster, staging, or production checks run on PRs. Those future lanes require protected environments and must be scheduled or manually triggered from trusted workflows.

## Hosted Demo No-Login Protection

`hosted-demo-never-login` protects the public hosted demo contract: `console.kubestellar.io` should enter demo/dashboard mode without showing:

- `[data-testid='login-page']`
- `[data-testid='github-login-button']`
- `[data-testid='github-setup-button']`
- `[data-testid='oauth-setup-notice']`

This catches regressions where the public demo accidentally behaves like an OAuth-enabled deployment.

## Updating Baselines

Visual Hive baselines are generated under `web/e2e/.visual-hive/snapshots`, and actual/diff artifacts are under `web/e2e/.visual-hive/artifacts`. They are ignored in this repository during the initial dogfood pass. To refresh local baselines:

```bash
node ../vis-hive/packages/cli/dist/index.js plan --config web/e2e/visual-hive.config.yaml --mode pr --changed-files docs/visual-hive-fixtures/ui-changed-files.txt
$env:PLAYWRIGHT_BASE_URL = "http://127.0.0.1:4173"
node ../vis-hive/packages/cli/dist/index.js run --config web/e2e/visual-hive.config.yaml
```

To enforce an existing local baseline:

```bash
$env:PLAYWRIGHT_BASE_URL = "http://127.0.0.1:4173"
node ../vis-hive/packages/cli/dist/index.js run --config web/e2e/visual-hive.config.yaml --ci --skip-install --skip-build
```

## Running Locally

Visual Hive is not published to npm yet. From sibling checkouts:

```bash
cd ../vis-hive
npm install
npm run build

cd ../console
npm install --prefix web
node ../vis-hive/packages/cli/dist/index.js doctor --config web/e2e/visual-hive.config.yaml
node ../vis-hive/packages/cli/dist/index.js plan --config web/e2e/visual-hive.config.yaml --mode pr --changed-files docs/visual-hive-fixtures/ui-changed-files.txt
$env:PLAYWRIGHT_BASE_URL = "http://127.0.0.1:4173"
node ../vis-hive/packages/cli/dist/index.js run --config web/e2e/visual-hive.config.yaml --skip-install
node ../vis-hive/packages/cli/dist/index.js triage --config web/e2e/visual-hive.config.yaml
node ../vis-hive/packages/cli/dist/index.js report --config web/e2e/visual-hive.config.yaml
```

Use these fixtures to verify planning without relying on a live PR diff:

- `docs/visual-hive-fixtures/auth-changed-files.txt`
- `docs/visual-hive-fixtures/ui-changed-files.txt`
- `docs/visual-hive-fixtures/docs-only-changed-files.txt`

## Future Expansion

The fake OAuth lane should be promoted from plan-only to PR execution after Visual Hive commandGroup runs are stable for the existing `web/e2e/auth-drift/fake-github-oauth-provider.mjs` path on GitHub Actions. A live cluster lane should be a separate scheduled/protected workflow with `KUBECONFIG`, `KC_AGENT_TOKEN`, and least-privilege GitHub permissions.

Issue creation must not happen in the PR workflow. If Visual Hive issue creation is added later, use a trusted `workflow_run` workflow that downloads sanitized `.visual-hive` artifacts and does not checkout or execute PR code.
