package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/agent"
	"github.com/kubestellar/console/pkg/api/audit"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/safego"
	"golang.org/x/sync/errgroup"
	"k8s.io/apimachinery/pkg/labels"
)

// ClusterGroupQuery defines how dynamic groups select clusters
type ClusterGroupQuery struct {
	LabelSelector string          `json:"labelSelector,omitempty"` // k8s label selector syntax
	Filters       []ClusterFilter `json:"filters,omitempty"`       // resource-based conditions (AND logic)
}

// ClusterGroup represents a user-defined group of clusters (static or dynamic)
type ClusterGroup struct {
	Name          string             `json:"name"`
	Kind          string             `json:"kind"`     // "static" or "dynamic"
	Clusters      []string           `json:"clusters"` // static: user-selected; dynamic: last evaluation result
	Color         string             `json:"color,omitempty"`
	Icon          string             `json:"icon,omitempty"`
	Query         *ClusterGroupQuery `json:"query,omitempty"`         // only for dynamic groups
	LastEvaluated string             `json:"lastEvaluated,omitempty"` // RFC3339 timestamp
	BuiltIn       bool               `json:"builtIn,omitempty"`       // true for system-provided groups
}

const allHealthyClustersGroupName = "all-healthy-clusters"

// In-memory cluster group store (persisted via frontend localStorage; backend is source of truth for labels)
// validLabelValue matches Kubernetes label values: alphanumeric, '-', '_', '.'
// up to 63 characters. Used to prevent label selector injection (#7004).
var validLabelValue = regexp.MustCompile(`^[a-zA-Z0-9]([a-zA-Z0-9._-]{0,61}[a-zA-Z0-9])?$`)

var (
	clusterGroups   = make(map[string]ClusterGroup)
	clusterGroupsMu sync.RWMutex
)

// LoadPersistedClusterGroups reloads cluster group definitions from the store
// into the in-memory map on startup so they survive server restarts (#7013).
func (h *WorkloadHandlers) LoadPersistedClusterGroups() {
	if h.store == nil {
		return
	}
	persisted, err := h.store.ListClusterGroups(context.Background())
	if err != nil {
		slog.Error("[Workloads] failed to load persisted cluster groups", "error", err)
		return
	}
	clusterGroupsMu.Lock()
	defer clusterGroupsMu.Unlock()
	for name, data := range persisted {
		var g ClusterGroup
		if err := json.Unmarshal(data, &g); err != nil {
			slog.Error("[Workloads] failed to unmarshal persisted cluster group", "name", name, "error", err)
			continue
		}
		clusterGroups[name] = g
	}
	slog.Info("[Workloads] loaded persisted cluster groups", "count", len(persisted))
}

// StartCacheRefresh launches a background goroutine that periodically reloads
// cluster groups from the persistent store. In multi-instance deployments this
// ensures each backend converges on the same state within
// clusterGroupRefreshInterval (#10007).
func (h *WorkloadHandlers) StartCacheRefresh() {
	if h.store == nil {
		return
	}
	safego.GoWith("workload-cache-refresh", func() {
		ticker := time.NewTicker(clusterGroupRefreshInterval)
		defer ticker.Stop()
		for {
			select {
			case <-h.stopCh:
				return
			case <-ticker.C:
				h.LoadPersistedClusterGroups()
			}
		}
	})
	slog.Info("[Workloads] started periodic cluster group cache refresh",
		"interval", clusterGroupRefreshInterval)
}

// StopCacheRefresh signals the background refresh goroutine to exit.
func (h *WorkloadHandlers) StopCacheRefresh() {
	h.stopOnce.Do(func() {
		close(h.stopCh)
		slog.Info("[Workloads] stopped periodic cluster group cache refresh")
	})
}

