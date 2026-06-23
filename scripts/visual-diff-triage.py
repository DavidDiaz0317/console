#!/usr/bin/env python3
"""Semantic triage for Playwright visual-regression diffs.

The script keeps the existing pixel diff as the first-pass filter, then:
  * resolves tiny diffs as noise without a model call,
  * crops meaningful changed regions from the existing mask,
  * stitches BEFORE/AFTER crops into one image for a VLM,
  * writes routing decisions and a tuning history entry.
"""

from __future__ import annotations

import argparse
import base64
import fnmatch
import json
import os
import shutil
import sys
import tempfile
import time
import urllib.error
import urllib.request
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from PIL import Image, ImageChops, ImageDraw
except ImportError as exc:  # pragma: no cover - exercised in CI setup failures
    raise SystemExit("Pillow is required. Install it with: python -m pip install Pillow") from exc


SYSTEM_PROMPT = """You are a visual regression triage assistant for a Kubernetes dashboard UI. You are shown a
BEFORE and AFTER crop of the region of a UI component that changed in a pull request, plus
context about the PR. Decide whether the visual change is a regression, an intended change, or
noise.

Definitions:
- "regression": the UI is visibly broken or degraded. Examples: text or elements clipped or
  cut off, components overlapping, a dropdown or menu rendered behind other content (z-index),
  layout collapsed or misaligned, an element that disappeared unintentionally, broken spacing.
- "intended_change": the change is a deliberate, coherent UI update consistent with the PR's
  stated purpose, with no broken rendering. Examples: restyled button, adjusted spacing that
  looks intentional and clean, a new label, a color/theme update.
- "noise": no meaningful visual difference. Examples: anti-aliasing differences, a 1px shift,
  animation captured mid-frame, font hinting. If you cannot identify a real visual change,
  this is noise.

Rules:
- Judge only what you can see plus the PR context. Do not assume.
- If the change is in a security- or auth-related component, or you are not confident, set a
  lower confidence so a human reviews it.
- Respond with JSON only, no prose, matching the schema given.
"""


BASELINE_FREE_SYSTEM_PROMPT = """You are inspecting a current UI screenshot for rendering defects. Answer JSON only with
{"has_defect": boolean, "defects": [{"description": string, "severity": "low|medium|high"}], "confidence": number}.
Look only for visible clipping, cut-off content, overlap, z-index problems, or off-screen rendering.
"""


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


def image_to_data_url(path: Path) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].strip()
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end >= start:
        text = text[start : end + 1]
    return json.loads(text)


def call_vlm(config: dict[str, Any], prompt: str, image_path: Path) -> dict[str, Any]:
    model_config = config.get("model", {})
    api_key = os.getenv(model_config.get("api_key_env", "VISUAL_TRIAGE_API_KEY"), "")
    if not api_key:
        raise RuntimeError("visual triage model API key is not configured")
    api_url = os.getenv(model_config.get("api_url_env", "VISUAL_TRIAGE_API_URL"), model_config.get("default_api_url", ""))
    model = os.getenv(model_config.get("model_env", "VISUAL_TRIAGE_MODEL"), model_config.get("default_model", ""))
    body = {
        "model": model,
        "temperature": model_config.get("temperature", 0),
        "max_tokens": model_config.get("max_tokens", 500),
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": image_to_data_url(image_path)}},
                ],
            },
        ],
    }
    request = urllib.request.Request(
        api_url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=float(model_config.get("timeout_seconds", 60))) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"visual triage model call failed: HTTP {exc.code} {exc.read().decode('utf-8', 'ignore')[:500]}") from exc
    content = payload.get("choices", [{}])[0].get("message", {}).get("content", "")
    parsed = extract_json(content)
    classification = parsed.get("classification")
    if classification not in {"regression", "intended_change", "noise"}:
        raise RuntimeError(f"invalid visual triage classification: {classification!r}")
    return {
        "classification": classification,
        "confidence": float(parsed.get("confidence", 0)),
        "reasoning": str(parsed.get("reasoning", ""))[:1000],
        "suspected_component": parsed.get("suspected_component"),
        "severity": parsed.get("severity"),
    }


