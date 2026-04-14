# Drasi Adopter Entry (Draft)

This is the proposed entry we plan to submit to the [Drasi](https://github.com/drasi-project/community) project
for inclusion in their `ADOPTERS.md`. It is staged here in the KubeStellar Console repository so the
Drasi maintainers and Product Manager can review and approve the wording before we open a PR
against their repo.

---

## Proposed ADOPTERS.md entry

### KubeStellar

**Website:** https://kubestellar.io
**Repo:** https://github.com/kubestellar/kubestellar
**Console:** https://console.kubestellar.io
**Status:** Production

KubeStellar is a CNCF Sandbox project for multi-cluster Kubernetes configuration management.
The KubeStellar Console ships a first-class **Drasi dashboard** at `/drasi` that visualizes
Drasi's reactive data pipelines — Sources, Continuous Queries, and Reactions — with animated
data-flow connections and a nested live-results table.

**How we use Drasi**

- Monitor Drasi Sources (HTTP, PostgreSQL, CosmosDB, Gremlin, SQL) alongside Kubernetes
  workloads in a single pane of glass.
- Visualize Continuous Queries and their subscribed Reactions (SSE, SignalR, Webhook, Kafka)
  with active/inactive path indication.
- Provide configuration affordances per node (start/stop, expand, pin, configure name / type
  / query body) directly from the dashboard.
- Discover Drasi resources via the Drasi management API (`/v1/sources`, `/v1/continuousQueries`,
  `/v1/reactions`) when `VITE_DRASI_API_URL` is configured; fall back to demo data otherwise.

**Contact:** Andy Anderson — andy@clubanderson.com — GitHub [@clubanderson](https://github.com/clubanderson)

---

## Submission plan

1. Share this draft with the Drasi Product Manager and project maintainers for wording approval.
2. Once approved, open a PR against `drasi-project/community` (or wherever they stand up their
   `ADOPTERS.md`) with the entry above.
3. Link the merged Drasi PR from this file so the provenance is traceable from our repo.
