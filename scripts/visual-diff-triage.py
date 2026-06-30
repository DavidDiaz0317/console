#!/usr/bin/env python3
"""Package Playwright visual-regression diffs for issue-based agent triage.

The CI workflow uses Playwright as the first-pass visual change detector. When a
pixel diff is found, this script does not call a model or make the semantic
verdict inside CI. Instead it:
  * parses the failed Playwright screenshot pairs,
  * crops or downsizes the changed regions,
  * stitches BEFORE/AFTER evidence images,
  * writes a structured evidence packet consumed by the generated GitHub issue.

The issue body is the interface to the downstream agent. That agent reads the
issue, inspects the images, and decides whether to update baselines or fix code.
"""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import shutil
import sys
import tempfile
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from PIL import Image, ImageChops, ImageDraw
except ImportError as exc:  # pragma: no cover - exercised in CI setup failures
    raise SystemExit("Pillow is required. Install it with: python -m pip install Pillow") from exc

AGENT_TRIAGE_CLASSIFICATION = "agent_triage_required"
AGENT_TRIAGE_REASONING = (
    "Playwright detected a visual screenshot mismatch. CI packaged the BEFORE/AFTER evidence "
    "for the issue-scanning agent; no in-CI model verdict was made. The agent must inspect the "
    "issue images and PR context to decide whether this is an intended UI change, noise, or a regression."
)


@dataclass
class ImagePair:
    expected: Path
    actual: Path
    diff: Path | None
    test_title: str
    spec_path: str
    project: str
    baseline_path: Path | None


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, indent=2, sort_keys=False)
        handle.write("\n")


DECISION_ID_LEN = 16


def compute_decision_id(pr_number: str, spec_path: str, test_title: str, baseline_path: str) -> str:
    """Deterministic, idempotent join key for a triage decision.

    Hashes only stable inputs (no time/random) so a re-triggered run produces the same id, letting
    a later human/resolution verdict be joined back to the original prediction.
    """
    raw = f"{pr_number}|{spec_path}|{test_title}|{baseline_path}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:DECISION_ID_LEN]


def append_ledger_rows(ledger_path: Path, decisions: list[dict[str, Any]], pr: dict[str, Any]) -> None:
    """Append one compact, joinable row per decision to the JSONL ledger.

    Full decisions stay in the run artifact (triage-results.json); the ledger keeps only the small
    fields needed to later compute accuracy metrics, with append-only writes to minimize merge
    conflicts. human_outcome/verdict_source start null and are filled in by `ingest-verdict`.
    """
    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    with ledger_path.open("a", encoding="utf-8") as handle:
        for decision in decisions:
            row = {
                "decision_id": decision.get("decision_id"),
                "ts": decision.get("timestamp"),
                "pr": pr.get("number", ""),
                "spec_path": decision.get("spec_path", ""),
                "test_title": decision.get("test_title", ""),
                "component_name": decision.get("component_name", ""),
                "predicted": decision.get("classification"),
                "confidence": decision.get("confidence"),
                "routing": decision.get("routing"),
                "high_risk": decision.get("high_risk", False),
                "human_outcome": None,
                "verdict_source": None,
            }
            handle.write(json.dumps(row, sort_keys=False) + "\n")


