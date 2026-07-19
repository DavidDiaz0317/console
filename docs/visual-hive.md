# Visual Hive

This repository uses Visual Hive for deterministic-first visual QA orchestration.

Visual Hive owns the deterministic verdict layer. Playwright is the default local browser runner and primary evidence source; optional provider and LLM output is advisory unless a trusted workflow explicitly enables a governed gating integration.

## Generated Setup

- Project: kubestellar-console
- Detected type: react-vite
- Setup profile: complex-app
- Package manager: npm
- Selected package path: web
- Frameworks: react, storybook, vite
- Config path: visual-hive.config.yaml
- Playwright setup: present

## Playwright Presence

- Status: present
- Dependencies: @playwright/test
- Scripts: test:auth-drift: playwright test --config e2e/auth-drift/auth-ui-drift.config.ts, test:auth-drift:update: playwright test --config e2e/auth-drift/auth-ui-drift.config.ts --update-snapshots, test:e2e: npm run build && playwright test, test:e2e:a11y-compliance: playwright test --config e2e/compliance/compliance.config.ts e2e/compliance/a11y-compliance.spec.ts, test:e2e:all-compliance: playwright test --config e2e/compliance/compliance.config.ts, test:e2e:cache-compliance: playwright test --config e2e/compliance/compliance.config.ts e2e/compliance/card-cache-compliance.spec.ts, test:e2e:chromium: playwright test --project=chromium, test:e2e:debug: playwright test --debug, test:e2e:error-resilience: playwright test --config e2e/compliance/compliance.config.ts e2e/compliance/error-resilience.spec.ts, test:e2e:firefox: playwright test --project=firefox, test:e2e:headed: playwright test --headed, test:e2e:i18n-compliance: playwright test --config e2e/compliance/compliance.config.ts e2e/compliance/i18n-compliance.spec.ts, test:e2e:interaction-compliance: playwright test --config e2e/compliance/compliance.config.ts e2e/compliance/interaction-compliance.spec.ts, test:e2e:nightly-health: playwright test e2e/nightly/dashboard-health.spec.ts -c e2e/nightly/nightly.config.ts, test:e2e:perf: playwright test --config e2e/perf/perf.config.ts e2e/perf/dashboard-perf.spec.ts, test:e2e:perf:nav: playwright test --config e2e/perf/perf.config.ts e2e/perf/dashboard-nav.spec.ts, test:e2e:perf:ttfi: playwright test --config e2e/perf/perf.config.ts e2e/perf/all-cards-ttfi.spec.ts, test:e2e:report: playwright show-report, test:e2e:security-compliance: playwright test --config e2e/compliance/compliance.config.ts e2e/compliance/security-compliance.spec.ts, test:e2e:ui-compliance: playwright test --config e2e/compliance/compliance.config.ts e2e/compliance/card-loading-compliance.spec.ts, test:e2e:ui: playwright test --ui, test:e2e:ux-sweep: PLAYWRIGHT_BASE_URL=http://localhost:8080 PLAYWRIGHT_STORAGE_STATE=auth.json playwright test --config=e2e/user-flows/ux-scan.config.ts, test:e2e:webkit: playwright test --project=webkit, test:visual: playwright test --config e2e/visual/app-visual.config.ts, test:visual:browser-matrix: playwright test --config e2e/visual-login/browser-matrix.config.ts, test:visual:groundtruth: playwright test --config e2e/visual-login/intensive.config.ts --project=semantic-groundtruth, test:visual:intensive: playwright test --config e2e/visual-login/intensive.config.ts, test:visual:live: playwright test --config e2e/visual-login/intensive.config.ts --project=semantic-groundtruth --grep @live-site, test:visual:macos-popup: playwright test --config e2e/visual-login/macos-popup.config.ts, test:visual:mutations: playwright test --config e2e/visual-login/intensive.config.ts --grep @mutation, test:visual:pr: playwright test --config e2e/visual-login/pr.config.ts, test:visual:update: playwright test --config e2e/visual/app-visual.config.ts --update-snapshots
- Config files: web/playwright.config.ts
- Dependencies detected: @playwright/test
- Playwright scripts detected: test:auth-drift, test:auth-drift:update, test:e2e, test:e2e:a11y-compliance, test:e2e:all-compliance, test:e2e:cache-compliance, test:e2e:chromium, test:e2e:debug, test:e2e:error-resilience, test:e2e:firefox, test:e2e:headed, test:e2e:i18n-compliance, test:e2e:interaction-compliance, test:e2e:nightly-health, test:e2e:perf, test:e2e:perf:nav, test:e2e:perf:ttfi, test:e2e:report, test:e2e:security-compliance, test:e2e:ui-compliance, test:e2e:ui, test:e2e:ux-sweep, test:e2e:webkit, test:visual, test:visual:browser-matrix, test:visual:groundtruth, test:visual:intensive, test:visual:live, test:visual:macos-popup, test:visual:mutations, test:visual:pr, test:visual:update
- Config files detected: web/playwright.config.ts

## PR Lane

PR checks should run with read-only permissions and no repository secrets.

- Recommended target: componentLibrary (storybook)
- Target URL: http://127.0.0.1:6006
- Install command: npm --prefix web ci
- Build command: npm --prefix web run build-storybook
- Serve command: npm --prefix web run storybook -- --host 127.0.0.1 --port 6006
- Setup commands: none
- Services: none
- Teardown commands: none
- Estimated PR runtime: 4 minute(s)
- PR permissions: contents: read
- PR secrets required: none

## Scheduled Or Protected Lane

Scheduled/manual lanes may run deeper checks, mutation adequacy, optional provider uploads, and protected targets after explicit authorization.

- Estimated scheduled runtime: 10 minute(s)
- Scheduled secrets by name: PROTECTED_TARGET_SECRET_NAMES
- External network allowed by recommendation: yes

## Recommended Contracts

### component-library-visual-stability

- Target: componentLibrary
- Selectors: [data-testid='dashboard-page']
- Screenshots: storybook-component-desktop /iframe.html?viewMode=story@desktop, storybook-component-mobile /iframe.html?viewMode=story@mobile
- Reasons: Storybook was detected, but no story files were found; starter screenshots use the Storybook iframe route and should be refined after adding stories., Detected component selector [data-testid='dashboard-page']., Desktop and mobile Storybook screenshots give a PR-safe component visual lane without requiring Chromatic.

## Detected Route Hints

