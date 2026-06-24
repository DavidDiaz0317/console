# UI Failure Schema

## Purpose

This document defines a small, practical schema for UI-related failures in automated workflows.

The goal is not only to detect when the UI changed, but to produce failure output that is:

- easier for humans to scan
- easier for AI agents to reason about
- safer to route into follow-up automation

This is especially important for visual regression and auth-related UI testing, where a diff does **not** automatically mean the product is broken.

## Problem

Traditional UI failure output is usually too raw:

- screenshots and pixel diffs say that something changed, but not whether the change is good or bad
- stack traces are useful for debugging, but poor for triage
- issue creation workflows often treat every failure as a bug

In practice, UI changes fall into at least three buckets:

- intentional product changes
- true regressions
- uncertain cases that require human review

The schema below is designed to capture that distinction.

## Core Schema

Each UI-related failure should ideally expose the following fields:

| Field | Meaning |
|---|---|
| `failure_type` | What kind of failure happened technically |
| `change_assessment` | Whether the change looks intentional, regressive, or uncertain |
| `protected_contract` | What the test was supposed to protect |
| `target_route` | Which route, page, or target the failure affects |
| `suggested_files` | Files most likely related to the failure |
| `suggested_action` | Recommended next step for a human or AI agent |
| `repro_command` | How to reproduce locally |

## Failure Type

Current failure types used in workflows:

- `visual mismatch`
- `missing or wrong ui state`
- `environment/setup failure`

These are intentionally simple. They describe the technical shape of the failure before deciding whether the product behavior is acceptable.

## Change Assessment

Current change assessment categories:

- `likely intentional ui change`
- `likely regression`
- `needs human review`

This field answers a different question from `failure_type`.

Example:

- `visual mismatch` can still be a `likely intentional ui change`
- `visual mismatch` can also be a `likely regression`
- `environment/setup failure` is usually `needs human review`

## Suggested Action

Suggested action should be derived from `change_assessment`.

Examples:

- `likely intentional ui change`
  - Review the diff and update baselines only if the product change is expected.
- `likely regression`
  - Treat as a regression first and inspect suggested files before updating baselines.
- `needs human review`
  - Review logs, artifacts, and PR context before deciding whether to update tests or fix code.

## Current Heuristic

The current implementation uses a conservative heuristic:

- if the failure is an environment or setup problem, classify it as `needs human review`
- if the failure shows missing elements or wrong UI state, classify it as `likely regression`
- if the failure is a screenshot diff and the PR changed relevant UI files, classify it as `likely intentional ui change`
- otherwise, classify it as `likely regression`

This heuristic is intentionally conservative:

- it does **not** assume every screenshot diff is bad
- it does **not** automatically route uncertain failures into AI auto-fix
- it keeps a human review checkpoint where semantic intent is unclear

## Why This Matters

This schema moves the workflow from:

- detect failure
- dump logs
- open issue

to:

- detect failure
- classify technical failure type
- estimate whether the change is intentional or regressive
- recommend the next action
- produce a more useful issue for humans and AI agents

## Current Adoption

This schema is currently reflected in:

- `.github/workflows/auth-drift-failure-issue.yml`
- `.github/workflows/visual-regression-failure-issue.yml`

Both workflows now emit structured failure summaries with:

- `failure_type`
- `change_assessment`
- `protected_contract`
- `suggested_files`
- `suggested_action`

## Next Possible Improvements

- move shared classification logic into a reusable script instead of duplicating it in multiple workflows
- add confidence scores for `change_assessment`
- include PR intent signals from labels, titles, or changed file clusters
- distinguish layout-only changes from semantic UI regressions
- experiment with agent-facing JSON summaries in addition to markdown issue bodies
