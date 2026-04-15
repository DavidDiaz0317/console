# Drasi Adopter Entry (Draft)

This is the proposed entry we plan to submit to the [Drasi](https://github.com/drasi-project/community) project
for inclusion in their `ADOPTERS.md`. It is staged here in the KubeStellar Console repository so the
Drasi maintainers and Product Manager can review and approve the wording before we open a PR
against their repo.

**Status of the integration (as of this PR):**

The KubeStellar Console's `/drasi` dashboard is a **fully functional** Drasi client, not a mockup.
It connects to real Drasi installations in all three Drasi deployment modes and streams real
continuous-query result deltas into the dashboard. The draft wording below has been revised
from the original placeholder version to reflect the shipped state.

---

## Proposed ADOPTERS.md entry

### KubeStellar

**Website:** https://kubestellar.io
**Repo:** https://github.com/kubestellar/kubestellar
**Console:** https://console.kubestellar.io/drasi
**Adopter type:** Independent CNCF Sandbox project (multi-cluster Kubernetes configuration management)
**Status:** Production — Drasi is a first-class integration, not a plugin.

KubeStellar is a CNCF Sandbox project for multi-cluster Kubernetes configuration management.
The KubeStellar Console ships a first-class **Drasi dashboard** at `/drasi` that visualizes
Drasi's reactive data pipelines — Sources, Continuous Queries, and Reactions — with animated
data-flow connections, a nested live-results table, and full CRUD on Drasi resources from the
gear-icon modals.

**The dashboard works equally against all three Drasi deployment modes:**

1. **`drasi-lib`** — transitively supported via any program that wraps the embedded library with
   a `drasi-server`-compatible REST endpoint.
2. **`drasi-server`** — standalone single-process deployments. The dashboard connects directly to
   `/api/v1/*` and subscribes to the built-in SSE event streams at
   `/api/v1/instances/{id}/queries/{q}/events/stream` for per-query result deltas.
3. **`drasi-platform`** — Kubernetes-based deployments. The dashboard reaches the in-cluster
   `drasi-api` Service in `drasi-system` via the Kubernetes API server's built-in Service proxy,
   using the user's kubeconfig RBAC — no separate ingress or port-forward required.

Detection is automatic: the dashboard probes for a configured drasi-server URL first, falls back
to the Kubernetes mode on any connected cluster with Drasi installed, and finally falls back to
a realistic stock-ticker demo pipeline when neither is reachable.

**How KubeStellar operators use Drasi**

- **Discovery.** Auto-discover every Drasi Source (HTTP, PostgreSQL, MySQL, SQL Server,
  CosmosDB Gremlin, Dataverse, EventHub, Kubernetes, Debezium), every Continuous Query (Cypher
  / GQL), and every Reaction (SSE, SignalR, HTTP, Kafka, Event Grid, Storage Queue, Dapr,
  Debezium, MCP, StoredProc, Gremlin, SyncDaprStateStore, PostDaprPubSub, SyncVectorStore,
  Result, Debug) from the user's environment.
- **Live visualization.** Real-time SVG flow topology with state-aware line colors
  (active / idle / stopped / error), seven traffic-pattern templates so distinct lines feel
  distinct, hover-to-highlight a query's upstream sources and downstream reactions, and a
  compact KPI strip above the graph (Events/s, Result Rows, Sources, Reactions).
- **Live data.** The selected query's result set streams into a dynamic-column results table
  over the built-in SSE event stream (drasi-server) or a Result reaction (drasi-platform).
  The table derives its columns from the actual query schema, not a hardcoded shape.
- **Configuration.** Per-node Stop / Expand / Pin / Configure controls. The Configure gear
  on sources and queries opens a modal that edits name / type / query body, and saves route
  through to `PUT /api/v1/sources/{id}` (or `/v1/sources/{id}` on drasi-platform) so the
  change lands in the real Drasi control plane.
- **Accessibility.** Respects `prefers-reduced-motion` — lines remain visible in their state
  color but the flow dots stop animating.

**Why this matters to Drasi adopters**

KubeStellar users are typically running 5–50 Kubernetes clusters and need to observe reactive
data pipelines alongside everything else they run. Giving Drasi a first-class, always-present
dashboard in the KubeStellar Console puts Drasi in front of every KubeStellar operator without
asking them to context-switch into a separate Drasi UI.

**Install path**

KubeStellar operators install Drasi on any cluster they manage through the console's built-in
`install-drasi` AI mission (from the kubestellar/console-kb knowledge base), which runs the
official `drasi init` sequence and verifies readiness. The `/drasi` dashboard lights up with
real data the moment the control plane reports `Running`.

**Contact:** Andy Anderson — andy@clubanderson.com — GitHub [@clubanderson](https://github.com/clubanderson)

---

## Screenshots

*Production screenshots of the live `/drasi` dashboard against a real Drasi install will be
added here once the Drasi PM has reviewed the wording.* The dashboard currently runs live at
`https://console.kubestellar.io/drasi` in demo mode by default, and against the KubeStellar
Prow cluster's drasi-platform install (`drasi-system` namespace) when the viewer's kubeconfig
is pointed at that cluster.

---

## Submission plan

1. Share this draft with the Drasi Product Manager and project maintainers for wording approval
   via a comment on this PR.
2. Once approved, open a PR against `drasi-project/community` (or wherever they stand up their
   `ADOPTERS.md`) with the entry above, including a production screenshot.
3. Link the merged upstream PR back from this file so the provenance is traceable from our repo.

## Related work

- Real integration landed in [#8158](https://github.com/kubestellar/console/pull/8158)
  (REST adapters for both drasi-server and drasi-platform, SSE query stream subscription, gear
  modal CRUD wired to the real Drasi API).
- Visual polish landed in [#8163](https://github.com/kubestellar/console/pull/8163)
  (state-aware line colors, hover highlighting, KPI strip, reduced-motion gate).
- Backend reverse proxy at `pkg/api/handlers/drasi_proxy.go` forwards `/api/drasi/proxy/*`
  to either a drasi-server URL or the in-cluster `drasi-api` Service.
- Frontend hook at `web/src/hooks/useDrasiResources.ts` auto-detects the deployment mode and
  normalizes both REST shapes into a single `DrasiResourceData` type the card is oblivious to.
- SSE subscription hook at `web/src/hooks/useDrasiQueryStream.ts` maintains a rolling result
  set from `{added, updated, deleted}` delta events.
