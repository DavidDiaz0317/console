# Auth Drift Tests

Credential-free Playwright tests that guard two login-related UI contracts:

1. **Public demo must NOT show login.** `console.kubestellar.io` should render the
   demo dashboard immediately — never the GitHub login page or login controls.
2. **OAuth login page must render correctly.** When OAuth is configured, the login
   card, GitHub button, branding, and mobile layout must stay stable, and the button
   must point at the backend `/auth/github` route. No GitHub credentials are used.

These tests catch DOM drift (missing/renamed/disabled controls), navigation drift,
visual drift (screenshot baselines), and responsive drift — without completing a real
OAuth login or validating post-login data.

## Layout

```
e2e/auth-drift/
├── auth-ui-drift.config.ts          # Standalone Playwright config (Chromium, serial)
├── hosted-demo-auth-drift.spec.ts   # Public demo: login must be absent (live site)
├── oauth-staging-login-drift.spec.ts# OAuth login page contract (local mock or staging)
└── __screenshots__/chromium/        # Visual baselines — Linux/CI authoritative (see below)
```

The suite has its own config and is excluded from the main Playwright run via
`testIgnore: ['**/auth-drift/**']` in `web/playwright.config.ts`.

## Running locally

```bash
cd web

# OAuth login contract — auto-starts a local Vite dev server on 127.0.0.1:4176
npm run test:auth-drift -- e2e/auth-drift/oauth-staging-login-drift.spec.ts

# Public demo contract — hits the live hosted site, so disable the local server
AUTH_DRIFT_DISABLE_WEBSERVER=1 \
  npm run test:auth-drift -- e2e/auth-drift/hosted-demo-auth-drift.spec.ts

# Whole suite
npm run test:auth-drift
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `AUTH_DRIFT_DEMO_URL` | `https://console.kubestellar.io` | Public demo URL for the hosted-demo spec. |
| `AUTH_DRIFT_LOGIN_URL` | `http://127.0.0.1:4176/login` | OAuth login URL. Set to a real OAuth-enabled console to validate staging instead of the local mock. |
| `AUTH_DRIFT_DISABLE_WEBSERVER` | _unset_ | `1` skips the managed local Vite server (use when targeting a live/external URL). |
| `CI` | _unset_ | When set, uses longer timeouts and one retry. |

When `AUTH_DRIFT_LOGIN_URL` is **not** set, the OAuth spec mocks `/health`,
`/api/me`, `/api/agent/token`, `/api/mcp/**`, and `/api/public/**` so the login page
renders against a local dev server with no backend. The backend-redirect contract test
only runs when `AUTH_DRIFT_LOGIN_URL` points at an OAuth-configured backend.

## Visual baselines (important)

`auth-ui-drift.config.ts` sets `snapshotPathTemplate` to drop the platform suffix, so
there is a **single shared baseline per screenshot**. That baseline is **authoritative
on Linux / CI** (GitHub `ubuntu-latest`). The current baselines pass on both macOS and
Linux within `maxDiffPixelRatio: 0.025`, but if you ever need to regenerate them, do it
in the same Linux environment CI uses so they stay aligned:

```bash
# Regenerate baselines in the exact CI rendering environment (Playwright 1.60.0)
cd web
docker run --rm -v "$PWD":/work -v /work/node_modules -w /work \
  mcr.microsoft.com/playwright:v1.60.0-noble \
  bash -c "npm ci && CI=true npx playwright test \
    --config e2e/auth-drift/auth-ui-drift.config.ts \
    e2e/auth-drift/oauth-staging-login-drift.spec.ts --update-snapshots"
```

Do **not** commit baselines regenerated directly on macOS/Windows — local visual
differences are expected and not a regression. The `-v /work/node_modules` flag keeps
the container's Linux `npm ci` from overwriting your host `node_modules`.

## CI

`.github/workflows/auth-drift.yml` runs three jobs (shared setup in
`.github/actions/auth-drift-setup`):

| Job | Runs on | What it checks |
|---|---|---|
| `local-login-ui-drift` | push to `main`, PRs, schedule, dispatch | OAuth login contract against the local mock. **Only job that runs on PRs**; always uploads its HTML report. |
| `hosted-demo-no-login-drift` | non-PR events | Public demo (`console.kubestellar.io`) shows no login. |
| `oauth-staging-drift` | non-PR events, only when a login URL is provided | Real staging/demo OAuth login URL via `AUTH_DRIFT_LOGIN_URL` (repo var) or `workflow_dispatch` input. |

Schedule: every 4 hours. Failures upload traces/screenshots as artifacts (14-day retention).