// persistClusterGroup saves a cluster group to the store for durability (#7013).
func (h *WorkloadHandlers) persistClusterGroup(ctx context.Context, name string, g ClusterGroup) {
	if h.store == nil {
		return
	}
	data, err := json.Marshal(g)
	if err != nil {
		slog.Error("[Workloads] failed to marshal cluster group for persistence", "name", name, "error", err)
		return
	}
	if err := h.store.SaveClusterGroup(ctx, name, data); err != nil {
		slog.Error("[Workloads] failed to persist cluster group", "name", name, "error", err)
	}
}

// deletePersistedClusterGroup removes a cluster group from the store (#7013).
func (h *WorkloadHandlers) deletePersistedClusterGroup(ctx context.Context, name string) {
	if h.store == nil {
		return
	}
	if err := h.store.DeleteClusterGroup(ctx, name); err != nil {
		slog.Error("[Workloads] failed to delete persisted cluster group", "name", name, "error", err)
	}
}

// ListClusterGroups returns all cluster groups
// GET /api/cluster-groups
func (h *WorkloadHandlers) ListClusterGroups(c *fiber.Ctx) error {
	clusterGroupsMu.RLock()
	groups := make([]ClusterGroup, 0, len(clusterGroups)+1)
	for _, g := range clusterGroups {
		groups = append(groups, g)
	}
	clusterGroupsMu.RUnlock()

	// Prepend the built-in "all healthy clusters" group
	builtIn := ClusterGroup{
		Name:    allHealthyClustersGroupName,
		Kind:    "dynamic",
		Color:   "green",
		BuiltIn: true,
		Query: &ClusterGroupQuery{
			Filters: []ClusterFilter{{Field: "healthy", Operator: "eq", Value: "true"}},
		},
	}
	if h.k8sClient != nil {
		ctx, cancel := context.WithTimeout(c.Context(), workloadListTimeout)
		defer cancel()
		if healthyClusters, _, err := h.k8sClient.HealthyClusters(ctx); err == nil {
			names := make([]string, 0, len(healthyClusters))
			for _, cl := range healthyClusters {
				names = append(names, cl.Name)
			}
			builtIn.Clusters = names
			builtIn.LastEvaluated = time.Now().UTC().Format(time.RFC3339)
		}
	}
	if builtIn.Clusters == nil {
		builtIn.Clusters = []string{}
	}
	groups = append([]ClusterGroup{builtIn}, groups...)

	return c.JSON(fiber.Map{"groups": groups})
}

// CreateClusterGroup creates a new cluster group and labels the member clusters
// POST /api/cluster-groups
func (h *WorkloadHandlers) CreateClusterGroup(c *fiber.Ctx) error {
	// Cluster group mutations require console admin (#5974).
	if err := h.requireAdmin(c); err != nil {
		return err
	}

	var group ClusterGroup
	if err := c.BodyParser(&group); err != nil {
		slog.Info("[Workloads] invalid request body", "error", err)
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}
	if group.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name is required"})
	}
	if group.Name == allHealthyClustersGroupName {
		return c.Status(400).JSON(fiber.Map{"error": "cannot create a group with the reserved name"})
	}
	// Dynamic groups may start with no clusters (evaluated on demand)
	if group.Kind != "dynamic" && len(group.Clusters) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "at least one cluster is required"})
	}

	clusterGroupsMu.Lock()
	clusterGroups[group.Name] = group
	clusterGroupsMu.Unlock()

	// Persist to store so the group survives server restarts (#7013).
	h.persistClusterGroup(c.UserContext(), group.Name, group)

	// Label cluster nodes with group membership
	if h.k8sClient != nil {
		ctx, cancel := context.WithTimeout(c.Context(), workloadWriteTimeout)
		defer cancel()

		labelErrors := make([]string, 0)
		for _, cluster := range group.Clusters {
			if err := h.k8sClient.LabelClusterNodes(ctx, cluster, map[string]string{
				"kubestellar.io/group": group.Name,
			}); err != nil {
				slog.Error("[Workloads] failed to label cluster", "cluster", cluster, "error", err)
				labelErrors = append(labelErrors, fmt.Sprintf("cluster %s: operation failed", cluster))
			}
		}
		if len(labelErrors) > 0 {
			return c.Status(207).JSON(fiber.Map{
				"group":    group,
				"warnings": labelErrors,
			})
		}
	}

	audit.Log(c, audit.ActionCreateClusterGroup, "cluster_group", group.Name)

	return c.Status(201).JSON(group)
}

