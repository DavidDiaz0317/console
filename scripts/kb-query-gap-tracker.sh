#!/usr/bin/env bash
# KB Query Gap Tracker
# Identifies common user queries that return poor or no results from the knowledge base.
# Usage: ./scripts/kb-query-gap-tracker.sh [--output report.md]
set -euo pipefail

OUTPUT="${1:-kb-gap-report.md}"
KB_REPO="kubestellar/console-kb"
CONSOLE_REPO="kubestellar/console"

echo "# KB Query Gap Report" > "$OUTPUT"
echo "" >> "$OUTPUT"
echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# 1. Check mission coverage - which CNCF projects have install missions?
echo "## Mission Coverage" >> "$OUTPUT"
echo "" >> "$OUTPUT"

MISSIONS_COUNT=$(gh api "repos/$KB_REPO/contents/missions" --jq 'length' 2>/dev/null || echo "0")
echo "Total missions in console-kb: $MISSIONS_COUNT" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# 2. Check for common operation types
echo "## Operation Type Coverage" >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "| Operation | Missions Available |" >> "$OUTPUT"
echo "|-----------|-------------------|" >> "$OUTPUT"

for op in install upgrade rollback troubleshoot monitor backup restore; do
  count=$(gh api "repos/$KB_REPO/git/trees/main?recursive=1" --jq "[.tree[].path | select(test(\"$op\"))] | length" 2>/dev/null || echo "0")
  echo "| $op | $count |" >> "$OUTPUT"
done
echo "" >> "$OUTPUT"

# 3. Identify potential gaps
echo "## Potential Gaps" >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "Common Kubernetes operations without dedicated missions:" >> "$OUTPUT"
echo "" >> "$OUTPUT"

COMMON_OPS=("disaster-recovery" "certificate-rotation" "etcd-backup" "node-drain" "cluster-upgrade" "storage-migration" "network-policy" "rbac-audit")
CRITICAL_COUNT=0
for op in "${COMMON_OPS[@]}"; do
  exists=$(gh api "repos/$KB_REPO/git/trees/main?recursive=1" --jq "[.tree[].path | select(test(\"$op\"))] | length" 2>/dev/null || echo "0")
  if [ "$exists" = "0" ]; then
    echo "- ❌ $op — no mission found" >> "$OUTPUT"
    CRITICAL_COUNT=$((CRITICAL_COUNT + 1))
  else
    echo "- ✅ $op — $exists file(s)" >> "$OUTPUT"
  fi
done

echo "" >> "$OUTPUT"
echo "## Recommendations" >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "1. Prioritize creating missions for operations marked ❌ above" >> "$OUTPUT"
echo "2. Add troubleshooting guides for top-5 user-reported issues" >> "$OUTPUT"
echo "3. Validate all existing install missions against latest CNCF project versions" >> "$OUTPUT"

echo ""
echo "Report written to: $OUTPUT"
echo "CRITICAL_GAPS=$CRITICAL_COUNT"

if [ "$CRITICAL_COUNT" -gt 0 ]; then
  exit 1
fi

# 4. Preflight error KB coverage
# Cross-references every PreflightErrorCode from preflightCheck.ts against
# console-kb mission paths to find which error remediation paths have no KB coverage.
echo "" >> "$OUTPUT"
echo "## Preflight Error KB Coverage" >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "Maps each \`PreflightErrorCode\` from \`preflightCheck.ts\` to KB mission coverage." >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "| Error Code | Search Terms | Missions Found |" >> "$OUTPUT"
echo "|------------|-------------|----------------|" >> "$OUTPUT"

# Defined in explicit order so report output is stable across runs.
# Each entry is "ERROR_CODE:search terms" — terms are OR-joined into a jq regex.
# 7 additional gh API calls; well within the 5000/hr token rate limit.
PREFLIGHT_ENTRIES=(
  "MISSING_CREDENTIALS:kubeconfig credentials setup"
  "EXPIRED_CREDENTIALS:certificate rotation renewal"
  "RBAC_DENIED:rbac permissions rolebinding clusterrole"
  "CONTEXT_NOT_FOUND:kubeconfig context cluster"
  "CLUSTER_UNREACHABLE:cluster connectivity network troubleshoot"
  "MISSING_TOOLS:kubectl helm tool prerequisites install"
  "UNKNOWN_EXECUTION_FAILURE:troubleshoot debug error recovery"
)

PREFLIGHT_UNCOVERED=0
for entry in "${PREFLIGHT_ENTRIES[@]}"; do
  code="${entry%%:*}"
  terms="${entry#*:}"
  jq_pattern=$(echo "$terms" | tr ' ' '|')
  count=$(gh api "repos/$KB_REPO/git/trees/main?recursive=1" \
    --jq "[.tree[].path | select(test(\"${jq_pattern}\"; \"i\"))] | length" \
    2>/dev/null || echo "0")
  if [ "$count" = "0" ]; then
    echo "| \`$code\` | $terms | ❌ none |" >> "$OUTPUT"
    PREFLIGHT_UNCOVERED=$((PREFLIGHT_UNCOVERED + 1))
  else
    echo "| \`$code\` | $terms | ✅ $count |" >> "$OUTPUT"
  fi
done

echo "" >> "$OUTPUT"
if [ "$PREFLIGHT_UNCOVERED" -gt 0 ]; then
  echo "⚠️  **$PREFLIGHT_UNCOVERED preflight error code(s) have no KB coverage.**" >> "$OUTPUT"
fi

echo "PREFLIGHT_UNCOVERED=$PREFLIGHT_UNCOVERED"
