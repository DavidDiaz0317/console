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

If `kubectl`, kubeconfig, secrets, or `LIVE_CLUSTER_TESTS=true` are absent, the test skips with a clear config-dependent reason.
