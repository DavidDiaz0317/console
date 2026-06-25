#!/usr/bin/env python3
"""Append-only merge of a triage ledger emitted by a CI run into the canonical in-repo ledger.

The failing Visual Regression run appends decision rows to its runner checkout and uploads them as an
artifact, but never commits them. Before the close-on-green workflow can write a resolution verdict
back onto those rows (via `visual-diff-triage.py ingest-verdict`), the canonical ledger must actually
contain them. This helper seeds the canonical ledger with any artifact rows it is missing, deduped by
`decision_id`, preserving existing rows (and any verdicts already written to them).

Paths are read from the environment so the workflow can call it with no argument parsing:
  LEDGER           canonical ledger path (default: .github/triage-ledger.jsonl)
  ARTIFACT_LEDGER  artifact ledger path to merge in (optional; no-op if empty/missing)
"""
import json
import os
from pathlib import Path


def load_rows(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


def main() -> None:
    ledger = Path(os.environ.get("LEDGER", ".github/triage-ledger.jsonl"))
    artifact = os.environ.get("ARTIFACT_LEDGER", "").strip()
    if not artifact:
        print("No artifact ledger to merge; leaving canonical ledger unchanged.")
        return
    artifact_path = Path(artifact)
    if not artifact_path.exists():
        print(f"Artifact ledger {artifact_path} not found; leaving canonical ledger unchanged.")
        return

    seen: set = set()
    merged: list[dict] = []
    # Canonical rows win on conflict so we never clobber a verdict already recorded.
    for path in (ledger, artifact_path):
        for row in load_rows(path):
            decision_id = row.get("decision_id")
            if decision_id in seen:
                continue
            seen.add(decision_id)
            merged.append(row)

    ledger.parent.mkdir(parents=True, exist_ok=True)
    ledger.write_text(
        "".join(json.dumps(row, sort_keys=False) + "\n" for row in merged),
        encoding="utf-8",
    )
    print(f"Merged ledger now has {len(merged)} rows.")


if __name__ == "__main__":
    main()