def rel(path: Path, root: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return path.as_posix()


def normalize_path(value: str | None, base: Path) -> Path | None:
    if not value:
        return None
    path = Path(value)
    if path.is_absolute():
        return path
    return (base / path).resolve()


def collect_failed_tests(report: dict[str, Any]) -> list[dict[str, Any]]:
    failures: list[dict[str, Any]] = []

    def walk_suite(suite: dict[str, Any], inherited_file: str = "") -> None:
        suite_file = suite.get("file") or inherited_file
        for spec in suite.get("specs", []) or []:
            title = " ".join([spec.get("title", ""), *spec.get("tags", [])]).strip()
            for test_case in spec.get("tests", []) or []:
                outcome = test_case.get("outcome", "")
                project = test_case.get("projectName", "")
                for result in test_case.get("results", []) or []:
                    errors = result.get("errors") or ([result.get("error")] if result.get("error") else [])
                    status = result.get("status") or outcome
                    failed = bool(errors) or outcome == "unexpected" or status not in {"passed", "skipped", "expected"}
                    if not failed:
                        continue
                    failures.append(
                        {
                            "title": title,
                            "spec_path": spec.get("file") or suite_file or "",
                            "project": project,
                            "attachments": result.get("attachments", []) or [],
                        }
                    )
        for child in suite.get("suites", []) or []:
            walk_suite(child, suite_file)

    for suite in report.get("suites", []) or []:
        walk_suite(suite)
    return failures


def strip_playwright_suffix(name: str) -> str:
    for suffix in ("-actual.png", "-expected.png", "-diff.png"):
        if name.endswith(suffix):
            return name[: -len(suffix)]
    return Path(name).stem


def find_baseline(expected: Path, snapshots_root: Path) -> Path | None:
    if expected.exists() and "-snapshots" in expected.as_posix():
        return expected

    candidates = list(snapshots_root.glob(f"**/{expected.name}"))
    if len(candidates) == 1:
        return candidates[0]

    stem = strip_playwright_suffix(expected.name)
    stem_candidates = [path for path in snapshots_root.glob("**/*.png") if path.stem.startswith(stem)]
    if len(stem_candidates) == 1:
        return stem_candidates[0]
    return None


def discover_pairs(results_json: Path, test_results_dir: Path, snapshots_root: Path, repo_root: Path) -> list[ImagePair]:
    pairs: list[ImagePair] = []
    seen: set[tuple[str, str]] = set()

    report = load_json(results_json, {}) if results_json.exists() else {}
    for failure in collect_failed_tests(report):
        attachments = failure.get("attachments", [])
        by_name: dict[str, Path] = {}
        for attachment in attachments:
            name = str(attachment.get("name", "")).lower()
            path = normalize_path(attachment.get("path"), repo_root)
            if not path:
                continue
            if name in {"expected", "actual", "diff"}:
                by_name[name] = path

        expected = by_name.get("expected")
        actual = by_name.get("actual")
        if not expected or not actual:
            continue
        key = (expected.as_posix(), actual.as_posix())
        if key in seen:
            continue
        seen.add(key)
        pairs.append(
            ImagePair(
                expected=expected,
                actual=actual,
                diff=by_name.get("diff"),
                test_title=failure.get("title", "visual comparison"),
                spec_path=failure.get("spec_path", ""),
                project=failure.get("project", ""),
                baseline_path=find_baseline(expected, snapshots_root),
            )
        )

    for actual in test_results_dir.glob("**/*-actual.png"):
        expected = actual.with_name(actual.name.replace("-actual.png", "-expected.png"))
        diff = actual.with_name(actual.name.replace("-actual.png", "-diff.png"))
        if not expected.exists():
            continue
        key = (expected.as_posix(), actual.as_posix())
        if key in seen:
            continue
        seen.add(key)
        pairs.append(
            ImagePair(
                expected=expected,
                actual=actual,
                diff=diff if diff.exists() else None,
                test_title=strip_playwright_suffix(actual.name),
                spec_path="",
                project="",
                baseline_path=find_baseline(expected, snapshots_root),
            )
        )
    return pairs


def ensure_same_size(before: Image.Image, after: Image.Image) -> tuple[Image.Image, Image.Image]:
    before = before.convert("RGB")
    after = after.convert("RGB")
    if before.size == after.size:
        return before, after
    width = max(before.width, after.width)
    height = max(before.height, after.height)
    before_canvas = Image.new("RGB", (width, height), "white")
    after_canvas = Image.new("RGB", (width, height), "white")
    before_canvas.paste(before, (0, 0))
    after_canvas.paste(after, (0, 0))
    return before_canvas, after_canvas


def build_mask(before: Image.Image, after: Image.Image, channel_threshold: int) -> Image.Image:
    diff = ImageChops.difference(before, after)
    channels = diff.split()
    max_channel = channels[0]
    for channel in channels[1:]:
        max_channel = ImageChops.lighter(max_channel, channel)
    return max_channel.point(lambda value: 255 if value > channel_threshold else 0, "1")


def bbox_with_padding(bbox: tuple[int, int, int, int], width: int, height: int, padding: int) -> tuple[int, int, int, int]:
    left, top, right, bottom = bbox
    return (
        max(0, left - padding),
        max(0, top - padding),
        min(width, right + padding),
        min(height, bottom + padding),
    )


def connected_components(mask: Image.Image, max_regions: int, padding: int) -> list[dict[str, Any]]:
    width, height = mask.size
    pixels = mask.load()
    visited = bytearray(width * height)
    components: list[dict[str, Any]] = []

    def index(x: int, y: int) -> int:
        return y * width + x

    union_bbox = mask.getbbox()
    if not union_bbox:
        return []
    scan_left, scan_top, scan_right, scan_bottom = union_bbox

    for y in range(scan_top, scan_bottom):
        for x in range(scan_left, scan_right):
            idx = index(x, y)
            if visited[idx] or not pixels[x, y]:
                continue
            queue: deque[tuple[int, int]] = deque([(x, y)])
            visited[idx] = 1
            count = 0
            left = right = x
            top = bottom = y
            while queue:
                cx, cy = queue.popleft()
                count += 1
                left = min(left, cx)
                right = max(right, cx)
                top = min(top, cy)
                bottom = max(bottom, cy)
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    nidx = index(nx, ny)
                    if visited[nidx] or not pixels[nx, ny]:
                        continue
                    visited[nidx] = 1
                    queue.append((nx, ny))
            padded = bbox_with_padding((left, top, right + 1, bottom + 1), width, height, padding)
            components.append({"bbox": padded, "changed_pixels": count})

    return sorted(components, key=lambda item: item["changed_pixels"], reverse=True)[:max_regions]


def stitch(before: Image.Image, after: Image.Image, bbox: tuple[int, int, int, int], output: Path) -> None:
    label_height = 24
    divider_width = 2
    left_crop = before.crop(bbox)
    right_crop = after.crop(bbox)
    width = left_crop.width + right_crop.width + divider_width
    height = max(left_crop.height, right_crop.height) + label_height
    canvas = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, width, label_height), fill=(245, 245, 245))
    draw.text((8, 6), "BEFORE", fill=(0, 0, 0))
    draw.text((left_crop.width + divider_width + 8, 6), "AFTER", fill=(0, 0, 0))
    canvas.paste(left_crop, (0, label_height))
    draw.rectangle((left_crop.width, 0, left_crop.width + divider_width - 1, height), fill=(40, 40, 40))
    canvas.paste(right_crop, (left_crop.width + divider_width, label_height))
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output)