// UpdateClusterGroup updates a cluster group
// PUT /api/cluster-groups/:name
func (h *WorkloadHandlers) UpdateClusterGroup(c *fiber.Ctx) error {
	// Cluster group mutations require console admin (#5974).
	if err := h.requireAdmin(c); err != nil {
		return err
	}

	name := c.Params("name")
	if name == allHealthyClustersGroupName {
		return c.Status(400).JSON(fiber.Map{"error": "cannot modify a built-in group"})
	}

	var group ClusterGroup
	if err := c.BodyParser(&group); err != nil {
		slog.Info("[Workloads] invalid request body", "error", err)
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}
	group.Name = name

	clusterGroupsMu.Lock()
	oldGroup, existed := clusterGroups[name]
	clusterGroups[name] = group
	clusterGroupsMu.Unlock()

	// Persist to store so the group survives server restarts (#7013).
	h.persistClusterGroup(c.UserContext(), name, group)

	// Remove labels from clusters no longer in the group
	if existed && h.k8sClient != nil {
		ctx, cancel := context.WithTimeout(c.Context(), workloadWriteTimeout)
		defer cancel()

		oldSet := make(map[string]bool)
		for _, c := range oldGroup.Clusters {
			oldSet[c] = true
		}
		newSet := make(map[string]bool)
		for _, c := range group.Clusters {
			newSet[c] = true
		}
		labelErrors := make([]string, 0)
		for _, cluster := range oldGroup.Clusters {
			if !newSet[cluster] {
				if err := h.k8sClient.RemoveClusterNodeLabels(ctx, cluster, []string{"kubestellar.io/group"}); err != nil {
					slog.Error("[Workloads] failed to remove label from cluster", "cluster", cluster, "error", err)
					labelErrors = append(labelErrors, fmt.Sprintf("cluster %s: operation failed", cluster))
				}
			}
		}
		for _, cluster := range group.Clusters {
			if !oldSet[cluster] {
				if err := h.k8sClient.LabelClusterNodes(ctx, cluster, map[string]string{
					"kubestellar.io/group": group.Name,
				}); err != nil {
					slog.Error("[Workloads] failed to label cluster", "cluster", cluster, "error", err)
					labelErrors = append(labelErrors, fmt.Sprintf("cluster %s: operation failed", cluster))
				}
			}
		}
		if len(labelErrors) > 0 {
			// Return 207 Multi-Status for partial success, consistent with
			// CreateClusterGroup (#7006).
			return c.Status(207).JSON(fiber.Map{
				"group":    group,
				"warnings": labelErrors,
			})
		}
	}

	audit.Log(c, audit.ActionUpdateClusterGroup, "cluster_group", name)

	return c.JSON(group)
}

// DeleteClusterGroup deletes a cluster group and removes labels
// DELETE /api/cluster-groups/:name
func (h *WorkloadHandlers) DeleteClusterGroup(c *fiber.Ctx) error {
	// Cluster group mutations require console admin (#5974).
	if err := h.requireAdmin(c); err != nil {
		return err
	}

	name := c.Params("name")
	if name == allHealthyClustersGroupName {
		return c.Status(400).JSON(fiber.Map{"error": "cannot delete a built-in group"})
	}

	clusterGroupsMu.Lock()
	group, existed := clusterGroups[name]
	delete(clusterGroups, name)
	clusterGroupsMu.Unlock()

	// Remove from persistent store (#7013).
	h.deletePersistedClusterGroup(c.UserContext(), name)

	// Remove labels from all clusters in the deleted group
	if existed && h.k8sClient != nil {
		ctx, cancel := context.WithTimeout(c.Context(), workloadWriteTimeout)
		defer cancel()

		labelErrors := make([]string, 0)
		for _, cluster := range group.Clusters {
			if err := h.k8sClient.RemoveClusterNodeLabels(ctx, cluster, []string{"kubestellar.io/group"}); err != nil {
				slog.Error("[Workloads] failed to remove label from cluster", "cluster", cluster, "error", err)
				labelErrors = append(labelErrors, fmt.Sprintf("cluster %s: operation failed", cluster))
			}
		}
		if len(labelErrors) > 0 {
			// Return 207 Multi-Status for partial success, consistent with
			// CreateClusterGroup (#7007).
			return c.Status(207).JSON(fiber.Map{
				"message":  "Cluster group deleted with warnings",
				"name":     name,
				"warnings": labelErrors,
			})
		}
	}

	audit.Log(c, audit.ActionDeleteClusterGroup, "cluster_group", name)

	return c.JSON(fiber.Map{"message": "Cluster group deleted", "name": name})
}