def mock_model(prompt: str) -> dict[str, Any]:
    text = prompt.lower()
    visual_test = ""
    for line in text.splitlines():
        if line.startswith("visual test:"):
            visual_test = line
            break
    if "regression" in visual_test or "clipping" in visual_test or "z-index" in visual_test:
        return {
            "classification": "regression",
            "confidence": 0.86,
            "reasoning": "The after crop shows a visible broken layout or clipped element.",
            "suspected_component": "visual fixture",
            "severity": "medium",
        }
    if "intentional" in visual_test or "restyle" in visual_test:
        return {
            "classification": "intended_change",
            "confidence": 0.92,
            "reasoning": "The visible change is coherent and matches the PR context for an intentional restyle.",
            "suspected_component": "visual fixture",
            "severity": None,
        }
    if "noise" in visual_test:
        return {
            "classification": "noise",
            "confidence": 0.9,
            "reasoning": "The crop shows no meaningful semantic UI change.",
            "suspected_component": None,
            "severity": None,
        }
    return {
        "classification": "regression",
        "confidence": 0.86,
        "reasoning": "The after crop shows a visible broken layout or clipped element.",
        "suspected_component": "visual fixture",
        "severity": "medium",
    }


def high_risk(changed_files: list[str], config: dict[str, Any]) -> bool:
    patterns = config.get("routing", {}).get("high_risk_globs", [])
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