def downscale(image: Image.Image, max_width: int) -> Image.Image:
    if image.width <= max_width:
        return image
    ratio = max_width / image.width
    return image.resize((max_width, max(1, int(image.height * ratio))))


def stitch_full(before: Image.Image, after: Image.Image, output: Path, max_width: int) -> None:
    half_width = max(1, max_width // 2)
    stitch(downscale(before, half_width), downscale(after, half_width), (0, 0, downscale(before, half_width).width, downscale(before, half_width).height), output)


VALID_OUTCOMES = {"regression", "intended_change", "noise"}
PREDICTION_LABELS = (AGENT_TRIAGE_CLASSIFICATION, "noise")


def high_risk(changed_files: list[str], config: dict[str, Any]) -> bool:
    patterns = config.get("issue_agent", {}).get("high_risk_globs", [])
    return any(fnmatch.fnmatch(file, pattern) for file in changed_files for pattern in patterns)


def component_from_pair(pair: ImagePair) -> tuple[str, str]:
    source = pair.spec_path or pair.test_title
    route = "unknown"
    lower = source.lower()
    for name, value in {
        "clusters": "/clusters",
        "settings": "/settings",
        "cicd": "/ci-cd",
        "cluster-admin": "/cluster-admin",
        "workloads": "/workloads",
        "quantum": "/quantum",
        "compliance": "/compliance",
    }.items():
        if name in lower:
            route = value
            break
    return (Path(source).name or pair.test_title or "visual-regression", route)


def triage(args: argparse.Namespace) -> int:
    repo_root = Path(args.repo_root).resolve()
    config = load_json(Path(args.config), {})
    thresholds = config.get("thresholds", {})
    output_dir = Path(args.output_dir).resolve()
    crop_dir = output_dir / "crops"
    output_dir.mkdir(parents=True, exist_ok=True)

    changed_files = [line.strip() for line in Path(args.changed_files).read_text(encoding="utf-8").splitlines() if line.strip()] if args.changed_files else []
    pr = {
        "number": os.getenv("PR_NUMBER", args.pr_number or ""),
        "title": args.pr_title or os.getenv("PR_TITLE", ""),
        "head_sha": os.getenv("GITHUB_SHA", ""),
    }
    is_high_risk = high_risk(changed_files, config)
    max_regions = int(thresholds.get("max_regions", 3))

    pairs = discover_pairs(
        results_json=Path(args.playwright_results).resolve(),
        test_results_dir=Path(args.test_results_dir).resolve(),
        snapshots_root=Path(args.snapshots_root).resolve(),
        repo_root=repo_root,
    )

    decisions: list[dict[str, Any]] = []

    for pair_index, pair in enumerate(pairs, start=1):
        before_raw = Image.open(pair.expected)
        after_raw = Image.open(pair.actual)
        before, after = ensure_same_size(before_raw, after_raw)
        mask = build_mask(before, after, int(thresholds.get("pixel_channel_threshold", 16)))
        changed_pixels = mask.histogram()[255]
        total_pixels = before.width * before.height
        changed_ratio = changed_pixels / total_pixels if total_pixels else 0
        component_name, route = component_from_pair(pair)
        baseline_rel = rel(pair.baseline_path, repo_root) if pair.baseline_path else None
        base_decision = {
            "decision_id": compute_decision_id(pr.get("number", ""), pair.spec_path, pair.test_title, baseline_rel or ""),
            "timestamp": utc_now(),
            "pr": pr,
            "test_title": pair.test_title,
            "spec_path": pair.spec_path,
            "component_name": component_name,
            "route": route,
            "expected_path": rel(pair.expected, repo_root),
            "actual_path": rel(pair.actual, repo_root),
            "diff_path": rel(pair.diff, repo_root) if pair.diff else None,
            "baseline_path": baseline_rel,
            "changed_pixels": changed_pixels,
            "total_pixels": total_pixels,
            "changed_area_ratio": changed_ratio,
            "high_risk": is_high_risk,
            "human_outcome": None,
        }

        if changed_pixels == 0:
            decisions.append({**base_decision, "classification": "noise", "confidence": 1.0, "routing": "pass", "reasoning": "Pixel masks are identical; no agent triage needed.", "model_called": False, "requires_agent_triage": False, "regions": []})
            continue

        if changed_ratio < float(thresholds.get("noise_changed_area_ratio", 0.001)):
            bbox = bbox_with_padding(mask.getbbox() or (0, 0, before.width, before.height), before.width, before.height, int(thresholds.get("crop_padding_px", 16)))
            crop_path = crop_dir / f"pair-{pair_index}-noise.png"
            stitch(before, after, bbox, crop_path)
            decisions.append({**base_decision, "classification": "noise", "confidence": 1.0, "routing": "pass", "reasoning": "Changed area is below the configured noise threshold; no agent issue is needed.", "model_called": False, "requires_agent_triage": False, "regions": [{"bbox": bbox, "stitched_crop": rel(crop_path, repo_root)}]})
            continue

        if changed_ratio >= float(thresholds.get("full_page_changed_area_ratio", 0.6)):
            full_path = crop_dir / f"pair-{pair_index}-full-page.png"
            stitch_full(before, after, full_path, int(thresholds.get("max_full_image_width", 1200)))
            decisions.append({**base_decision, "classification": AGENT_TRIAGE_CLASSIFICATION, "confidence": 0.0, "routing": "agent_triage", "reasoning": "Changed area covers most of the page; CI packaged a downscaled full-page BEFORE/AFTER image for the issue-scanning agent.", "model_called": False, "requires_agent_triage": True, "regions": [{"bbox": [0, 0, before.width, before.height], "stitched_crop": rel(full_path, repo_root), "mode": "downscaled_full_page"}]})
            continue

        components = connected_components(mask, max_regions=max_regions + 1, padding=int(thresholds.get("crop_padding_px", 16)))
        use_full_image = len(components) > max_regions
        if use_full_image:
            regions = [{"bbox": (0, 0, before.width, before.height), "note": f"More than {max_regions} changed regions; using one downscaled full-page image."}]
        else:
            regions = components[:max_regions]

        region_results: list[dict[str, Any]] = []
        for region_index, region in enumerate(regions, start=1):
            bbox = tuple(region["bbox"])
            crop_path = crop_dir / f"pair-{pair_index}-region-{region_index}.png"
            if use_full_image:
                stitch_full(before, after, crop_path, int(thresholds.get("max_full_image_width", 1200)))
            else:
                stitch(before, after, bbox, crop_path)
            result = {
                "classification": AGENT_TRIAGE_CLASSIFICATION,
                "confidence": 0.0,
                "reasoning": AGENT_TRIAGE_REASONING,
                "suspected_component": None,
                "severity": None,
            }
            result["bbox"] = list(bbox)
            result["stitched_crop"] = rel(crop_path, repo_root)
            region_results.append(result)

        primary = region_results[0]
        decisions.append({**base_decision, **primary, "routing": "agent_triage", "model_called": False, "requires_agent_triage": True, "regions": region_results})

    counts: dict[str, int] = {}
    for decision in decisions:
        counts[decision.get("routing", "unknown")] = counts.get(decision.get("routing", "unknown"), 0) + 1
    outcome = "agent_triage" if any(decision.get("routing") == "agent_triage" for decision in decisions) else "pass"
    summary = {
        "timestamp": utc_now(),
        "outcome": outcome,
        "model_calls": 0,
        "model_tokens": 0,
        "budget_exhausted": False,
        "issue_interface": True,
        "decision_counts": counts,
        "pair_count": len(pairs),
        "baseline_update_count": 0,
    }
    report = {"summary": summary, "decisions": decisions, "baseline_updates": []}
    write_json(output_dir / "triage-results.json", report)
    write_json(
        output_dir / "visual-flaky-log.json",
        {
            "timestamp": summary["timestamp"],
            "noise_decisions": [decision for decision in decisions if decision.get("classification") == "noise"],
        },
    )

    # Persistence model: full decisions live only in the run artifact (triage-results.json above);
    # one compact joinable row per decision is appended to the in-repo JSONL ledger; the tuning
    # file holds only small derived state (no unbounded raw-decision history).
    ledger_path = repo_root / config.get("ledger_file", ".github/triage-ledger.jsonl")
    append_ledger_rows(ledger_path, decisions, pr)
    if ledger_path.exists():
        shutil.copy2(ledger_path, output_dir / "triage-ledger.jsonl")

    tuning_path = repo_root / config.get("tuning_file", ".github/triage-tuning.json")
    tuning = load_json(tuning_path, {"schema_version": 1})
    tuning.pop("history", None)  # migrate away from the old unbounded raw-decision history
    tuning["schema_version"] = 1
    tuning["last_updated"] = summary["timestamp"]
    tuning["last_run"] = {
        "outcome": outcome,
        "decision_counts": counts,
        "pair_count": len(pairs),
        "model_calls": 0,
        "issue_interface": True,
    }
    write_json(tuning_path, tuning)
    shutil.copy2(tuning_path, output_dir / "triage-tuning.json")

    github_output = os.getenv("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a", encoding="utf-8") as handle:
            handle.write(f"outcome={outcome}\n")
            handle.write("model_calls=0\n")
            handle.write("baseline_update_count=0\n")

    print(json.dumps(summary, indent=2))
    return 0


def make_fixture_pair(root: Path, name: str, kind: str) -> tuple[Path, Path]:
    before = Image.new("RGB", (320, 200), "white")
    after = Image.new("RGB", (320, 200), "white")
    draw_before = ImageDraw.Draw(before)
    draw_after = ImageDraw.Draw(after)
    draw_before.rectangle((40, 60, 280, 130), outline="black", width=2)
    draw_before.text((58, 85), "KubeStellar Console", fill="black")
    draw_after.rectangle((40, 60, 280, 130), outline="black", width=2)
    draw_after.text((58, 85), "KubeStellar Console", fill="black")
    if kind == "noise":
        draw_after.point((12, 12), fill=(230, 230, 230))
    elif kind == "regression":
        draw_after.rectangle((40, 60, 280, 130), fill="white", outline="black", width=2)
        draw_after.text((58, 120), "KubeStellar Console", fill="black")
        draw_after.rectangle((50, 85, 260, 105), fill="red")
    elif kind == "intentional":
        draw_after.rectangle((40, 60, 280, 130), fill=(235, 245, 255), outline="blue", width=2)
        draw_after.text((58, 85), "KubeStellar Console", fill="blue")
    before_path = root / f"{name}-expected.png"
    after_path = root / f"{name}-actual.png"
    before.save(before_path)
    after.save(after_path)
    return before_path, after_path


def self_test(args: argparse.Namespace) -> int:
    with tempfile.TemporaryDirectory() as temp_dir_name:
        temp_dir = Path(temp_dir_name)
        repo = temp_dir / "repo"
        results = repo / "web/e2e/test-results/app-visual/fixtures"
        snapshots = repo / "web/e2e/visual/app-fixture.spec.ts-snapshots"
        results.mkdir(parents=True)
        snapshots.mkdir(parents=True)
        (repo / ".github").mkdir(parents=True)
        config_path = repo / ".github/visual-triage-config.json"
        config = load_json(Path(args.config), {})
        config["tuning_file"] = ".github/triage-tuning.json"
        write_json(config_path, config)
        expected = {"noise": "noise", "intentional": AGENT_TRIAGE_CLASSIFICATION, "regression": AGENT_TRIAGE_CLASSIFICATION}
        for kind in expected:
            before_path, after_path = make_fixture_pair(results, kind, kind)
            shutil.copy2(before_path, snapshots / before_path.name)
        report_path = repo / "web/e2e/test-results/app-visual-results/results.json"
        write_json(report_path, {"suites": []})
        changed_files = repo / "changed-files.txt"
        changed_files.write_text("web/src/components/DemoCard.tsx\n", encoding="utf-8")
        output = repo / "web/e2e/test-results/visual-triage"
        triage_args = argparse.Namespace(
            repo_root=str(repo),
            config=str(config_path),
            playwright_results=str(report_path),
            test_results_dir=str(repo / "web/e2e/test-results/app-visual"),
            snapshots_root=str(repo / "web/e2e/visual"),
            output_dir=str(output),
            changed_files=str(changed_files),
            pr_title="visual triage self-test",
            pr_number="self-test",
        )
        triage(triage_args)
        result = load_json(output / "triage-results.json", {})
        correct = 0
        rows = []
        for decision in result.get("decisions", []):
            name = Path(decision.get("actual_path", "")).name.split("-actual", 1)[0]
            expected_class = expected.get(name)
            actual_class = decision.get("classification")
            ok = actual_class == expected_class
            correct += int(ok)
            rows.append({"fixture": name, "expected": expected_class, "actual": actual_class, "ok": ok})
        accuracy = correct / len(rows) if rows else 0
        summary = {"accuracy": accuracy, "correct": correct, "total": len(rows), "rows": rows}
        print(json.dumps(summary, indent=2))
        return 0 if accuracy >= 1.0 else 1


def ingest_verdict(args: argparse.Namespace) -> int:
    """Record a human/resolution verdict against a prior decision, joined by decision_id.

    This is how ground truth enters the loop: the close workflow (or a maintainer label) calls
    this with how a failure was actually resolved, so accuracy can later be measured.
    """
    if args.outcome not in VALID_OUTCOMES:
        raise SystemExit(f"invalid --outcome: {args.outcome!r} (expected one of {sorted(VALID_OUTCOMES)})")
    ledger_path = Path(args.ledger)
    if not ledger_path.exists():
        print(f"::warning::ledger not found: {ledger_path}")
        return 0
    rows = [json.loads(line) for line in ledger_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    verdict_ts = args.verdict_ts or utc_now()
    updated = 0
    for row in rows:
        if row.get("decision_id") == args.decision_id:
            row["human_outcome"] = args.outcome
            row["verdict_source"] = args.source
            row["verdict_ts"] = verdict_ts
            updated += 1
    with ledger_path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, sort_keys=False) + "\n")
    if updated == 0:
        print(f"::warning::no ledger row matched decision_id {args.decision_id}")
    print(json.dumps({"decision_id": args.decision_id, "outcome": args.outcome, "rows_updated": updated}))
    return 0