- / (web/e2e/Sidebar.spec.ts, 44 occurrences)
- /clusters (web/e2e/Sidebar.spec.ts, 21 occurrences)
- /deploy (web/e2e/Sidebar.spec.ts, 15 occurrences)
- /security (web/e2e/a11y.spec.ts, 12 occurrences)
- /alerts (web/e2e/hourglass-audit.spec.ts, 10 occurrences)
- /deployments (web/e2e/compliance/i18n-compliance.spec.ts, 10 occurrences)
- /pods (web/e2e/hourglass-audit.spec.ts, 10 occurrences)
- /workloads (web/e2e/hourglass-audit.spec.ts, 10 occurrences)
- /events (web/e2e/hourglass-audit.spec.ts, 9 occurrences)
- /nodes (web/e2e/hourglass-audit.spec.ts, 9 occurrences)

## Detected Storybook Stories

No Storybook story files were detected.

## Existing Workflow Hints

- .github/workflows/_perf-regression-issue.yml: triggers=none, permissions=contents: read, Visual Hive=no. Review: references secrets
- .github/workflows/accm-history-update.yml: triggers=schedule, workflow_dispatch, permissions=contents: read, Visual Hive=no. Review: references secrets
- .github/workflows/acmm-level-monitor.yml: triggers=schedule, workflow_dispatch, permissions=contents: read, Visual Hive=no. Review: references secrets
- .github/workflows/add-help-wanted.yml: triggers=none, permissions=issues: write, Visual Hive=no
- .github/workflows/ai-attribution.yml: triggers=pull_request, permissions=pull-requests: write, Visual Hive=no
- .github/workflows/ai-fix.yml: triggers=pull_request_target, workflow_dispatch, permissions=contents: write, Visual Hive=no. Review: uses pull_request_target, references secrets
- .github/workflows/api-contract.yml: triggers=pull_request, workflow_dispatch, permissions=contents: read, Visual Hive=no
- .github/workflows/assignment-helper.yml: triggers=none, permissions=issues: write, Visual Hive=no
- .github/workflows/auth-drift-failure-issue.yml: triggers=workflow_dispatch, workflow_run, permissions=contents: read, Visual Hive=no. Review: references secrets
- .github/workflows/auth-drift.yml: triggers=pull_request, schedule, workflow_dispatch, push, permissions=none, Visual Hive=no

## Provider Posture

- Playwright built-in: use. Default local browser evidence runner. No paid account or external upload is required. Required env names: none. External by default: no.
- Chromatic: optional. Storybook was detected, so hosted component review can be useful after the local Playwright lane is stable. Required env names: CHROMATIC_PROJECT_TOKEN. External by default: no.
- Percy: future. Consider only when broader hosted review or browser/device coverage justifies the extra service. Required env names: PERCY_TOKEN. External by default: no.
- Applitools: future. Reserve for enterprise visual AI or cross-browser/device requirements. Required env names: APPLITOOLS_API_KEY. External by default: no.

## Onboarding Checklist

### Inspect repository

- Status: ready
- Why: Confirm Visual Hive detected the project, package manager, scripts, framework signals, and selectors correctly.
- Action: Review detected repo facts before writing setup files.
- Command: `visual-hive recommend --repo .`
- Evidence: project=kubestellar-console, packageManager=npm, frameworks=react, storybook, vite, scripts=build, build-storybook, coverage:clean, coverage:report, dev, dev:coverage, lint, postbuild, preview, storybook, test, test:auth-drift, test:auth-drift:update, test:card-loading-state, test:card-registry, test:card-toolbar, test:card-wrapper, test:cluster-groups-forms, test:consistency, test:consistency:strict, test:coverage, test:drilldown-gaps, test:drilldown-views, test:e2e, test:e2e:a11y-compliance, test:e2e:all-compliance, test:e2e:cache-compliance, test:e2e:chromium, test:e2e:coverage, test:e2e:debug, test:e2e:error-resilience, test:e2e:firefox, test:e2e:fullstack, test:e2e:headed, test:e2e:i18n-compliance, test:e2e:interaction-compliance, test:e2e:nightly-health, test:e2e:perf, test:e2e:perf:nav, test:e2e:perf:ttfi, test:e2e:perf:ttfi:gate, test:e2e:report, test:e2e:security-compliance, test:e2e:ui, test:e2e:ui-compliance, test:e2e:ui-compliance:gate, test:e2e:ux-sweep, test:e2e:webkit, test:netlify-github-cluster, test:netlify-identity, test:netlify-missions-analytics, test:rewards-badge, test:ui, test:visual, test:visual:adequacy, test:visual:all, test:visual:browser-matrix, test:visual:browser-matrix:compare, test:visual:groundtruth, test:visual:intensive, test:visual:live, test:visual:macos-popup, test:visual:mutations, test:visual:pr, test:visual:report:intensive, test:visual:report:pr, test:visual:update, routes=54, playwright=present
- Related artifacts: .visual-hive/recommendations.json

### Choose PR-safe target

- Status: ready
- Why: Use a local or otherwise PR-safe target that can run without secrets in pull request workflows.
- Action: Keep this target in the first PR-safe deterministic lane.
- Command: none
- Evidence: target=componentLibrary, kind=storybook, confidence=high, url=http://127.0.0.1:6006
- Related artifacts: visual-hive.config.yaml, .visual-hive/targets.json

### Seed starter contracts

- Status: ready
- Why: Start with the smallest useful route, selector, flow, and screenshot coverage before expanding to protected lanes.
- Action: Review the starter contract and add domain-specific contracts for important routes.
- Command: none
- Evidence: contracts=1, selectors=59, screenshots=2
- Related artifacts: visual-hive.config.yaml, .visual-hive/contracts.json, .visual-hive/coverage.json

### Verify PR safety

- Status: ready
- Why: PR execution must stay read-only, no-secret, local-first, and free of external uploads by default.
- Action: Use pull_request with read-only permissions and no secrets for the generated PR workflow.
- Command: none
- Evidence: permissions=contents: read, prSecrets=none, externalProvidersByDefault=none
- Related artifacts: .github/workflows/visual-hive-pr.yml, .visual-hive/workflows.json, .visual-hive/security.json

### Generate setup files

- Status: review
- Why: Write config, repo docs, and safe workflow templates only after reviewing the generated YAML and security notes.
- Action: Run the guarded setup bundle command after reviewing the recommended YAML.
- Command: `visual-hive recommend --write-setup-bundle`
- Evidence: files=visual-hive.config.yaml, .github/workflows/visual-hive-pr.yml, .github/workflows/visual-hive-scheduled.yml, docs/visual-hive.md, title=Add Visual Hive deterministic visual QA
- Related artifacts: visual-hive.config.yaml, docs/visual-hive.md, .github/workflows/visual-hive-pr.yml

### Validate locally