def route_model_result(result: dict[str, Any], confidence_cutoff: float, is_high_risk: bool) -> str:
    if is_high_risk or float(result.get("confidence", 0)) < confidence_cutoff:
        return "human_review"
    classification = result.get("classification")
    if classification == "regression":
        return "fail"
    if classification in {"intended_change", "noise"}:
        return "pass"
    return "human_review"


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
    auto_update_allowed = os.getenv("VISUAL_TRIAGE_AUTO_UPDATE_ALLOWED", "false").lower() == "true"
    confidence_cutoff = float(thresholds.get("confidence_cutoff", 0.6))
    max_regions = int(thresholds.get("max_regions", 3))

    pairs = discover_pairs(
        results_json=Path(args.playwright_results).resolve(),
        test_results_dir=Path(args.test_results_dir).resolve(),
        snapshots_root=Path(args.snapshots_root).resolve(),
        repo_root=repo_root,
    )

    decisions: list[dict[str, Any]] = []
    baseline_updates: list[dict[str, Any]] = []
    model_calls = 0

    for pair_index, pair in enumerate(pairs, start=1):
        before_raw = Image.open(pair.expected)
        after_raw = Image.open(pair.actual)
        before, after = ensure_same_size(before_raw, after_raw)
        mask = build_mask(before, after, int(thresholds.get("pixel_channel_threshold", 16)))
        changed_pixels = mask.histogram()[255]
        total_pixels = before.width * before.height
        changed_ratio = changed_pixels / total_pixels if total_pixels else 0
        component_name, route = component_from_pair(pair)
        base_decision = {
            "timestamp": utc_now(),
            "pr": pr,
            "test_title": pair.test_title,
            "spec_path": pair.spec_path,
            "component_name": component_name,
            "route": route,
            "expected_path": rel(pair.expected, repo_root),
            "actual_path": rel(pair.actual, repo_root),
            "diff_path": rel(pair.diff, repo_root) if pair.diff else None,
            "baseline_path": rel(pair.baseline_path, repo_root) if pair.baseline_path else None,
            "changed_pixels": changed_pixels,
            "total_pixels": total_pixels,
            "changed_area_ratio": changed_ratio,
            "high_risk": is_high_risk,
            "human_outcome": None,
        }

        if changed_pixels == 0:
            decisions.append({**base_decision, "classification": "noise", "confidence": 1.0, "routing": "pass", "reasoning": "Pixel masks are identical; no semantic triage needed.", "model_called": False, "regions": []})
            continue

        if changed_ratio < float(thresholds.get("noise_changed_area_ratio", 0.001)):
            bbox = bbox_with_padding(mask.getbbox() or (0, 0, before.width, before.height), before.width, before.height, int(thresholds.get("crop_padding_px", 16)))
            crop_path = crop_dir / f"pair-{pair_index}-noise.png"
            stitch(before, after, bbox, crop_path)
            decisions.append({**base_decision, "classification": "noise", "confidence": 1.0, "routing": "pass", "reasoning": "Changed area is below the configured noise threshold; skipped model call.", "model_called": False, "regions": [{"bbox": bbox, "stitched_crop": rel(crop_path, repo_root)}]})
            continue

        if changed_ratio >= float(thresholds.get("full_page_changed_area_ratio", 0.6)):
            full_path = crop_dir / f"pair-{pair_index}-full-page.png"
            stitch_full(before, after, full_path, int(thresholds.get("max_full_image_width", 1200)))
            decisions.append({**base_decision, "classification": "needs_human_review", "confidence": 0.0, "routing": "human_review", "reasoning": "Changed area covers most of the page; this may be a redesign or a crash and requires human review.", "model_called": False, "regions": [{"bbox": [0, 0, before.width, before.height], "stitched_crop": rel(full_path, repo_root), "mode": "downscaled_full_page"}]})
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
            prompt = "\n".join(
                [
                    f"PR title: {pr['title']}",
                    "Changed files:",
                    "\n".join(f"- {file}" for file in changed_files[:80]) or "- Not available",
                    f"Visual test: {pair.test_title}",
                    f"Component / route: {component_name} ({route})",
                    f"Changed region bbox (within the page): {bbox}",
                    region.get("note", ""),
                    "",
                    "[stitched BEFORE | AFTER image attached]",
                    "",
                    "Classify this visual change.",
                    "Return exactly: {\"classification\": \"regression | intended_change | noise\", \"confidence\": 0.0, \"reasoning\": \"...\", \"suspected_component\": \"string or null\", \"severity\": \"low | medium | high | null\"}",
                ]
            )
            try:
                if args.mock_model:
                    result = mock_model(prompt)
                else:
                    result = call_vlm(config, prompt, crop_path)
                model_calls += 1
            except Exception as exc:  # model is last resort; do not guess silently
                result = {
                    "classification": "needs_human_review",
                    "confidence": 0.0,
                    "reasoning": f"Model triage unavailable: {exc}",
                    "suspected_component": None,
                    "severity": None,
                }
            result["bbox"] = list(bbox)
            result["stitched_crop"] = rel(crop_path, repo_root)
            region_results.append(result)

        priority = {"regression": 3, "needs_human_review": 2, "intended_change": 1, "noise": 0}
        primary = sorted(region_results, key=lambda item: (priority.get(item.get("classification"), 2), float(item.get("confidence", 0))), reverse=True)[0]
        routing = route_model_result(primary, confidence_cutoff, is_high_risk)
        if primary.get("classification") == "intended_change" and routing == "pass":
            if not auto_update_allowed:
                routing = "human_review"
                primary["reasoning"] = f"{primary.get('reasoning', '')} Auto-updating baselines is not allowed for this PR source; human review required."
            elif pair.baseline_path:
                baseline_updates.append(
                    {
                        "actual_path": rel(pair.actual, repo_root),
                        "baseline_path": rel(pair.baseline_path, repo_root),
                        "reasoning": primary.get("reasoning", ""),
                        "source_test": pair.test_title,
                    }
                )
            else:
                routing = "human_review"
                primary["reasoning"] = f"{primary.get('reasoning', '')} Could not locate the committed baseline path for auto-update."

        decisions.append({**base_decision, **primary, "routing": routing, "model_called": bool(region_results), "regions": region_results})

    counts: dict[str, int] = {}
    for decision in decisions:
        counts[decision.get("routing", "unknown")] = counts.get(decision.get("routing", "unknown"), 0) + 1
    if any(decision.get("routing") == "fail" for decision in decisions):
        outcome = "fail"
    elif any(decision.get("routing") == "human_review" for decision in decisions):
        outcome = "human_review"
    else:
        outcome = "pass"

    summary = {
        "timestamp": utc_now(),
        "outcome": outcome,
        "model_calls": model_calls,
        "decision_counts": counts,
        "pair_count": len(pairs),
        "baseline_update_count": len(baseline_updates),
    }
    report = {"summary": summary, "decisions": decisions, "baseline_updates": baseline_updates}
    write_json(output_dir / "triage-results.json", report)
    write_json(
        output_dir / "visual-flaky-log.json",
        {
            "timestamp": summary["timestamp"],
            "noise_decisions": [decision for decision in decisions if decision.get("classification") == "noise"],
        },
    )

    tuning_path = repo_root / config.get("tuning_file", ".github/triage-tuning.json")
    tuning = load_json(tuning_path, {"schema_version": 1, "history": []})
    tuning["last_updated"] = summary["timestamp"]
    tuning.setdefault("history", []).extend(decisions)
    write_json(tuning_path, tuning)
    shutil.copy2(tuning_path, output_dir / "triage-tuning.json")

    github_output = os.getenv("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a", encoding="utf-8") as handle:
            handle.write(f"outcome={outcome}\n")
            handle.write(f"model_calls={model_calls}\n")
            handle.write(f"baseline_update_count={len(baseline_updates)}\n")

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
        expected = {"noise": "noise", "intentional": "intended_change", "regression": "regression"}
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
            mock_model=True,
        )
        os.environ["VISUAL_TRIAGE_AUTO_UPDATE_ALLOWED"] = "true"
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


def main() -> int:
    parser = argparse.ArgumentParser(description="Triage Playwright visual diffs semantically.")
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
    triage_parser.add_argument("--mock-model", action="store_true")
    triage_parser.set_defaults(func=triage)

    self_test_parser = subparsers.add_parser("self-test")
    self_test_parser.add_argument("--config", default=".github/visual-triage-config.json")
    self_test_parser.set_defaults(func=self_test)
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