METRIC_LABELS = ("regression", "intended_change", "noise")


def compute_metrics(
    rows: list[dict[str, Any]],
    target_handoff_precision: float,
    min_samples: int,
) -> dict[str, Any]:
    """Measure whether the issue handoff signal helped the downstream agent.

    CI only predicts either `agent_triage_required` or `noise`. Rows resolved as regression or
    intended_change are useful handoffs; rows resolved as noise are unnecessary handoffs. The learning
    loop therefore tracks handoff precision and missed handoffs instead of model confidence cutoffs.
    """
    labeled = [r for r in rows if r.get("human_outcome") in METRIC_LABELS and r.get("predicted") in PREDICTION_LABELS]
    confusion = {p: {a: 0 for a in METRIC_LABELS} for p in PREDICTION_LABELS}
    for r in labeled:
        confusion[r["predicted"]][r["human_outcome"]] += 1
    handoff_rows = [r for r in labeled if r.get("predicted") == AGENT_TRIAGE_CLASSIFICATION]
    noise_rows = [r for r in labeled if r.get("predicted") == "noise"]
    useful_handoffs = sum(1 for r in handoff_rows if r.get("human_outcome") in {"regression", "intended_change"})
    false_handoffs = sum(1 for r in handoff_rows if r.get("human_outcome") == "noise")
    missed_handoffs = sum(1 for r in noise_rows if r.get("human_outcome") in {"regression", "intended_change"})
    handoff_precision = useful_handoffs / len(handoff_rows) if handoff_rows else None
    noise_precision = sum(1 for r in noise_rows if r.get("human_outcome") == "noise") / len(noise_rows) if noise_rows else None
    resolution_mix = {label: sum(1 for r in labeled if r.get("human_outcome") == label) for label in METRIC_LABELS}
    return {
        "sample_size": len(labeled),
        "confusion_matrix": confusion,
        "handoff_precision": handoff_precision,
        "noise_precision": noise_precision,
        "agent_handoff_count": len(handoff_rows),
        "useful_handoffs": useful_handoffs,
        "false_handoffs": false_handoffs,
        "missed_handoffs": missed_handoffs,
        "resolution_mix": resolution_mix,
        "target_handoff_precision": target_handoff_precision,
        "min_samples": min_samples,
        "enough_samples": len(labeled) >= min_samples,
    }


