# Console Live Canary Upstream Merge Plan

## What This Branch Proves

This branch proves that the Console UI can be checked against real live Kubernetes data before a live deployment is promoted. The canary path validates:

- GitHub-authenticated access to a private Console instance.
- Live Dashboard, cluster, node, pod, namespace, and deployment counts against Kubernetes groundtruth.
- API-vs-UI consistency when authenticated app APIs return data.
- Cross-browser semantic/layout invariants for Chromium, Firefox, and WebKit.
- AI-agent-ready failure issues with sanitized evidence, screenshots, traces, and reproduction context.

## Upstream-Safe Pieces

These pieces are suitable to propose upstream in focused PRs:

- Semantic UI markers such as `data-groundtruth-field`, `data-live-route-state`, and `data-live-source`.
- Duplicate-safe live UI assertion helpers.
- Kubernetes groundtruth normalization and sanitized evidence output.
- Browser-matrix layout/semantic checks that run only when explicitly enabled.
- Failure classification improvements that distinguish product bugs, weak assertions, rate limits, and setup failures.

## Fork-Private Pieces

These should stay private to `DavidDiaz0317/console` unless upstream explicitly adopts equivalent infrastructure:

- `Console Live Promote` deployment workflow.
- `console-live.kubestellar.io` host, TLS, OAuth app, and GitHub allowlist.
- OCI OKE kubeconfigs, cluster names, namespaces, and GHCR image promotion details.
- Any workflow defaults tied to `DavidDiaz0317/console`.

The private workflow is guarded with `if: github.repository == 'DavidDiaz0317/console'` and parameterized through repository variables where possible.

## Suggested PR Slices

1. Add semantic markers and route-state markers with no workflow changes.
2. Add groundtruth collector/evidence helpers and local tests.
3. Add live canary semantic tests behind explicit environment flags.
4. Add browser-matrix live checks behind explicit environment flags.
5. Add failure issue workflow or adapt it to upstream-owned infrastructure.

## Validation Commands

From the repository root:

```powershell
git diff --check
node --check .github/scripts/console-live-promote-failure-issue.cjs
node --check web/harness/scripts/compareBrowserMatrix.cjs
```

From `web`:

```powershell
npx eslint e2e/visual-login/**/*.ts harness/**/*.ts
npm run test:visual:adequacy
npx playwright test --config e2e/visual-login/intensive.config.ts --project=semantic-groundtruth --grep @live-site --list
npx playwright test --config e2e/visual-login/browser-matrix.config.ts --list
```

## Risks

- Live data is dynamic, so raw screenshots are advisory unless the region is stable or masked.
- Kubernetes API rate limiting can produce partial API totals; tests should classify that as data loss, not a zero-count UI defect.
- Browser rendering differences should fail only when semantic content, named controls, overlay ordering, or layout usability differs.
- Upstream should not inherit fork secrets, domains, OAuth apps, or OCI cluster assumptions.