// SyncClusterGroups bulk-syncs cluster groups from frontend localStorage
// POST /api/cluster-groups/sync
func (h *WorkloadHandlers) SyncClusterGroups(c *fiber.Ctx) error {
	// Bulk sync overwrites all cluster groups — require console admin (#5974).
	if err := h.requireAdmin(c); err != nil {
		return err
	}

	// Reject oversized payloads (defense-in-depth beyond Fiber's default limit)
	const syncMaxBodyBytes = 1 << 20 // 1 MB
	if len(c.Body()) > syncMaxBodyBytes {
		return fiber.NewError(fiber.StatusRequestEntityTooLarge, "Request body too large")
	}

	groups := make([]ClusterGroup, 0)
	if err := json.Unmarshal(c.Body(), &groups); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	clusterGroupsMu.Lock()
	// Capture old names so we can remove deleted groups from the store.
	oldNames := make(map[string]bool, len(clusterGroups))
	for n := range clusterGroups {
		oldNames[n] = true
	}
	clusterGroups = make(map[string]ClusterGroup)
	for _, g := range groups {
		if g.Name == allHealthyClustersGroupName {
			continue // reserved name cannot be stored
		}
		clusterGroups[g.Name] = g
	}
	// Capture count inside the lock to avoid a data race (#7008).
	syncedCount := len(clusterGroups)
	// Snapshot for persistence outside the lock.
	toSave := make(map[string]ClusterGroup, syncedCount)
	for n, g := range clusterGroups {
		toSave[n] = g
	}
	clusterGroupsMu.Unlock()

	// Persist the new set and remove stale entries (#7013).
	for n, g := range toSave {
		h.persistClusterGroup(c.UserContext(), n, g)
		delete(oldNames, n) // still exists
	}
	for n := range oldNames {
		h.deletePersistedClusterGroup(c.UserContext(), n)
	}

	return c.JSON(fiber.Map{"synced": syncedCount})
}