def _fmt(value: Any) -> str:
    if value is None:
        return "n/a"
    return f"{value:.3f}" if isinstance(value, float) else str(value)


def render_metrics_markdown(report: dict[str, Any]) -> str:
    enough = report["enough_samples"]
    sample_note = "enough for trend reporting" if enough else f"need >= {report['min_samples']}"
    lines = [
        "## Visual issue-agent handoff metrics",
        "",
        f"- Samples with verdicts: `{report['sample_size']}` ({sample_note})",
        f"- Agent handoff precision target: `{report['target_handoff_precision']}`",
        f"- Agent handoff precision: `{_fmt(report['handoff_precision'])}`",
        f"- Noise-pass precision: `{_fmt(report['noise_precision'])}`",
        f"- Useful handoffs: `{report['useful_handoffs']}`",
        f"- False handoffs: `{report['false_handoffs']}`",
        f"- Missed handoffs: `{report['missed_handoffs']}`",
        "",
        "| Resolution outcome | Count |",
        "|---|--:|",
    ]
    for label in METRIC_LABELS:
        lines.append(f"| {label} | {report['resolution_mix'][label]} |")
    lines += [
        "",
        "Handoff matrix (rows = CI route, cols = resolved outcome):",
        "",
        "| pred \\ actual | " + " | ".join(METRIC_LABELS) + " |",
        "|---|" + "---|" * len(METRIC_LABELS),
    ]
    for p in PREDICTION_LABELS:
        lines.append(f"| {p} | " + " | ".join(str(report["confusion_matrix"][p][a]) for a in METRIC_LABELS) + " |")
    return "\n".join(lines) + "\n"


