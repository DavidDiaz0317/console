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
- `LIVE_CLUSTER_CONTEXTS`: optional comma-separated context allowlist
- `LIVE_CLUSTER_EXPECTED_CONTEXTS`: expected reachable context count for required live checks, defaults to `3`
- `LIVE_CLUSTER_EXPECTED_READY_NODES`: expected Ready node count for required live checks, defaults to `6`
- `SELF_HOSTED_CONSOLE_URL`: URL of a self-hosted Console connected to the same clusters
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

If `LIVE_CLUSTER_TESTS` is not `true`, the test skips with a clear config-dependent reason. When `LIVE_CLUSTER_TESTS=true`, `kubectl`, kubeconfig access, and `SELF_HOSTED_CONSOLE_URL` are required. The OCI OKE v1 live target expects three reachable contexts, six total nodes, and six Ready nodes: `ks-console-ci-1`, `ks-console-ci-2`, and `ks-console-ci-3`.

For the OKE LoadBalancer target, deploy Console with the fork image and set `FRONTEND_URL` to the same URL used by `SELF_HOSTED_CONSOLE_URL`; otherwise dev-mode auth redirects back to localhost instead of the load balancer:

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
  --wait \
  --timeout 10m
```
