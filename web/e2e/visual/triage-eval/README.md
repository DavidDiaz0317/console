# Visual triage eval set

A curated set of labeled BEFORE/AFTER pairs used to measure the **routing accuracy** of the
deterministic visual-regression triage (`scripts/visual-diff-triage.py`). The `eval` subcommand runs
the **same** pixel-diff pipeline used in CI against these cases and gates on accuracy.

The pipeline is fully deterministic - there is no model. It only decides whether a diff is small
enough to ignore as `noise` or large enough to package for the downstream issue-scanning agent
(`agent_triage_required`). It does **not** judge intended-change vs regression; that semantic call is
delegated to the agent. Accordingly, the eval measures only that noise cases are ignored and every
non-noise case (both intended restyles and regressions) is routed to agent triage.

```bash
# Run the eval against the curated cases and gate on routing accuracy.
python3 scripts/visual-diff-triage.py eval --cases-dir web/e2e/visual/triage-eval/cases

# Optional flags: --config <path> (default .github/visual-triage-config.json),
# --output <path> to write the JSON summary, --min-accuracy <float> to override the gate.
```

## Layout

Each case is a directory under `cases/<id>/`:

- `before.png` - the committed-baseline view
- `after.png` - the changed view
- `meta.json` - `{ expected, pr_title, changed_files, note, source }`, where `expected` is one of
  `regression | intended_change | noise`

## Status

These are **synthetic seeds** (`source: synthetic-seed`) so the accuracy gate exists from day one.
They should be progressively **replaced/augmented with real harvested pairs** from past Visual
Regression failures (auth / high-risk pages, animation noise, genuine restyles) to make the gate
representative of production. The pass threshold is `eval_min_accuracy` in
`.github/visual-triage-config.json`.