def metrics(args: argparse.Namespace) -> int:
    config = load_json(Path(args.config), {})
    thresholds = config.get("thresholds", {})
    target = float(thresholds.get("target_handoff_precision", 0.95))
    min_samples = int(thresholds.get("min_samples", 50))
    ledger_path = Path(args.ledger)
    rows = (
        [json.loads(line) for line in ledger_path.read_text(encoding="utf-8").splitlines() if line.strip()]
        if ledger_path.exists() else []
    )
    report = compute_metrics(rows, target, min_samples)
    report["timestamp"] = utc_now()
    if args.output:
        write_json(Path(args.output), report)
    markdown = render_metrics_markdown(report)
    if args.markdown:
        Path(args.markdown).parent.mkdir(parents=True, exist_ok=True)
        Path(args.markdown).write_text(markdown, encoding="utf-8")
    # Persist aggregate outcome quality once there is enough signal; CI routing stays deterministic.
    if args.tuning_file and report["enough_samples"]:
        tuning_path = Path(args.tuning_file)
        tuning = load_json(tuning_path, {"schema_version": 1})
        tuning["recent_handoff_precision"] = report["handoff_precision"]
        tuning["recent_noise_precision"] = report["noise_precision"]
        tuning["updated_at"] = report["timestamp"]
        tuning["sample_size"] = report["sample_size"]
        write_json(tuning_path, tuning)
    print(markdown)
    return 0