- Status: ready
- Why: Prove the deterministic local path before making CI required or approving baselines.
- Action: Run the recommended commands locally and review created baselines before CI enforcement.
- Command: `visual-hive doctor && visual-hive plan --mode pr --changed-files changed-files.txt && visual-hive run && visual-hive coverage --mode pr --changed-files changed-files.txt && visual-hive triage && visual-hive report`
- Evidence: commands=visual-hive doctor && visual-hive plan --mode pr --changed-files changed-files.txt && visual-hive run && visual-hive coverage --mode pr --changed-files changed-files.txt && visual-hive triage && visual-hive report
- Related artifacts: .visual-hive/plan.json, .visual-hive/report.json, .visual-hive/triage.json, .visual-hive/issue.md

## Setup Actions

### Use free local setup

- Category: profile
- Recommended: no
- Requires confirmation: yes
- Writes: visual-hive.config.yaml, .github/workflows/visual-hive-pr.yml, .github/workflows/visual-hive-scheduled.yml, docs/visual-hive.md
- Outcome: Creates a guarded local-first config, docs, and workflow bundle.
- Safety: PR workflows remain read-only and secret-free., No external provider upload, billing, or LLM call is enabled.

```bash
visual-hive recommend --profile free-local --write-setup-bundle
```

### Enable hosted review posture

- Category: profile
- Recommended: no
- Requires confirmation: yes
- Writes: visual-hive.config.yaml, .github/workflows/visual-hive-pr.yml, .github/workflows/visual-hive-scheduled.yml, docs/visual-hive.md
- Outcome: Produces hosted-review guidance while keeping provider use opt-in for Chromatic, Percy, Applitools.
- Safety: This only changes recommended posture; it does not create credentials or upload artifacts., Credential names to review later: APPLITOOLS_API_KEY, CHROMATIC_PROJECT_TOKEN, PERCY_TOKEN

```bash
visual-hive recommend --profile hosted-review --write-setup-bundle
```

### Skip provider for now

- Category: provider
- Recommended: no
- Requires confirmation: no
- Writes: .visual-hive/provider-decisions.json
- Outcome: Keeps the default provider posture explicit for reviewers.
- Safety: Records local audit evidence only., Does not create credentials, enable billing, upload screenshots, or call a provider API.

```bash
visual-hive providers decision --provider chromatic --decision skip --reason "Playwright artifacts are enough for this repo right now"
```

### Generate config

- Category: write
- Recommended: yes
- Requires confirmation: yes
- Writes: visual-hive.config.yaml, .visual-hive/recommendations.json
- Outcome: Creates the config used by doctor, plan, run, mutate, triage, and report.
- Safety: Refuses to overwrite an existing config unless --force is passed.

```bash
visual-hive recommend --write-config
```

### Preview setup PR

- Category: write
- Recommended: yes
- Requires confirmation: yes
- Writes: visual-hive.config.yaml, .github/workflows/visual-hive-pr.yml, .github/workflows/visual-hive-scheduled.yml, docs/visual-hive.md
- Outcome: Creates a reviewable setup bundle and audit artifacts without opening a PR automatically.
- Safety: Use pull_request, not pull_request_target, for PR code execution., Do not put secrets in PR workflows., Show required secret names only; never print values., LLM output remains advisory and cannot decide pass/fail.

```bash
visual-hive recommend --write-setup-bundle
```

### Validate local path

- Category: validate
- Recommended: yes
- Requires confirmation: no
- Writes: .visual-hive/plan.json, .visual-hive/report.json, .visual-hive/triage.json
- Outcome: Proves the local PR-safe path before making CI required.
- Safety: Visual Hive owns the deterministic verdict; Playwright is the default local evidence runner., First local screenshot runs may create baselines for human review.

```bash
visual-hive doctor && visual-hive plan --mode pr --changed-files changed-files.txt && visual-hive run && visual-hive coverage --mode pr --changed-files changed-files.txt && visual-hive triage && visual-hive report
```

## Cost Guardrails

- Local screenshots per run: 2
- External screenshots per run by default: 2
- Estimated monthly external screenshots: 40
- CI runtime class: expensive
- Profile allows optional external review only in trusted/failure-oriented lanes after credentials are configured.
- External provider uploads are disabled on PRs by the generated cost policy.
- Actual runtime depends on dependency cache, app build time, and target startup time.

## Baselines

First local runs may create missing baselines. Review generated actual/baseline/diff artifacts before approving them.

```bash
visual-hive baselines list
visual-hive baselines approve --contract <contract-id> --screenshot <screenshot-name> --viewport <viewport>
visual-hive baselines reject --contract <contract-id> --screenshot <screenshot-name> --viewport <viewport> --reason "Not approved"
```

## Local Commands

```bash
visual-hive doctor
visual-hive plan --mode pr --changed-files changed-files.txt
visual-hive run
visual-hive coverage --mode pr --changed-files changed-files.txt
visual-hive triage
visual-hive report
visual-hive workflows --write-templates
```

## Setup PR Checklist

- Title: Add Visual Hive deterministic visual QA
- Files: visual-hive.config.yaml, .github/workflows/visual-hive-pr.yml, .github/workflows/visual-hive-scheduled.yml, docs/visual-hive.md
- Run visual-hive recommend --write-config in the target repo.
- Review the generated config and PR workflow diff before committing.
- Run visual-hive doctor, plan, and run locally before opening the setup PR.
- Keep provider uploads disabled until credentials and cost policy are explicitly approved.
- Security: Use pull_request, not pull_request_target, for PR code execution.
- Security: Do not put secrets in PR workflows.
- Security: Show required secret names only; never print values.
- Security: LLM output remains advisory and cannot decide pass/fail.

## Workflow Previews

### Visual Hive PR

- Path: .github/workflows/visual-hive-pr.yml
- Purpose: Read-only, no-secret PR validation for PR-safe deterministic contracts.
- Safety notes: Uses pull_request, not pull_request_target., Uses contents: read only., Uploads .visual-hive artifacts for trusted follow-up.

```yaml
name: Visual Hive PR

on:
  pull_request:

permissions:
  contents: read

jobs:
  visual-hive:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - uses: DavidDiaz0317/visual-hive/actions/run@main
        with:
          command: pipeline
          arguments: --mode pr --base origin/main --ci --github-step-summary
      # Do not create issues from untrusted PR execution. Upload artifacts and let
      # a trusted workflow_run workflow consume them if issue creation is needed.
      # For stricter supply-chain hardening, pin actions by SHA instead of tags.
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: visual-hive
          path: .visual-hive
          include-hidden-files: true
```

### Visual Hive Scheduled

- Path: .github/workflows/visual-hive-scheduled.yml
- Purpose: Scheduled or manually dispatched deeper validation, including mutation adequacy and protected lanes when configured.
- Safety notes: Can be bound to protected environments/secrets., Uploads .visual-hive artifacts., Runs mutation score enforcement separately from PR checks.