// EvaluateClusterQuery evaluates a dynamic group query against current cluster state
// POST /api/cluster-groups/evaluate
func (h *WorkloadHandlers) EvaluateClusterQuery(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}

	var query ClusterGroupQuery
	if err := c.BodyParser(&query); err != nil {
		slog.Info("[Workloads] invalid query", "error", err)
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}

	// Validate the label selector up front so we can return a specific
	// 400 Bad Request with the parser's error message instead of silently
	// matching zero clusters and returning a 200 OK with an empty result
	// set (issue #9092). Matching code below may re-parse, but doing it
	// here guarantees we never swallow the parse error.
	if query.LabelSelector != "" {
		if _, selErr := labels.Parse(query.LabelSelector); selErr != nil {
			slog.Info("[Workloads] invalid label selector in cluster query",
				"selector", query.LabelSelector, "error", selErr)
			return c.Status(400).JSON(fiber.Map{
				"error":         "invalid label selector",
				"labelSelector": query.LabelSelector,
			})
		}
	}

	ctx, cancel := context.WithTimeout(c.Context(), workloadListTimeout)
	defer cancel()

	// Deduplicate clusters — multiple kubeconfig contexts can point to the
	// same physical cluster (e.g. "vllm-d" and "default/api-fmaas-vllm-d-…").
	// We only want one result per unique server URL.
	dedupClusters, _, err := h.k8sClient.HealthyClusters(ctx)
	if err != nil {
		slog.Error("[Workloads] failed to list clusters", "error", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
	}
	primaryNames := make(map[string]bool, len(dedupClusters))
	for _, cl := range dedupClusters {
		primaryNames[cl.Name] = true
	}

	// Get all cluster health data and keep only deduplicated entries
	allHealth, err := h.k8sClient.GetAllClusterHealth(ctx)
	if err != nil {
		slog.Error("[Workloads] failed to get cluster health", "error", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
	}
	healthData := make([]k8s.ClusterHealth, 0, len(dedupClusters))
	for _, h := range allHealth {
		if primaryNames[h.Cluster] {
			healthData = append(healthData, h)
		}
	}

	// Fetch nodes in parallel using errgroup instead of sequentially (#7012).
	nodesByCluster := make(map[string][]k8s.NodeInfo)
	needNodes := query.LabelSelector != "" || hasGPUFilter(query.Filters)
	if needNodes {
		var nodesMu sync.Mutex
		g, gctx := errgroup.WithContext(ctx)
		for _, cl := range dedupClusters {
			clName := cl.Name
			g.Go(func() error {
				nodes, err := h.k8sClient.GetNodes(gctx, clName)
				if err != nil {
					// Non-fatal: skip clusters that fail, matching original behavior.
					slog.Warn("[Workloads] failed to get nodes for cluster", "cluster", clName, "error", err)
					return nil
				}
				nodesMu.Lock()
				nodesByCluster[clName] = nodes
				nodesMu.Unlock()
				return nil
			})
		}
		_ = g.Wait() // errors are non-fatal (logged above)
	}

	matching := make([]string, 0, len(healthData))
	for _, health := range healthData {
		if clusterMatchesQuery(health, nodesByCluster[health.Cluster], &query) {
			matching = append(matching, health.Cluster)
		}
	}

	return c.JSON(fiber.Map{
		"clusters":    matching,
		"count":       len(matching),
		"evaluatedAt": time.Now().UTC().Format(time.RFC3339),
	})
}

// clusterMatchesQuery checks if a cluster matches all query conditions
func clusterMatchesQuery(health k8s.ClusterHealth, nodes []k8s.NodeInfo, query *ClusterGroupQuery) bool {
	// Check label selector against node labels
	if query.LabelSelector != "" {
		if !clusterMatchesLabelSelector(nodes, query.LabelSelector) {
			return false
		}
	}

	// Check each filter (AND logic)
	for _, filter := range query.Filters {
		if !clusterMatchesFilter(health, nodes, filter) {
			return false
		}
	}

	return true
}

// clusterMatchesLabelSelector returns true if at least one node matches the selector.
// The EvaluateClusterQuery handler validates the selector up front and returns
// 400 on parse errors (issue #9092); we still log here as a defense-in-depth
// signal in case any future caller feeds an unvalidated selector string.
func clusterMatchesLabelSelector(nodes []k8s.NodeInfo, selectorStr string) bool {
	selector, err := labels.Parse(selectorStr)
	if err != nil {
		slog.Warn("[Workloads] label selector parse failed in matcher (should have been validated upstream)",
			"selector", selectorStr, "error", err)
		return false
	}
	for _, node := range nodes {
		if selector.Matches(labels.Set(node.Labels)) {
			return true
		}
	}
	return false
}

// clusterMatchesFilter checks a single filter condition against cluster health + node data
func clusterMatchesFilter(health k8s.ClusterHealth, nodes []k8s.NodeInfo, f ClusterFilter) bool {
	switch f.Field {
	case "healthy":
		return compareBool(health.Healthy, f.Operator, f.Value)
	case "cpuCores":
		return compareInt(int64(health.CpuCores), f.Operator, f.Value)
	case "memoryGB":
		return compareFloat(health.MemoryGB, f.Operator, f.Value)
	case "nodeCount":
		return compareInt(int64(health.NodeCount), f.Operator, f.Value)
	case "podCount":
		return compareInt(int64(health.PodCount), f.Operator, f.Value)
	case "reachable":
		return compareBool(health.Reachable, f.Operator, f.Value)
	case "gpuCount":
		total := clusterGPUCount(nodes)
		return compareInt(int64(total), f.Operator, f.Value)
	case "gpuType":
		types := clusterGPUTypes(nodes)
		return compareStringSet(types, f.Operator, f.Value)
	default:
		return true // unknown fields pass (don't block)
	}
}

// hasGPUFilter returns true if any filter references GPU fields
func hasGPUFilter(filters []ClusterFilter) bool {
	for _, f := range filters {
		if f.Field == "gpuCount" || f.Field == "gpuType" {
			return true
		}
	}
	return false
}

// clusterGPUCount returns total GPU count across all nodes in a cluster
func clusterGPUCount(nodes []k8s.NodeInfo) int {
	total := 0
	for _, n := range nodes {
		total += n.GPUCount
	}
	return total
}

// clusterGPUTypes returns the set of GPU types across all nodes in a cluster
func clusterGPUTypes(nodes []k8s.NodeInfo) []string {
	seen := make(map[string]bool)
	types := make([]string, 0)
	for _, n := range nodes {
		if n.GPUType != "" && !seen[n.GPUType] {
			seen[n.GPUType] = true
			types = append(types, n.GPUType)
		}
	}
	return types
}

// compareStringSet checks if any string in the set matches the condition
func compareStringSet(actual []string, op, value string) bool {
	valueLower := strings.ToLower(value)
	switch op {
	case "eq", "contains":
		// Any type matches (case-insensitive, substring)
		for _, s := range actual {
			if strings.EqualFold(s, value) || strings.Contains(strings.ToLower(s), valueLower) {
				return true
			}
		}
		return false
	case "neq", "excludes":
		// None of the types match
		for _, s := range actual {
			if strings.EqualFold(s, value) || strings.Contains(strings.ToLower(s), valueLower) {
				return false
			}
		}
		return true
	default:
		return false
	}
}

func compareBool(actual bool, op, value string) bool {
	expected := strings.EqualFold(value, "true")
	switch op {
	case "eq":
		return actual == expected
	case "neq":
		return actual != expected
	default:
		return actual == expected
	}
}

func compareInt(actual int64, op, value string) bool {
	expected, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return false
	}
	switch op {
	case "eq":
		return actual == expected
	case "neq":
		return actual != expected
	case "gt":
		return actual > expected
	case "gte":
		return actual >= expected
	case "lt":
		return actual < expected
	case "lte":
		return actual <= expected
	default:
		return false
	}
}