def classify_images(
    before_raw: Image.Image,
    after_raw: Image.Image,
    config: dict[str, Any],
    crop_path: Path,
) -> dict[str, Any]:
    """Classify whether one before/after pair needs an issue-scanning agent.

    This intentionally does not distinguish intended UI changes from regressions. The only CI-side
    decision is whether the diff is small enough to be ignored as noise, or large enough to package
    for the downstream issue agent.
    """
    thresholds = config.get("thresholds", {})
    before, after = ensure_same_size(before_raw, after_raw)
    mask = build_mask(before, after, int(thresholds.get("pixel_channel_threshold", 16)))
    changed_pixels = mask.histogram()[255]
    total_pixels = before.width * before.height
    changed_ratio = changed_pixels / total_pixels if total_pixels else 0
    if changed_pixels == 0 or changed_ratio < float(thresholds.get("noise_changed_area_ratio", 0.001)):
        return {"classification": "noise", "confidence": 1.0, "model_called": False}
    if changed_ratio >= float(thresholds.get("full_page_changed_area_ratio", 0.6)):
        return {"classification": AGENT_TRIAGE_CLASSIFICATION, "confidence": 0.0, "model_called": False}
    bbox = bbox_with_padding(
        mask.getbbox() or (0, 0, before.width, before.height),
        before.width, before.height, int(thresholds.get("crop_padding_px", 16)),
    )
    stitch(before, after, bbox, crop_path)
    return {"classification": AGENT_TRIAGE_CLASSIFICATION, "confidence": 0.0, "model_called": False}