```yaml
name: Visual Hive Scheduled

on:
  schedule:
    - cron: "0 */4 * * *"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  visual-hive:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - uses: DavidDiaz0317/visual-hive/actions/run@main
        with:
          command: pipeline
          arguments: --mode schedule --ci --enforce-mutation --github-step-summary
      # This scheduled workflow may use protected secrets. A separate trusted
      # workflow_run workflow can create issues from .visual-hive/issues.json.
      # For stricter supply-chain hardening, pin actions by SHA instead of tags.
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: visual-hive
          path: .visual-hive
          include-hidden-files: true
```

### Visual Hive Failure Issue

- Path: .github/workflows/visual-hive-failure-issue.yml
- Purpose: Trusted workflow_run consumer that creates or updates issues from sanitized uploaded artifacts without checking out PR code.
- Safety notes: Does not checkout or execute PR code., Recursively discovers uploaded issues.json artifacts., Redacts secret-like values again before issue creation., Dedupes by stable deterministic failure signature.

```yaml
name: Visual Hive Failure Issue

on:
  workflow_run:
    workflows:
      - Visual Hive PR
      - Visual Hive Scheduled
    types:
      - completed

permissions:
  actions: read
  issues: write
  contents: read

jobs:
  create-issue:
    runs-on: ubuntu-latest
    if: github.event.workflow_run.conclusion == 'failure' && vars.VISUAL_HIVE_AUTO_PUBLISH_ISSUES == 'true'
    steps:
      # This trusted workflow does not checkout or execute PR code. It consumes
      # sanitized Visual Hive artifacts, prefers issues.json issue candidates,
      # and falls back to issue.md only when older artifacts are uploaded. Live
      # publishing is disabled unless VISUAL_HIVE_AUTO_PUBLISH_ISSUES=true is set
      # as a repository/environment variable. For stricter supply-chain hardening,
      # pin third-party actions by SHA.
      - uses: actions/download-artifact@v4
        with:
          name: visual-hive
          path: visual-hive-artifacts
          run-id: ${{ github.event.workflow_run.id }}
          github-token: [REDACTED] github.token }}
      - uses: actions/github-script@v7
        env:
          VISUAL_HIVE_LIFECYCLE_OWNER: ${{ vars.VISUAL_HIVE_LIFECYCLE_OWNER }}
        with:
          script: |
            const fs = require("fs");
            const path = require("path");
            const crypto = require("crypto");
            const artifactRoot = "visual-hive-artifacts";

            function walkArtifacts(dir) {
              if (!fs.existsSync(dir)) return [];
              return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
                const fullPath = path.join(dir, entry.name);
                return entry.isDirectory() ? walkArtifacts(fullPath) : [fullPath];
              });
            }

            const artifactFiles = walkArtifacts(artifactRoot);
            function findArtifact(name) {
              const normalizedSuffix = "/" + name;
              return artifactFiles.find((file) => file.replace(/\\/g, "/").endsWith("/.visual-hive/" + name))
                || artifactFiles.find((file) => file.replace(/\\/g, "/").endsWith(normalizedSuffix))
                || artifactFiles.find((file) => path.basename(file) === name);
            }

            function findIssueBody() {
              const issuePath = findArtifact("issue.md");
              return issuePath && fs.existsSync(issuePath) ? issuePath : undefined;
            }

            function findIssuesReport() {
              const issuesPath = findArtifact("issues.json");
              return issuesPath && fs.existsSync(issuesPath) ? issuesPath : undefined;
            }

            function redactSecretValues(value) {
              return String(value)
                .replace(/((?:access_token|id_token|refresh_token|token|password|secret|key|code|client_secret)\s*[:=]\s*)[^\s"'&]+/gi, "$1[REDACTED]")
                .replace(/(authorization\s*:\s*(?:bearer\s+)?)\S+/gi, "$1[REDACTED]")
                .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
                .replace(/((?:set-cookie|cookie)\s*:\s*)[^\n\r]+/gi, "$1[REDACTED]");
            }

            function readJsonArtifact(name) {
              const artifactPath = findArtifact(name);
              if (!artifactPath || !fs.existsSync(artifactPath)) return undefined;
              try {
                return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
              } catch {
                return undefined;
              }
            }

            async function protectedLifecycleOwner() {
              if (String(process.env.VISUAL_HIVE_LIFECYCLE_OWNER || "").toLowerCase() === "hive") return "hive";
              const defaultBranch = context.payload.repository?.default_branch;
              if (!defaultBranch) throw new Error("Refusing issue publication because the protected default branch is unavailable.");
              let response;
              try {
                response = await github.rest.repos.getContent({
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  path: ".hive/integrated.json",
                  ref: defaultBranch
                });
              } catch (error) {
                if (error?.status === 404) return "visual-hive";
                throw new Error("Refusing issue publication because protected Hive lifecycle ownership could not be verified: " + String(error?.message || error));
              }
              const file = response?.data;
              if (!file || Array.isArray(file) || file.type !== "file" || typeof file.content !== "string") {
                throw new Error("Refusing issue publication because .hive/integrated.json is not a protected regular file.");
              }
              let integrated;
              try {
                integrated = JSON.parse(Buffer.from(file.content, file.encoding || "base64").toString("utf8"));
              } catch {
                throw new Error("Refusing issue publication because protected .hive/integrated.json is invalid JSON.");
              }
              const repository = context.repo.owner + "/" + context.repo.repo;
              if (integrated?.visual_hive === true) {
                if (String(integrated.repository || "").toLowerCase() !== repository.toLowerCase()) {
                  throw new Error("Refusing issue publication because protected Hive repository identity does not match this repository.");
                }
                if (integrated.repository_id != null && String(integrated.repository_id) !== String(context.payload.repository?.id || "")) {
                  throw new Error("Refusing issue publication because protected Hive repository ID does not match this repository.");
                }
                return "hive";
              }
              throw new Error("Refusing issue publication because a protected Hive marker cannot grant standalone lifecycle ownership. Remove it through the audited Hive uninstall path.");
            }

            const protectedOwner = await protectedLifecycleOwner();
            if (protectedOwner === "hive") {
              core.notice("managed_by_hive: protected default-branch installation state assigns lifecycle writes to Hive.");
              return;
            }

            const issuePath = findIssueBody();
            const issuesReportPath = findIssuesReport();
            const issuesReport = issuesReportPath ? readJsonArtifact("issues.json") : undefined;
            const lifecycle = issuesReport?.lifecycle;
            if (lifecycle?.owner === "hive" || lifecycle?.standaloneIssueWrites === "suppressed") {
              core.notice("managed_by_hive: Hive is the configured lifecycle owner; Visual Hive issue candidates remain in artifacts for Hive to consume.");
              return;
            }
            const issueCandidates = Array.isArray(issuesReport?.issues)
              ? issuesReport.issues
                  .filter((issue) => issue.status === "open_candidate" || issue.status === "update_candidate" || issue.status === "resolved_candidate")
                  .slice(0, 10)
              : [];
            if (issuesReport && (issuesReport.externalCallsMade !== 0 || issuesReport.networkCallsMade !== 0)) {
              throw new Error("Refusing trusted issue publication because issues.json reports prior external/network calls.");
            }
            if (issueCandidates.length) {
              const { data: openIssues } = await github.rest.issues.listForRepo({
                owner: context.repo.owner,
                repo: context.repo.repo,
                state: "open",
                labels: "visual-hive"
              });
              for (const candidate of issueCandidates) {
                const marker = "<!-- visual-hive-issue dedupe:" + String(candidate.dedupeFingerprint || "missing") + " -->";
                const body = redactSecretValues(String(candidate.body || "")).includes("visual-hive-issue dedupe:")
                  ? redactSecretValues(String(candidate.body || ""))
                  : marker + "\n" + redactSecretValues(String(candidate.body || "Visual Hive issue candidate had no body."));
                const labels = [...new Set([...(Array.isArray(candidate.labels) ? candidate.labels : []), "visual-hive"])]
                  .map((label) => redactSecretValues(String(label)).trim())
                  .filter(Boolean)
                  .slice(0, 10);
                const existing = openIssues.find((issue) => issue.body && issue.body.includes(String(candidate.dedupeFingerprint)));
                if (existing) {
                  await github.rest.issues.update({
                    owner: context.repo.owner,
                    repo: context.repo.repo,
                    issue_number: existing.number,
                    title: redactSecretValues(String(candidate.title || "Visual Hive issue candidate")),
                    labels,
                    body
                  });
                } else if (candidate.status !== "resolved_candidate") {
                  await github.rest.issues.create({
                    owner: context.repo.owner,
                    repo: context.repo.repo,
                    title: redactSecretValues(String(candidate.title || "Visual Hive issue candidate")),
                    labels,
                    body
                  });
                }
              }
              return;
            }
            const rawBody = issuePath ? fs.readFileSync(issuePath, "utf8") : "Visual Hive failed, but no issue.md artifact was found.";
            const body = redactSecretValues(rawBody);
            const report = readJsonArtifact("report.json");
            const mutationReport = readJsonArtifact("mutation-report.json");
            const triageReport = readJsonArtifact("triage.json");
            const failedContracts = Array.isArray(report?.results)
              ? report.results.filter((result) => result.status === "failed").map((result) => result.contractId).sort()
              : [];
            const survivedMutations = Array.isArray(mutationReport?.results)
              ? mutationReport.results.filter((result) => result.status === "survived").map((result) => result.operator).sort()
              : [];
            const classifications = Array.isArray(triageReport?.findings)
              ? triageReport.findings.map((finding) => finding.classification).sort()
              : [];
            const signatureSource = JSON.stringify({
              workflow: context.payload.workflow_run.name,
              project: report?.project || context.repo.repo,
              failedContracts,
              survivedMutations,
              classifications
            });
            const signature = crypto.createHash("sha256").update(signatureSource).digest("hex").slice(0, 16);
            const marker = "<!-- visual-hive-dedupe:" + signature + " -->";
            const title = "Visual Hive failure: " + context.payload.workflow_run.name;
            const { data: issues } = await github.rest.issues.listForRepo({
              owner: context.repo.owner,
              repo: context.repo.repo,
              state: "open",
              labels: "visual-hive"
            });
            const existing = issues.find((issue) => issue.body && issue.body.includes(marker));
            if (existing) {
              await github.rest.issues.update({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: existing.number,
                body: marker + "\n" + body
              });
            } else {
              await github.rest.issues.create({
                owner: context.repo.owner,
                repo: context.repo.repo,
                title,
                labels: ["visual-hive", "test-failure"],
                body: marker + "\n" + body
              });
            }
```

