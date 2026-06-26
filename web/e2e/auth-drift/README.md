# Auth Drift Tests

Credential-free Playwright tests for login-related UI drift in KubeStellar Console.

The suite protects these contracts:

1. Public demo no-login contract: `console.kubestellar.io` must land on the dashboard without showing a login page or login controls.
2. OAuth login UI contract: an OAuth-enabled login page must render the expected login card, GitHub button, branding, and mobile layout.
3. Localhost dev-mode contract: a local console must require login, click the GitHub entry point, and then reach the dashboard.
4. Fake OAuth contract: a local console must complete the real OAuth-style authorize, callback, token exchange, fake GitHub user fetch, cookie setup, and dashboard flow without real credentials.
5. Optional external OAuth contract: `/auth/github` must redirect to GitHub authorize with safe params and no token leakage.

The tests do not use real GitHub credentials. The fake OAuth test completes the console's actual OAuth code path against a local GitHub-compatible fake provider.

## Layout

```text
e2e/auth-drift/
|-- auth-ui-drift.config.ts
|-- fake-github-oauth-provider.mjs
|-- fake-oauth-login-dashboard-drift.spec.ts
|-- hosted-demo-auth-drift.spec.ts
|-- localhost-login-dashboard-drift.spec.ts
|-- oauth-staging-login-drift.spec.ts
`-- __screenshots__/chromium/
```

This directory uses a standalone Playwright config. The main Playwright config ignores `**/auth-drift/**`, so normal Playwright runs do not pick up these tests.

## Test Cases

| Spec | Test | Contract |
|---|---|---|
| `hosted-demo-auth-drift.spec.ts` | `root route renders demo dashboard without any login workflow` | The public demo opens the dashboard and has no login UI. |
| `hosted-demo-auth-drift.spec.ts` | `direct /login route auto-enters demo mode instead of exposing auth UI` | Direct `/login` on the public demo still avoids login UI. |
| `oauth-staging-login-drift.spec.ts` | `OAuth staging login page renders stable GitHub login UI` | Login card, button, branding, absent fallback UI, and screenshot baseline remain stable. |
| `oauth-staging-login-drift.spec.ts` | `OAuth staging login card fits mobile viewport` | Mobile login card stays visible, bounded, and matches its baseline. |
| `oauth-staging-login-drift.spec.ts` | `OAuth staging login button points at backend auth route` | The button routes to `/auth/github` without leaking tokens. |
| `oauth-staging-login-drift.spec.ts` | `OAuth backend authorize redirect contract is stable` | External OAuth staging redirects to GitHub authorize with `client_id`, `redirect_uri`, `state`, and `scope=user:email`. |
| `localhost-login-dashboard-drift.spec.ts` | `localhost console requires login and reaches dashboard after GitHub entry point` | Local backend plus Vite requires login, enters dev-mode auth through the GitHub button, and lands on dashboard. |
| `fake-oauth-login-dashboard-drift.spec.ts` | `localhost console completes full fake OAuth flow and reaches dashboard` | Local backend plus Vite requires login, performs authorize/callback/token/user exchange through `fake-github-oauth-provider.mjs`, sets HttpOnly cookies, verifies `/api/me`, and lands on dashboard. |

The backend authorize redirect test only runs when `AUTH_DRIFT_LOGIN_URL` points at an OAuth-configured backend.

## Running Locally

```bash
cd web

# Local mocked OAuth login UI drift. Starts Vite on 127.0.0.1:4176.
npm run test:auth-drift -- e2e/auth-drift/oauth-staging-login-drift.spec.ts

# Hosted public demo no-login drift.
AUTH_DRIFT_DISABLE_WEBSERVER=1 \
  npm run test:auth-drift -- e2e/auth-drift/hosted-demo-auth-drift.spec.ts

# External OAuth-enabled staging login drift.
AUTH_DRIFT_LOGIN_URL="https://<oauth-staging-host>/login" \
AUTH_DRIFT_DISABLE_WEBSERVER=1 \
  npm run test:auth-drift -- e2e/auth-drift/oauth-staging-login-drift.spec.ts
```

To run the localhost login-to-dashboard spec, start a dev-mode backend and Vite first:

```bash
mkdir -p /tmp/auth-drift
go build -o /tmp/auth-drift/console-bin ./cmd/console

JWT_SECRET="auth-drift-local" \
DEV_MODE=true \
PORT=8081 \
FRONTEND_URL="http://127.0.0.1:4176" \
DATABASE_PATH="/tmp/auth-drift/console.db" \
KC_AGENT_TOKEN="auth-drift-local-agent-token" \
NO_LOCAL_AGENT=true \
  /tmp/auth-drift/console-bin
```

In a second terminal:

```bash
cd web
BACKEND_LISTEN_PORT=8081 VITE_DEV_MODE=true npm run dev -- --host 127.0.0.1 --port 4176
```

In a third terminal:

```bash
cd web
AUTH_DRIFT_DISABLE_WEBSERVER=1 \
  npm run test:auth-drift -- e2e/auth-drift/localhost-login-dashboard-drift.spec.ts
```

To run the fake OAuth login-to-dashboard spec, start the fake provider, a non-dev backend, and Vite:

```bash
mkdir -p /tmp/auth-drift-fake-oauth
go build -o /tmp/auth-drift-fake-oauth/console-bin ./cmd/console
```

In a second terminal:

```bash
cd web
GITHUB_CLIENT_ID="auth-drift-client-id-12345" \
GITHUB_CLIENT_SECRET="auth-drift-client-secret-1234567890" \
  node e2e/auth-drift/fake-github-oauth-provider.mjs
```

In a third terminal:

```bash
JWT_SECRET="auth-drift-local" \
DEV_MODE=false \
GITHUB_URL="http://127.0.0.1:4180" \
GITHUB_CLIENT_ID="auth-drift-client-id-12345" \
GITHUB_CLIENT_SECRET="auth-drift-client-secret-1234567890" \
PORT=8082 \
FRONTEND_URL="http://127.0.0.1:4177" \
DATABASE_PATH="/tmp/auth-drift-fake-oauth/console.db" \
KC_AGENT_TOKEN="auth-drift-local-agent-token" \
NO_LOCAL_AGENT=true \
SKIP_ONBOARDING=true \
IGNORE_PERSISTED_OAUTH_CREDENTIALS=true \
  /tmp/auth-drift-fake-oauth/console-bin
```

In a fourth terminal:

```bash
cd web
BACKEND_LISTEN_PORT=8082 VITE_DEV_MODE=false npm run dev -- --host 127.0.0.1 --port 4177
```

In a fifth terminal:

```bash
cd web
AUTH_DRIFT_DISABLE_WEBSERVER=1 \
  npm run test:auth-drift -- e2e/auth-drift/fake-oauth-login-dashboard-drift.spec.ts
```

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `AUTH_DRIFT_DEMO_URL` | `https://console.kubestellar.io` | Public demo URL for the hosted no-login spec. |
| `AUTH_DRIFT_LOGIN_URL` | `http://127.0.0.1:4176/login` | OAuth login URL. Set this for an external OAuth-enabled staging target. |
| `AUTH_DRIFT_LOCAL_CONSOLE_URL` | `http://127.0.0.1:4176` | Localhost console URL for the login-to-dashboard spec. |
| `AUTH_DRIFT_LOCAL_BACKEND_URL` | `http://127.0.0.1:8081` | Localhost backend URL for the login-to-dashboard spec. |
| `AUTH_DRIFT_FAKE_OAUTH_CONSOLE_URL` | `http://127.0.0.1:4177` | Localhost console URL for the fake OAuth login-to-dashboard spec. |
| `AUTH_DRIFT_FAKE_OAUTH_BACKEND_URL` | `http://127.0.0.1:8082` | Localhost backend URL for the fake OAuth login-to-dashboard spec. |
| `AUTH_DRIFT_FAKE_OAUTH_PORT` | `4180` | Local fake GitHub-compatible OAuth provider port. |
| `AUTH_DRIFT_DISABLE_WEBSERVER` | unset | Set to `1` when the target server is already running or external. |
| `CI` | unset | Enables CI timeouts and one retry. |

When `AUTH_DRIFT_LOGIN_URL` is not set, `oauth-staging-login-drift.spec.ts` mocks browser-visible backend endpoints so the login page can render against local Vite without a backend. It still skips the external `/auth/github` authorize redirect test unless an OAuth-enabled backend URL is supplied.

## Visual Baselines

The OAuth login card screenshots are stored under `__screenshots__/chromium/`. The suite captures only the login card, not the full animated background, to reduce unrelated visual noise.

If baselines need to be regenerated, do it intentionally:

```bash
cd web
npm run test:auth-drift:update -- e2e/auth-drift/oauth-staging-login-drift.spec.ts
```

For upstream CI stability, prefer regenerating on Linux because GitHub Actions runs on `ubuntu-latest`.

## CI

`.github/workflows/auth-drift.yml` runs on:

- All pull requests.
- Pushes to `main` that touch those same paths.
- A scheduled run every 4 hours.
- Manual `workflow_dispatch`.

Jobs:

| Job | PRs | Schedule/dispatch | What it checks |
|---|---:|---:|---|
| `local-login-ui-drift` | yes | yes | Local mocked OAuth login card and visual baselines. |
| `hosted-demo-no-login-drift` | yes | yes | `console.kubestellar.io` goes straight to dashboard with no login workflow. |
| `localhost-login-dashboard-drift` | yes | yes | Builds the backend, starts Vite, clicks the GitHub entry point, and reaches dashboard in dev mode. |
| `fake-oauth-login-dashboard-drift` | yes | yes | Builds the backend, starts Vite and a local fake GitHub provider, completes the OAuth flow, verifies the fake user through `/api/me`, and reaches dashboard. |
| `oauth-staging-drift` | no | yes, when `AUTH_DRIFT_LOGIN_URL` is configured | External OAuth staging login UI and authorize redirect contract. |

Every Auth Drift job uploads artifacts for diagnostics, including Playwright JSON results, HTML report output, screenshots/traces/diffs, context JSON, and local backend/Vite logs where applicable.

## Failure Issues

`.github/workflows/auth-drift-failure-issue.yml` listens for failed Auth Drift workflow runs. It does not checkout code and does not execute pull request code. It reads workflow metadata plus uploaded artifacts, then creates or updates one open issue per failure signature.

Issue labels:

- `auth-drift-failure`
- `bug`
- `test-failure`
- `priority/critical`

The issue body includes run context, PR context when available, failed jobs/tests, error excerpts, artifact links, target URLs with sensitive values redacted, expected contracts, reproduction commands, and suggested files for an agent to inspect.

For a fork, GitHub Issues must be enabled before the workflow can create issues. The workflow also supports manual testing with a failed Auth Drift run ID:

```bash
gh workflow run "Auth Drift Failure Issue" --field run_id=<failed-auth-drift-run-id>
```