def eval_cases(args: argparse.Namespace) -> int:
    """Run the evidence-packaging pipeline against a curated set and gate on routing accuracy.

    Since semantic judgment is delegated to the issue-scanning agent, this gate only checks that
    noise cases are ignored and non-noise cases are packaged for agent triage.
    """
    config = load_json(Path(args.config), {})
    thresholds = config.get("thresholds", {})
    min_accuracy = float(args.min_accuracy) if args.min_accuracy else float(thresholds.get("eval_min_accuracy", 0.8))
    cases_dir = Path(args.cases_dir)
    case_dirs = sorted(d for d in cases_dir.glob("*") if d.is_dir() and (d / "meta.json").exists())
    if not case_dirs:
        print(f"::warning::no eval cases under {cases_dir}")
        return 0
    rows: list[dict[str, Any]] = []
    correct = 0
    confusion: dict[str, dict[str, int]] = {}
    with tempfile.TemporaryDirectory() as tmp:
        crop_dir = Path(tmp)
        for case in case_dirs:
            meta = load_json(case / "meta.json", {})
            expected_label = meta.get("expected")
            expected = "noise" if expected_label == "noise" else AGENT_TRIAGE_CLASSIFICATION
            try:
                result = classify_images(
                    Image.open(case / "before.png"), Image.open(case / "after.png"),
                    config, crop_dir / f"{case.name}.png",
                )
            except Exception as exc:  # never let one bad case crash the gate
                result = {"classification": f"error:{exc}", "confidence": 0.0}
            predicted = result.get("classification")
            ok = predicted == expected
            correct += int(ok)
            confusion.setdefault(expected, {}).setdefault(predicted, 0)
            confusion[expected][predicted] += 1
            rows.append({"case": case.name, "label": expected_label, "expected": expected, "predicted": predicted,
                         "confidence": result.get("confidence"), "ok": ok})
    total = len(rows)
    accuracy = correct / total if total else 0.0
    summary = {
        "accuracy": round(accuracy, 4), "correct": correct, "total": total,
        "min_accuracy": min_accuracy, "mock": False, "confusion": confusion, "rows": rows,
    }
    if args.output:
        write_json(Path(args.output), summary)
    print(json.dumps(summary, indent=2))
    if accuracy < min_accuracy:
        print(f"::error::Visual triage eval accuracy {accuracy:.3f} < required {min_accuracy}.")
        return 1
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Package Playwright visual diffs for issue-agent handoff.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    triage_parser = subparsers.add_parser("triage")
    triage_parser.add_argument("--repo-root", default=".")
    triage_parser.add_argument("--config", default=".github/visual-triage-config.json")
    triage_parser.add_argument("--playwright-results", default="web/e2e/test-results/app-visual-results/results.json")
    triage_parser.add_argument("--test-results-dir", default="web/e2e/test-results/app-visual")
    triage_parser.add_argument("--snapshots-root", default="web/e2e/visual")
    triage_parser.add_argument("--output-dir", default="web/e2e/test-results/visual-triage")
    triage_parser.add_argument("--changed-files", default="")
    triage_parser.add_argument("--pr-title", default="")
    triage_parser.add_argument("--pr-number", default="")
    triage_parser.set_defaults(func=triage)

    self_test_parser = subparsers.add_parser("self-test")
    self_test_parser.add_argument("--config", default=".github/visual-triage-config.json")
    self_test_parser.set_defaults(func=self_test)

    ingest_parser = subparsers.add_parser("ingest-verdict")
    ingest_parser.add_argument("--ledger", default=".github/triage-ledger.jsonl")
    ingest_parser.add_argument("--decision-id", required=True)
    ingest_parser.add_argument("--outcome", required=True, help="regression | intended_change | noise")
    ingest_parser.add_argument("--source", default="resolution-derived")
    ingest_parser.add_argument("--verdict-ts", default="")
    ingest_parser.set_defaults(func=ingest_verdict)

    metrics_parser = subparsers.add_parser("metrics")
    metrics_parser.add_argument("--config", default=".github/visual-triage-config.json")
    metrics_parser.add_argument("--ledger", default=".github/triage-ledger.jsonl")
    metrics_parser.add_argument("--output", default="", help="path to write triage-metrics.json")
    metrics_parser.add_argument("--markdown", default="", help="path to write the markdown summary")
    metrics_parser.add_argument("--tuning-file", default=".github/triage-tuning.json")
    metrics_parser.set_defaults(func=metrics)

    eval_parser = subparsers.add_parser("eval")
    eval_parser.add_argument("--config", default=".github/visual-triage-config.json")
    eval_parser.add_argument("--cases-dir", default="web/e2e/visual/triage-eval/cases")
    eval_parser.add_argument("--output", default="")
    eval_parser.add_argument("--min-accuracy", default="")
    eval_parser.set_defaults(func=eval_cases)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
