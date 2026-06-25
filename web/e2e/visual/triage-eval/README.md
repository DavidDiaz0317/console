# Visual triage eval set

A curated set of labeled BEFORE/AFTER pairs used to measure the accuracy of the semantic
visual-regression triage (`scripts/visual-diff-triage.py`). The `eval` subcommand runs the **same**
pipeline used in CI against these cases and gates on accuracy:

```bash
# Real VLM (requires VISUAL_TRIAGE_API_KEY); falls back to a mock smoke check when the key is unset.
python3 scripts/visual-diff-triage.py eval --cases-dir web/e2e/visual/triage-eval/cases

# Force the offline mock smoke check.
python3 scripts/visual-diff-triage.py eval --mock-model
```

## Layout

Each case is a directory under `cases/<id>/`:

- `before.png` — the committed-baseline view
- `after.png` — the changed view
- `meta.json` — `{ expected, pr_title, changed_files, note, source }`, where `expected` is one of
  `regression | intended_change | noise`

## Status

These are **synthetic seeds** (`source: synthetic-seed`) so the accuracy gate exists from day one.
They should be progressively **replaced/augmented with real harvested pairs** from past Visual
Regression failures (auth / high-risk pages, animation noise, genuine restyles) to make the gate
representative of production. The pass threshold is `eval_min_accuracy` in
`.github/visual-triage-config.json`.
