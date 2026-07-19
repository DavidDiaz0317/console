# Hive + Visual Hive

This repository is managed by Hive with `comprehensive` coverage and `repair-pr` automation authority. Visual Hive runs deterministic checks; Hive alone owns issues, repair branches, pull requests, merges, and closure. Hive keeps at most 1 managed findings active as GitHub issues at once and permits at most 2 bounded repair attempts per finding; every additional finding remains durable as a bead until capacity is available.

## Operator commands

The existing ordinary Hive/dashboard process owns this local Visual Hive repair runtime. Configure that same process with the exact `HIVE_STATE_DIR=/data/hive-state`, ensure its normal project scope includes `DavidDiaz0317/console`, and confirm its existing dashboard listener is HTTP-ready before restarting ordinary Hive/dashboard. Do not use `hive run` or `hive start` for normal operation. Use `hive stop` only when `hive status` or `hive doctor` directs cleanup of a stale legacy scheduler; it does not stop ordinary Hive/dashboard. Run:

```sh
hive doctor --state-dir /data/hive-state --json
hive status --state-dir /data/hive-state --json
hive pause --state-dir /data/hive-state --json
hive resume --state-dir /data/hive-state --json
hive approve-merge --state-dir /data/hive-state --pr NUMBER --head EXACT_HEAD_SHA --plan --json
hive approve-merge --state-dir /data/hive-state --pr NUMBER --head EXACT_HEAD_SHA --base EXACT_BASE_SHA --diff-digest EXACT_DIFF_SHA256 --reason "reviewed exact path-held repair" --json
hive revoke-merge-approval --state-dir /data/hive-state --reason "review withdrawn" --json
hive retry-repair --state-dir /data/hive-state --finding FINGERPRINT --recurrence N --attempt N --failure-class infrastructure --failure-id FAILURE_ID --reason "dependency restored" --json
```

If status reports `workflow_dispatch_recovery`, use its exact `revoke_plan_command` (preferred for uncertain transport) or `retry_plan_command`; never delete the dispatch state manually.

Default branch: `main`. Detected languages: Go, Python, TypeScript/JavaScript.
