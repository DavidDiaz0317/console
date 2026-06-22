# Live Cluster Ground Truth

Live Kubernetes ground truth is optional and only runs in the scheduled/manual intensive workflow or local explicit runs. It is not part of PR validation.

Command:

```bash
cd web
LIVE_CLUSTER_TESTS=true npm run test:visual:groundtruth
```

Supported configuration:

- `KUBECONFIG_B64`: base64-encoded kubeconfig
- `KUBECONFIG_CONTENT`: raw kubeconfig content
- `KUBECONFIG_PATH`: path to an existing kubeconfig
- `LIVE_CLUSTER_FIXTURE_KUBECONFIG_B64`: optional base64-encoded write-capable kubeconfig for fixture injection
- `LIVE_CLUSTER_CONTEXTS`: optional comma-separated context allowlist
- `LIVE_CLUSTER_EXPECTED_CONTEXTS`: expected reachable context count for required live checks, defaults to `3`
- `LIVE_CLUSTER_EXPECTED_READY_NODES`: expected Ready node count for required live checks, defaults to `6`
- `LIVE_PRODUCTION_CONSOLE_URL`: production live URL for unauthenticated security smoke checks, defaults to `https://console-live.kubestellar.io`
- `LIVE_CANARY_CONSOLE_URL`: private canary URL for authenticated live UI checks
- `SELF_HOSTED_CONSOLE_URL`: backwards-compatible self-hosted/canary URL connected to the same clusters
- `LIVE_SITE_AUTH_MODE`: canary auth bootstrap strategy: `dev`, `preauthenticated`, or `none`
- `LIVE_CLUSTER_FIXTURES`: set to `true` to inject controlled Kubernetes UI fixtures
- `LIVE_CLUSTER_FIXTURE_CONTEXT`: context used for fixture writes, defaults to `ks-console-ci-1`
- `LIVE_FIXTURE_NAMESPACE`: fixture namespace, defaults to `ks-live-ui-fixtures`
- `LIVE_SITE_AI_AUDIT`: optional advisory AI audit mode, defaults to `off`
- `KC_AGENT_TOKEN`: optional token for self-hosted agent-backed flows

The collector writes a temp kubeconfig with mode `0600` when content is supplied through env. It never uploads kubeconfig content.

Collected sanitized facts:

- configured context count
- reachable context count
- node ready/notReady counts
- pod phase counts
- CrashLoopBackOff count
- namespace count
- deployment availability counts

Not collected:

- Secrets
- ConfigMap content
- pod environment variables
- raw annotations
- raw kubeconfig
- cookies or tokens

If `LIVE_CLUSTER_TESTS` is not `true`, the test skips with a clear config-dependent reason. When `LIVE_CLUSTER_TESTS=true`, `kubectl`, kubeconfig access, and a canary/self-hosted Console URL (`LIVE_CANARY_CONSOLE_URL` or `SELF_HOSTED_CONSOLE_URL`) are required for authenticated UI groundtruth checks. The OCI OKE v1 live target expects three reachable contexts, six total nodes, and six Ready nodes: `ks-console-ci-1`, `ks-console-ci-2`, and `ks-console-ci-3`.

Live-site UI coverage is split into two targets:

- Production `console-live`: verifies HTTPS/health, unauthenticated `/api/me=401`, OAuth redirect, and no ingress error page. It does not automate GitHub OAuth.
- Private canary/self-hosted Console: uses the same image and live kubeconfig as production, then runs authenticated semantic/layout checks against real cluster data.

The live dashboard is not compared to static screenshot baselines. It is checked with deterministic invariants:

- hidden `data-groundtruth-field` markers for cluster/node/pod counts
- Kubernetes collector counts from the same configured contexts
- layout checks for overflow, blank cards, stuck loaders, and severe overlap
- optional fixture injection for known pending/image-pull-failure/healthy deployment states

Fixture injection is disabled by default because it requires write permissions. When enabled, the harness creates `ks-live-ui-fixtures`, applies one healthy deployment, one image-pull-failure pod, and one unschedulable pending pod, verifies the UI can see them, and deletes the namespace unless `LIVE_CLUSTER_FIXTURE_CLEANUP=false`.

For the OKE LoadBalancer target, deploy Console with the fork image, set `FRONTEND_URL` to the same URL used by `SELF_HOSTED_CONSOLE_URL`, and set `CLUSTER_BACKED_MODE=true` so the frontend treats backend kubeconfig access as live cluster data instead of falling back to local-agent demo mode:

```bash
helm upgrade --install kc-live ./deploy/helm/kubestellar-console \
  -n kubestellar-console-live \
  --create-namespace \
  --set image.repository=ghcr.io/daviddiaz0317/console \
  --set image.tag=codex-oci-live-groundtruth \
  --set service.type=LoadBalancer \
  --set kubeconfig.existingSecret=kc-live-kubeconfig \
  --set extraEnv[0].name=DEV_MODE \
  --set-string extraEnv[0].value=true \
  --set extraEnv[1].name=FRONTEND_URL \
  --set-string extraEnv[1].value=http://<oci-load-balancer-host>:8080 \
  --set extraEnv[2].name=CLUSTER_BACKED_MODE \
  --set-string extraEnv[2].value=true \
  --wait \
  --timeout 10m
```