// floatEpsilon is the tolerance for float equality comparisons (#3722).
const floatEpsilon = 1e-9

func compareFloat(actual float64, op, value string) bool {
	expected, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return false
	}
	switch op {
	case "eq":
		return math.Abs(actual-expected) < floatEpsilon
	case "neq":
		return math.Abs(actual-expected) >= floatEpsilon
	case "gt":
		return actual > expected
	case "gte":
		return actual >= expected || math.Abs(actual-expected) < floatEpsilon
	case "lt":
		return actual < expected && math.Abs(actual-expected) >= floatEpsilon
	case "lte":
		return actual <= expected || math.Abs(actual-expected) < floatEpsilon
	default:
		return false
	}
}

// GenerateClusterQuery uses AI to convert natural language to a structured cluster query
// POST /api/cluster-groups/ai-query
func (h *WorkloadHandlers) GenerateClusterQuery(c *fiber.Ctx) error {
	type AIQueryRequest struct {
		Prompt string `json:"prompt"`
	}

	var req AIQueryRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request"})
	}
	if req.Prompt == "" {
		return c.Status(400).JSON(fiber.Map{"error": "prompt is required"})
	}

	// Build cluster context for the AI
	var clusterContext string
	if h.k8sClient != nil {
		ctx, cancel := context.WithTimeout(c.Context(), workloadPodsTimeout)
		defer cancel()
		healthData, _ := h.k8sClient.GetAllClusterHealth(ctx)
		clusterContext = buildClusterContextForAI(healthData)
	}

	// Get the default AI provider
	registry := agent.GetRegistry()
	provider, err := registry.GetDefault()
	if err != nil {
		slog.Info("[Workloads] no AI provider available", "error", err)
		return c.Status(503).JSON(fiber.Map{"error": "service unavailable"})
	}

	systemPrompt := `You are a Kubernetes cluster query generator. Given a natural language description, generate a structured JSON query for selecting clusters from a multi-cluster environment.

Respond with ONLY valid JSON, no markdown code fences, no explanation. The JSON format:
{
  "suggestedName": "short-kebab-case-group-name",
  "query": {
    "labelSelector": "optional kubernetes label selector string",
    "filters": [
      {"field": "fieldName", "operator": "op", "value": "val"}
    ]
  }
}

Available filter fields and their types:
- healthy (bool) — cluster is reachable and healthy
- reachable (bool) — cluster API server is reachable
- cpuCores (int) — total allocatable CPU cores
- memoryGB (float) — total allocatable memory in GB
- gpuCount (int) — total GPU count across all nodes
- gpuType (string) — GPU product type (e.g., "NVIDIA-A100-SXM4-80GB", "AMD GPU"). Use eq for substring match, neq to exclude.
- nodeCount (int) — number of nodes
- podCount (int) — number of running pods

Operators for numeric/bool: eq, neq, gt, gte, lt, lte
Operators for string: eq (contains/matches), neq (excludes)

Label selectors use standard Kubernetes syntax (e.g., "topology.kubernetes.io/zone in (us-east-1a,us-east-1b)").

If the user's request doesn't need label selectors, omit the labelSelector field. If it doesn't need resource filters, use an empty filters array.

` + clusterContext

	chatReq := &agent.ChatRequest{
		Prompt:       req.Prompt,
		SystemPrompt: systemPrompt,
	}

	// AI chat calls may take longer than standard k8s queries
	aiCtx, aiCancel := context.WithTimeout(c.Context(), workloadWriteTimeout)
	defer aiCancel()

	resp, err := provider.Chat(aiCtx, chatReq)
	if err != nil {
		slog.Error("[Workloads] AI query generation failed", "error", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
	}
	if resp == nil {
		slog.Info("ai query generation returned nil response")
		return c.Status(500).JSON(fiber.Map{"error": "empty response from AI provider"})
	}

	// Try to parse the AI response as structured JSON
	content := strings.TrimSpace(resp.Content)
	// Strip markdown code fences if present
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)

	var result struct {
		SuggestedName string            `json:"suggestedName"`
		Query         ClusterGroupQuery `json:"query"`
	}
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		slog.Info("[Workloads] could not parse AI response as structured query", "error", err)
		return c.JSON(fiber.Map{
			"raw":   resp.Content,
			"error": "could not parse AI response as structured query",
		})
	}

	return c.JSON(fiber.Map{
		"suggestedName": result.SuggestedName,
		"query":         result.Query,
	})
}

func buildClusterContextForAI(healthData []k8s.ClusterHealth) string {
	if len(healthData) == 0 {
		return "No cluster data available."
	}
	var sb strings.Builder
	sb.WriteString("Current clusters in the environment:\n")
	for _, h := range healthData {
		sb.WriteString(fmt.Sprintf("- %s: healthy=%v, reachable=%v, cpuCores=%d, memoryGB=%.1f, nodes=%d, pods=%d\n",
			h.Cluster, h.Healthy, h.Reachable, h.CpuCores, h.MemoryGB, h.NodeCount, h.PodCount))
	}
	return sb.String()
}

// NOTE: DeleteWorkload moved to kc-agent (#7993 Phase 1 PR B).
// The agent (pkg/agent/server_http.go handleDeleteWorkloadHTTP) runs under
// the user's kubeconfig instead of the backend pod SA and calls the same
