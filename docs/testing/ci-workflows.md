# CI Workflows

## `visual-login-pr.yml`

Runs on pull requests and manual dispatch.

Properties:

- no secrets
- no `pull_request_target`
- no paid services
- five-minute job timeout
- Chromium only
- local demo mode by default
- sanitized reports and evidence upload

Important env:

- `VISUAL_LOGIN_AUTH_MODE=demo`
- `PR_VISUAL_USE_HOSTED_DEMO=false`
- `HOSTED_DEMO_URL` only matters when hosted demo smoke is explicitly enabled

Local equivalent:

```bash
cd web
npm run test:visual:pr
npm run test:visual:report:pr
```

## `visual-login-intensive.yml`

Runs daily at `08:00 UTC` and manually.

Manual inputs:

- `runGroundTruth`: enables live ground-truth attempts when secrets exist
- `runMutationMatrix`: includes or skips mutation tests

It runs:

- mutation/fault-injection tests
- false positive checks
- false negative checks
- responsive layout matrix
- AI Mission entrypoint checks when enabled
- static generated-test adequacy analysis
- healer guardrail tests
- optional live Kubernetes ground truth

Artifacts:

- `web/test-results/evidence/`
- `web/test-results/reports/`

Raw kubeconfig, cookies, localStorage/sessionStorage, authorization headers, OAuth tokens, and environment secrets are not uploaded by these workflows.
