# Visual/Login Harness

The visual/login harness is a two-loop Playwright-based system for protecting KubeStellar Console login and demo behavior while also testing whether the tests are meaningful.

The thesis is: use Playwright as the browser execution layer, but make the oracle product-invariant driven. The harness protects truths such as "hosted demo must not require GitHub login" and "the dashboard must not be blank or stuck loading" instead of only comparing screenshots.

## Loop 1: Fast PR Protection

Workflow: `.github/workflows/visual-login-pr.yml`

Command:

```bash
cd web
npm run test:visual:pr
```

This loop runs Chromium-only checks against a local Vite preview by default. It requires no secrets, no kubeconfig, no real GitHub OAuth app, no kc-agent, and no live cluster. It sets `VISUAL_LOGIN_AUTH_MODE=demo` in CI and keeps hosted demo checks opt-in through `PR_VISUAL_USE_HOSTED_DEMO=true`.

It checks:

- hosted/local demo does not show a blocking GitHub login
- URL does not land on `/login`, `/signin`, or `/auth`
- dashboard content is recognizable
- login page primary controls are visible and inside the viewport
- blank pages and unrecoverable loading states fail
- critical browser console/page errors fail
- sanitized evidence and a GitHub step summary are produced

## Loop 2: Scheduled Intensive Validity

Workflow: `.github/workflows/visual-login-intensive.yml`

Command:

```bash
cd web
npm run test:visual:intensive
```

This loop runs daily at `08:00 UTC` and through `workflow_dispatch`. It includes route-interception mutations, false-positive/false-negative checks, responsive matrix checks, generated-test adequacy scoring, healer weakening guardrails, and optional live Kubernetes ground truth.

Reports are written under `web/test-results/reports/`. Evidence is written under `web/test-results/evidence/`.

The intensive loop may fail when a critical mutant survives, because that means tests passed despite injected broken behavior.