### Visual Hive Hive Handoff

- Path: .github/workflows/visual-hive-hive-handoff.yml
- Purpose: Trusted workflow_run consumer that validates sanitized Evidence/Handoff/Hive dry-run artifacts without checking out PR code or calling Hive by default.
- Safety notes: Does not checkout or execute PR code., Consumes uploaded .visual-hive artifacts only., Requires dry-run Hive artifacts with externalCallsMade: 0., Leaves the real Hive Bead API call as a trusted, policy-gated future insertion point.

```yaml
name: Visual Hive Hive Handoff

on:
  workflow_run:
    workflows:
      - Visual Hive PR
      - Visual Hive Scheduled
    types:
      - completed

permissions:
  actions: read
  contents: read
  issues: write

jobs:
  trusted-handoff:
    runs-on: ubuntu-latest
    if: github.event.workflow_run.conclusion == 'failure' && vars.VISUAL_HIVE_AUTO_PUBLISH_ISSUES == 'true'
    steps:
      # This trusted workflow consumes sanitized Visual Hive artifacts only. It
      # does not checkout or execute PR code, and it makes no Hive network call
      # by default. It may create/update a GitHub issue from the sanitized
      # hive-issue.md artifact after handoff validation passes only when
      # VISUAL_HIVE_AUTO_PUBLISH_ISSUES=true is explicitly configured. For
      # stricter supply-chain hardening, pin actions by SHA.
      - uses: actions/download-artifact@v4
        with:
          name: visual-hive
          path: visual-hive-artifacts
          run-id: ${{ github.event.workflow_run.id }}
          github-token: [REDACTED] github.token }}
      - uses: actions/github-script@v7
        env:
          VISUAL_HIVE_LIFECYCLE_OWNER: ${{ vars.VISUAL_HIVE_LIFECYCLE_OWNER }}
        with:
          script: |
            const fs = require("fs");
            const path = require("path");
            const crypto = require("crypto");
            const artifactRoot = "visual-hive-artifacts";

            function walkArtifacts(dir) {
              if (!fs.existsSync(dir)) return [];
              return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
                const fullPath = path.join(dir, entry.name);
                return entry.isDirectory() ? walkArtifacts(fullPath) : [fullPath];
              });
            }

            const artifactFiles = walkArtifacts(artifactRoot);
            function findArtifact(name) {
              const normalizedSuffix = "/" + name;
              return artifactFiles.find((file) => file.replace(/\\/g, "/").endsWith("/.visual-hive/" + name))
                || artifactFiles.find((file) => file.replace(/\\/g, "/").endsWith(normalizedSuffix))
                || artifactFiles.find((file) => path.basename(file) === name);
            }

            function redactSecretValues(value) {
              return String(value)
                .replace(/((?:access_token|id_token|refresh_token|token|password|secret|key|code|client_secret)\s*[:=]\s*)[^\s"'&]+/gi, "$1[REDACTED]")
                .replace(/(authorization\s*:\s*(?:bearer\s+)?)\S+/gi, "$1[REDACTED]")
                .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
                .replace(/((?:set-cookie|cookie)\s*:\s*)[^\n\r]+/gi, "$1[REDACTED]");
            }

            function readJsonArtifact(name) {
              const artifactPath = findArtifact(name);
              if (!artifactPath || !fs.existsSync(artifactPath)) return undefined;
              try {
                return JSON.parse(redactSecretValues(fs.readFileSync(artifactPath, "utf8")));
              } catch (error) {
                core.warning("Unable to parse " + name + ": " + redactSecretValues(error.message));
                return undefined;
              }
            }

            function readTextArtifact(name) {
              const artifactPath = findArtifact(name);
              if (!artifactPath || !fs.existsSync(artifactPath)) return undefined;
              return redactSecretValues(fs.readFileSync(artifactPath, "utf8"));
            }

            function safeLabels(values) {
              return [...new Set((Array.isArray(values) ? values : [])
                .concat(["visual-hive", "hive/quality", "ai-ready"])
                .map((value) => redactSecretValues(value).trim())
                .filter(Boolean))]
                .slice(0, 10);
            }

            async function protectedLifecycleOwner() {
              if (String(process.env.VISUAL_HIVE_LIFECYCLE_OWNER || "").toLowerCase() === "hive") return "hive";
              const defaultBranch = context.payload.repository?.default_branch;
              if (!defaultBranch) throw new Error("Refusing issue publication because the protected default branch is unavailable.");
              let response;
              try {
                response = await github.rest.repos.getContent({
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  path: ".hive/integrated.json",
                  ref: defaultBranch
                });
              } catch (error) {
                if (error?.status === 404) return "visual-hive";
                throw new Error("Refusing issue publication because protected Hive lifecycle ownership could not be verified: " + String(error?.message || error));
              }
              const file = response?.data;
              if (!file || Array.isArray(file) || file.type !== "file" || typeof file.content !== "string") {
                throw new Error("Refusing issue publication because .hive/integrated.json is not a protected regular file.");
              }
              let integrated;
              try {
                integrated = JSON.parse(Buffer.from(file.content, file.encoding || "base64").toString("utf8"));
              } catch {
                throw new Error("Refusing issue publication because protected .hive/integrated.json is invalid JSON.");
              }
              const repository = context.repo.owner + "/" + context.repo.repo;
              if (integrated?.visual_hive === true) {
                if (String(integrated.repository || "").toLowerCase() !== repository.toLowerCase()) {
                  throw new Error("Refusing issue publication because protected Hive repository identity does not match this repository.");
                }
                if (integrated.repository_id != null && String(integrated.repository_id) !== String(context.payload.repository?.id || "")) {
                  throw new Error("Refusing issue publication because protected Hive repository ID does not match this repository.");
                }
                return "hive";
              }
              throw new Error("Refusing issue publication because a protected Hive marker cannot grant standalone lifecycle ownership. Remove it through the audited Hive uninstall path.");
            }

            const protectedOwner = await protectedLifecycleOwner();
            if (protectedOwner === "hive") {
              core.notice("managed_by_hive: protected default-branch installation state assigns lifecycle writes to Hive.");
              return;
            }

            const evidence = readJsonArtifact("evidence-packet.json");
            const handoff = readJsonArtifact("handoff.json");
            const beadRequest = readJsonArtifact("hive-bead-request.json");
            const handoffResult = readJsonArtifact("hive-handoff-result.json");
            const handoffValidation = readJsonArtifact("hive-handoff-validation.json");
            const hiveExport = readJsonArtifact("hive/hive-export.json");
            const guardedRepairPreview = readJsonArtifact("hive/guarded-repair-preview.json");
            const repairRequestEnvelope = readJsonArtifact("hive/repair-request-envelope.json");
            const trustedRepairConsumerSummary = readJsonArtifact("hive/trusted-repair-consumer-summary.json");
            const trustedRepairWorkflowDryRun = readJsonArtifact("hive/trusted-repair-workflow-dry-run.json");
            const issueBody = readTextArtifact("hive-issue.md");
            const blocking = [];
            if (!evidence) blocking.push("Missing .visual-hive/evidence-packet.json artifact.");
            if (!handoff) blocking.push("Missing .visual-hive/handoff.json artifact.");
            if (!beadRequest) blocking.push("Missing .visual-hive/hive-bead-request.json artifact.");
            if (!handoffValidation) blocking.push("Missing .visual-hive/hive-handoff-validation.json artifact.");
            if (!hiveExport) blocking.push("Missing .visual-hive/hive/hive-export.json artifact.");
            if (!guardedRepairPreview) blocking.push("Missing .visual-hive/hive/guarded-repair-preview.json artifact.");
            if (!repairRequestEnvelope) blocking.push("Missing .visual-hive/hive/repair-request-envelope.json artifact.");
            if (!trustedRepairConsumerSummary) blocking.push("Missing .visual-hive/hive/trusted-repair-consumer-summary.json artifact.");
            if (!trustedRepairWorkflowDryRun) blocking.push("Missing .visual-hive/hive/trusted-repair-workflow-dry-run.json artifact.");
            if (!issueBody) blocking.push("Missing .visual-hive/hive-issue.md artifact.");

            const externalCalls = Math.max(
              Number(handoffValidation?.summary?.externalCallsMade ?? 0),
              Number(beadRequest?.externalCallsMade ?? 0),
              Number(handoffResult?.externalCallsMade ?? 0),
              Number(hiveExport?.externalCallsMade ?? 0),
              Number(guardedRepairPreview?.externalCallsMade ?? 0),
              Number(repairRequestEnvelope?.externalCallsMade ?? 0),
              Number(trustedRepairConsumerSummary?.externalCallsMade ?? 0),
              Number(trustedRepairWorkflowDryRun?.externalCallsMade ?? 0)
            );
            const mode = String(hiveExport?.mode ?? beadRequest?.mode ?? handoff?.integration?.mode ?? "unknown");
            if (externalCalls !== 0) {
              blocking.push("Hive handoff artifact claims externalCallsMade=" + externalCalls + "; trusted template expects dry-run artifacts only.");
            }
            if (hiveExport && hiveExport.schemaVersion !== "visual-hive.hive-export.v1") {
              blocking.push("Hive export artifact has unexpected schemaVersion=" + redactSecretValues(hiveExport.schemaVersion ?? "missing") + ".");
            }
            if (guardedRepairPreview && guardedRepairPreview.schemaVersion !== "visual-hive.hive-guarded-repair-preview.v1") {
              blocking.push("Guarded repair preview artifact has unexpected schemaVersion=" + redactSecretValues(guardedRepairPreview.schemaVersion ?? "missing") + ".");
            }
            if (guardedRepairPreview?.policy?.verdictAuthority !== "visual_hive") {
              blocking.push("Guarded repair preview does not preserve Visual Hive as verdict authority.");
            }
            if (guardedRepairPreview?.policy?.repairExecution !== "preview_only_no_execution") {
              blocking.push("Guarded repair preview is not preview-only.");
            }
            if (guardedRepairPreview?.policy?.externalNetworkCalls !== false) {
              blocking.push("Guarded repair preview allows external network calls.");
            }
            if (Array.isArray(guardedRepairPreview?.policy?.forbiddenActions) && !guardedRepairPreview.policy.forbiddenActions.includes("decide_visual_hive_verdict")) {
              blocking.push("Guarded repair preview does not forbid agents from deciding the Visual Hive verdict.");
            }
            if (repairRequestEnvelope && repairRequestEnvelope.schemaVersion !== "visual-hive.hive-repair-request-envelope.v1") {
              blocking.push("Repair request envelope artifact has unexpected schemaVersion=" + redactSecretValues(repairRequestEnvelope.schemaVersion ?? "missing") + ".");
            }
            if (repairRequestEnvelope?.policy?.verdictAuthority !== "visual_hive") {
              blocking.push("Repair request envelope does not preserve Visual Hive as verdict authority.");
            }
            if (repairRequestEnvelope?.policy?.requestExecution !== "trusted_workflow_request_only") {
              blocking.push("Repair request envelope is not trusted-workflow-only.");
            }
            if (repairRequestEnvelope?.policy?.repairExecution !== "not_executed_by_visual_hive") {
              blocking.push("Repair request envelope incorrectly claims Visual Hive executed repair.");
            }
            if (repairRequestEnvelope?.policy?.requiresTrustedWorkflow !== true) {
              blocking.push("Repair request envelope does not require a trusted workflow.");
            }
            if (repairRequestEnvelope?.policy?.externalNetworkCalls !== false) {
              blocking.push("Repair request envelope allows external network calls.");
            }
            if (trustedRepairConsumerSummary && trustedRepairConsumerSummary.schemaVersion !== "visual-hive.hive-trusted-repair-consumer-summary.v1") {
              blocking.push("Trusted repair consumer summary artifact has unexpected schemaVersion=" + redactSecretValues(trustedRepairConsumerSummary.schemaVersion ?? "missing") + ".");
            }
            if (trustedRepairConsumerSummary?.policy?.verdictAuthority !== "visual_hive") {
              blocking.push("Trusted repair consumer summary does not preserve Visual Hive as verdict authority.");
            }
            if (trustedRepairConsumerSummary?.policy?.consumerExecution !== "dry_run_summary_only") {
              blocking.push("Trusted repair consumer summary is not dry-run only.");
            }
            if (trustedRepairConsumerSummary?.policy?.repairExecution !== "not_executed_by_visual_hive") {
              blocking.push("Trusted repair consumer summary incorrectly claims Visual Hive executed repair.");
            }
            if (trustedRepairConsumerSummary?.policy?.branchCreation !== false || trustedRepairConsumerSummary?.policy?.pullRequestCreation !== false || trustedRepairConsumerSummary?.policy?.issueCreation !== false) {
              blocking.push("Trusted repair consumer summary permits write actions.");
            }
            if (trustedRepairConsumerSummary?.policy?.hiveNetworkCalls !== false) {
              blocking.push("Trusted repair consumer summary permits Hive network calls.");
            }
            if (trustedRepairConsumerSummary?.policy?.requiresTrustedWorkflow !== true) {
              blocking.push("Trusted repair consumer summary does not require a trusted workflow.");
            }
            if (trustedRepairWorkflowDryRun && trustedRepairWorkflowDryRun.schemaVersion !== "visual-hive.hive-trusted-repair-workflow-dry-run.v1") {
              blocking.push("Trusted repair workflow dry-run artifact has unexpected schemaVersion=" + redactSecretValues(trustedRepairWorkflowDryRun.schemaVersion ?? "missing") + ".");
            }
            if (trustedRepairWorkflowDryRun?.policy?.verdictAuthority !== "visual_hive") {
              blocking.push("Trusted repair workflow dry-run does not preserve Visual Hive as verdict authority.");
            }
            if (trustedRepairWorkflowDryRun?.policy?.workflowExecution !== "dry_run_only") {
              blocking.push("Trusted repair workflow dry-run is not dry-run only.");
            }
            if (trustedRepairWorkflowDryRun?.policy?.repairExecution !== "not_executed_by_visual_hive") {
              blocking.push("Trusted repair workflow dry-run incorrectly claims Visual Hive executed repair.");
            }
            if (
              trustedRepairWorkflowDryRun?.policy?.checkoutCode !== false ||
              trustedRepairWorkflowDryRun?.policy?.branchCreation !== false ||
              trustedRepairWorkflowDryRun?.policy?.pullRequestCreation !== false ||
              trustedRepairWorkflowDryRun?.policy?.issueCreation !== false
            ) {
              blocking.push("Trusted repair workflow dry-run permits checkout or write actions.");
            }
            if (
              trustedRepairWorkflowDryRun?.policy?.hiveNetworkCalls !== false ||
              trustedRepairWorkflowDryRun?.policy?.providerCalls !== false ||
              trustedRepairWorkflowDryRun?.policy?.visualHiveRerun !== false
            ) {
              blocking.push("Trusted repair workflow dry-run permits external calls or reruns.");
            }
            if (trustedRepairWorkflowDryRun?.policy?.requiresTrustedWorkflow !== true) {
              blocking.push("Trusted repair workflow dry-run does not require a trusted workflow.");
            }
            if (handoffValidation?.status === "blocked") {
              blocking.push("Hive handoff validation is blocked; refusing trusted issue creation.");
            }
            const readiness = handoffValidation?.hiveReadiness;
            if (!readiness) {
              blocking.push("Missing Hive readiness summary in hive-handoff-validation.json.");
            }
            if (readiness?.recommendedMode === "full") {
              blocking.push("Evidence Packet recommended full Hive automation; trusted issue workflow refuses full automation.");
            }
            if (readiness?.fullAutomationBlocked !== true) {
              blocking.push("Full Hive automation is not blocked in the validation artifact.");
            }
            if (readiness?.guardedRepairTrustedOnlyOrBlocked !== true) {
              blocking.push("Guarded Hive repair is not blocked or trusted-only in the validation artifact.");
            }

            await core.summary
              .addHeading("Visual Hive Hive Handoff")
              .addRaw("Trusted workflow_run artifact consumer. No checkout, no PR code execution, no Hive network call by default. GitHub issue creation uses sanitized artifacts only.\n")
              .addList([
                "Evidence packet: " + (evidence ? "found" : "missing"),
                "Handoff packet: " + (handoff ? "found" : "missing"),
                "Hive bead request: " + (beadRequest ? "found" : "missing"),
                "Handoff validation: " + (handoffValidation?.status ?? "missing"),
                "Hive native export: " + (hiveExport?.schemaVersion ?? "missing"),
                "Guarded repair preview: " + (guardedRepairPreview?.status ?? "missing"),
                "Guarded repair ready: " + String(guardedRepairPreview?.readiness?.canRequestGuardedRepair ?? false),
                "Repair request envelope: " + (repairRequestEnvelope?.status ?? "missing"),
                "Trusted repair request ready: " + String(repairRequestEnvelope?.readiness?.canOpenTrustedRepairRequest ?? false),
                "Trusted repair consumer summary: " + (trustedRepairConsumerSummary?.status ?? "missing"),
                "Trusted repair consumer ready: " + String(trustedRepairConsumerSummary?.readiness?.canStartTrustedRepairWorkflow ?? false),
                "Trusted repair workflow dry-run: " + (trustedRepairWorkflowDryRun?.status ?? "missing"),
                "Trusted repair workflow ready: " + String(trustedRepairWorkflowDryRun?.readiness?.canRunTrustedRepairWorkflow ?? false),
                "Recommended Hive mode: " + redactSecretValues(readiness?.recommendedMode ?? "missing") + " (" + redactSecretValues(readiness?.recommendedStatus ?? "missing") + ")",
                "Hive readiness: " + String(readiness?.readyModes?.length ?? 0) + " ready / " + String(readiness?.trustedOnlyModes?.length ?? 0) + " trusted-only / " + String(readiness?.blockedModes?.length ?? 0) + " blocked",
                "Hive issue body: " + (issueBody ? "found" : "missing"),
                "Handoff mode: " + redactSecretValues(mode),
                "External calls made: " + externalCalls
              ])
              .write();

            if (blocking.length) {
              throw new Error(redactSecretValues(blocking.join(" ")));
            }

            const project = redactSecretValues(String(handoff?.project || evidence?.project || context.repo.repo));
            const verdict = redactSecretValues(String(handoff?.verdict?.visualHiveVerdict || evidence?.verdictSummary?.visualHiveVerdict || "unknown"));
            const workItemKeys = Array.isArray(handoff?.workItems) ? handoff.workItems.map((item) => item.key || item.title).sort() : [];
            const signatureSource = JSON.stringify({
              workflow: context.payload.workflow_run.name,
              project,
              verdict,
              hiveMode: mode,
              guardedRepairStatus: guardedRepairPreview?.status ?? "missing",
              repairRequestEnvelopeStatus: repairRequestEnvelope?.status ?? "missing",
              trustedRepairConsumerSummaryStatus: trustedRepairConsumerSummary?.status ?? "missing",
              trustedRepairWorkflowDryRunStatus: trustedRepairWorkflowDryRun?.status ?? "missing",
              workItemKeys
            });
            const signature = crypto.createHash("sha256").update(signatureSource).digest("hex").slice(0, 16);
            const marker = "<!-- visual-hive-hive-handoff-dedupe:" + signature + " -->";
            const validationSummary = [
              "## Trusted handoff validation",
              "",
              "- Handoff validation: " + handoffValidation.status,
              "- Visual Hive verdict: " + verdict,
              "- External calls made: " + externalCalls,
              "- Recommended Hive mode: " + redactSecretValues(handoffValidation.hiveReadiness?.recommendedMode ?? "missing"),
              "- Hive export mode: " + redactSecretValues(mode),
              "- Guarded repair preview: " + redactSecretValues(guardedRepairPreview?.status ?? "missing"),
              "- Guarded repair ready: " + String(guardedRepairPreview?.readiness?.canRequestGuardedRepair ?? false),
              "- Repair request envelope: " + redactSecretValues(repairRequestEnvelope?.status ?? "missing"),
              "- Trusted repair request ready: " + String(repairRequestEnvelope?.readiness?.canOpenTrustedRepairRequest ?? false),
              "- Trusted repair consumer summary: " + redactSecretValues(trustedRepairConsumerSummary?.status ?? "missing"),
              "- Trusted repair consumer ready: " + String(trustedRepairConsumerSummary?.readiness?.canStartTrustedRepairWorkflow ?? false),
              "- Trusted repair workflow dry-run: " + redactSecretValues(trustedRepairWorkflowDryRun?.status ?? "missing"),
              "- Trusted repair workflow ready: " + String(trustedRepairWorkflowDryRun?.readiness?.canRunTrustedRepairWorkflow ?? false),
              "- Full automation blocked: " + String(handoffValidation.hiveReadiness?.fullAutomationBlocked ?? false),
              "- Trusted workflow: workflow_run artifact consumer",
              "- PR code checkout: false",
              "- Hive API call: false"
            ].join("\n");
            const body = redactSecretValues(marker + "\n" + validationSummary + "\n\n---\n\n" + issueBody).slice(0, 60000);
            const title = "Visual Hive Hive handoff: " + project;
            const labels = safeLabels(handoff?.labels);
            const { data: issues } = await github.rest.issues.listForRepo({
              owner: context.repo.owner,
              repo: context.repo.repo,
              state: "open"
            });
            const existing = issues.find((issue) => issue.body && issue.body.includes(marker));
            const issuePayload = {
              owner: context.repo.owner,
              repo: context.repo.repo,
              title,
              labels,
              body
            };
            try {
              if (existing) {
                await github.rest.issues.update({
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  issue_number: existing.number,
                  body
                });
              } else {
                await github.rest.issues.create(issuePayload);
              }
            } catch (error) {
              core.warning("Issue create/update with labels failed, retrying without labels: " + redactSecretValues(error.message));
              if (existing) {
                await github.rest.issues.update({
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  issue_number: existing.number,
                  body
                });
              } else {
                await github.rest.issues.create({
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  title,
                  body
                });
              }
            }
      - name: Future trusted Hive Bead API adapter
        run: |
          echo "Future insertion point for a governed Hive Bead API call."
          echo "Keep disabled until endpoint, token env, approval, and retry policy are configured."
```

## Security Rules

- Use `pull_request`, not `pull_request_target`, for workflows that execute PR code.
- Do not expose repository secrets to PR workflows.
- Show required secret names only, never secret values.
- Create issues only from sanitized artifacts in a trusted `workflow_run` lane.
- LLM output is advisory and never a pass/fail authority.

## Warnings And Findings

- [info] Detected project type react-vite with npm commands. Evidence: react, storybook, vite
- [warning] Existing workflow uses pull_request_target. Do not execute untrusted PR code in that workflow. Evidence: .github/workflows/ai-fix.yml
- [warning] Existing pull_request workflow appears to reference secrets. Visual Hive PR lanes should stay secret-free. Evidence: .github/workflows/build-deploy.yml
- [warning] One or more existing workflows use pull_request_target; keep Visual Hive PR checks on pull_request.
