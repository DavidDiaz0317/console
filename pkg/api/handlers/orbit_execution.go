package handlers

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode"

	"github.com/kubestellar/console/pkg/mcp"
)

const (
	orbitMissionStepTimeout       = 30 * time.Second
	orbitExecutionTimePrecision   = 100 * time.Millisecond
	orbitDefaultToolResultLimit   = 20
	orbitMaxExecutionSummaryChars = 240
)

// MissionExecutor provides the MCP operations Orbit uses to run mission steps.
type MissionExecutor interface {
	GetOpsTools() []mcp.Tool
	CallOpsTool(ctx context.Context, name string, args map[string]interface{}) (*mcp.CallToolResult, error)
}

type orbitMissionExecution struct {
	MissionID     string `json:"missionId,omitempty"`
	RunAt         string `json:"runAt,omitempty"`
	Result        string `json:"result"`
	Summary       string `json:"summary"`
	ExecutionTime string `json:"executionTime"`
}

type orbitToolInvocation struct {
	tool     mcp.Tool
	args     map[string]interface{}
	clusters []string
}

func (h *OrbitHandler) executeMission(ctx context.Context, mission *OrbitMission) (execution orbitMissionExecution) {
	startedAt := time.Now()
	execution = orbitMissionExecution{
		Result:  "skipped",
		Summary: "No executor configured",
	}
	defer func() {
		execution.ExecutionTime = time.Since(startedAt).Round(orbitExecutionTimePrecision).String()
	}()

	if mission == nil {
		execution.Result = "failed"
		execution.Summary = "Orbit mission failed: mission not found"
		return execution
	}
	if len(mission.Steps) == 0 {
		execution.Summary = fmt.Sprintf("Orbit mission %q skipped: no steps defined", orbitMissionLabel(mission))
		return execution
	}
	if h.executor == nil {
		return execution
	}

	availableTools := h.executor.GetOpsTools()
	if len(availableTools) == 0 {
		execution.Result = "failed"
		execution.Summary = fmt.Sprintf("Orbit mission %q failed: executor has no available ops tools", orbitMissionLabel(mission))
		return execution
	}

	stepSummaries := make([]string, 0, len(mission.Steps))
	for idx, step := range mission.Steps {
		invocation, err := orbitResolveStepInvocation(mission, step, availableTools)
		if err != nil {
			execution.Result = "failed"
			execution.Summary = fmt.Sprintf("Step %d/%d %q failed: %v", idx+1, len(mission.Steps), orbitStepLabel(step), err)
			return execution
		}

		stepSummary, err := h.executeMissionStep(ctx, invocation)
		if err != nil {
			execution.Result = "failed"
			execution.Summary = fmt.Sprintf("Step %d/%d %q failed via %s: %v", idx+1, len(mission.Steps), orbitStepLabel(step), invocation.tool.Name, err)
			return execution
		}
		stepSummaries = append(stepSummaries, fmt.Sprintf("%s (%s)", orbitStepLabel(step), stepSummary))
	}

	execution.Result = "success"
	execution.Summary = fmt.Sprintf("Executed %d/%d orbit steps via MCP", len(mission.Steps), len(mission.Steps))
	if len(stepSummaries) > 0 {
		execution.Summary = orbitCompactSummary(execution.Summary + ": " + strings.Join(stepSummaries, "; "))
	}
	return execution
}

func (h *OrbitHandler) executeMissionStep(ctx context.Context, invocation orbitToolInvocation) (string, error) {
	clusters := invocation.clusters
	if len(clusters) == 0 {
		clusters = []string{""}
	}

	executedTargets := make([]string, 0, len(clusters))
	for _, cluster := range clusters {
		args := orbitCloneArgs(invocation.args)
		if cluster != "" {
			args["cluster"] = cluster
		}

		stepCtx, cancel := context.WithTimeout(ctx, orbitMissionStepTimeout)
		result, err := h.executor.CallOpsTool(stepCtx, invocation.tool.Name, args)
		cancel()
		if err != nil {
			return "", err
		}
		if result.IsError {
			return "", errors.New(orbitToolResultText(result))
		}

		if cluster == "" {
			executedTargets = append(executedTargets, invocation.tool.Name)
			continue
		}
		executedTargets = append(executedTargets, fmt.Sprintf("%s on %s", invocation.tool.Name, cluster))
	}

	return orbitCompactSummary(strings.Join(executedTargets, ", ")), nil
}

func orbitResolveStepInvocation(mission *OrbitMission, step OrbitStep, tools []mcp.Tool) (orbitToolInvocation, error) {
	available := make(map[string]mcp.Tool, len(tools))
	for _, tool := range tools {
		available[tool.Name] = tool
	}

	for _, toolName := range orbitPreferredToolNames(mission, step) {
		tool, ok := available[toolName]
		if !ok {
			continue
		}
		args, clusters, err := orbitBuildToolArgs(tool, mission)
		if err != nil {
			continue
		}
		return orbitToolInvocation{tool: tool, args: args, clusters: clusters}, nil
	}

	matchedTool, args, clusters, ok := orbitFindKeywordMatchedTool(mission, step, tools)
	if ok {
		return orbitToolInvocation{tool: matchedTool, args: args, clusters: clusters}, nil
	}

	return orbitToolInvocation{}, fmt.Errorf("no compatible MCP tool available for step")
}

func orbitFindKeywordMatchedTool(mission *OrbitMission, step OrbitStep, tools []mcp.Tool) (mcp.Tool, map[string]interface{}, []string, bool) {
	keywords := orbitStepKeywords(mission, step)
	bestScore := 0
	var bestTool mcp.Tool
	var bestArgs map[string]interface{}
	var bestClusters []string
	for _, tool := range tools {
		args, clusters, err := orbitBuildToolArgs(tool, mission)
		if err != nil {
			continue
		}

		haystack := strings.ToLower(tool.Name + " " + tool.Description)
		score := 0
		for _, keyword := range keywords {
			if strings.Contains(strings.ToLower(tool.Name), keyword) {
				score += 3
			}
			if strings.Contains(haystack, keyword) {
				score++
			}
		}
		if score > bestScore {
			bestScore = score
			bestTool = tool
			bestArgs = args
			bestClusters = clusters
		}
	}

	if bestScore == 0 {
		return mcp.Tool{}, nil, nil, false
	}
	return bestTool, bestArgs, bestClusters, true
}

func orbitPreferredToolNames(mission *OrbitMission, step OrbitStep) []string {
	stepText := strings.ToLower(strings.Join([]string{mission.OrbitType, step.Title, step.Description}, " "))
	names := make([]string, 0, 8)

	switch mission.OrbitType {
	case "health-check":
		names = append(names, "find_pod_issues", "get_cluster_health", "check_resource_limits")
	case "cert-rotation":
		names = append(names, "check_security_issues", "get_warning_events", "get_events")
	case "version-drift":
		names = append(names, "check_helm_release_upgrades", "get_cluster_version_info", "get_upgrade_prerequisites")
	case "resource-quota":
		names = append(names, "check_resource_limits", "get_cluster_health")
	case "backup-verification":
		names = append(names, "get_events", "get_warning_events")
	}

	if orbitContainsAny(stepText, "pod", "restart") {
		names = append(names, "find_pod_issues", "get_pods", "get_cluster_health")
	}
	if orbitContainsAny(stepText, "service", "endpoint", "reachable") {
		names = append(names, "get_services", "get_cluster_health", "get_events")
	}
	if orbitContainsAny(stepText, "resource", "cpu", "memory", "quota", "utilization", "limit") {
		names = append(names, "check_resource_limits", "get_cluster_health", "get_nodes")
	}
	if orbitContainsAny(stepText, "security", "privileged") {
		names = append(names, "check_security_issues")
	}
	if orbitContainsAny(stepText, "event", "warning") {
		names = append(names, "get_warning_events", "get_events")
	}
	if orbitContainsAny(stepText, "deployment") {
		names = append(names, "find_deployment_issues", "get_deployments")
	}
	if orbitContainsAny(stepText, "version", "upgrade", "drift", "helm", "image") {
		names = append(names, "check_helm_release_upgrades", "get_cluster_version_info", "get_upgrade_prerequisites")
	}
	if orbitContainsAny(stepText, "backup", "cronjob", "job") {
		names = append(names, "get_events", "get_warning_events")
	}
	if orbitContainsAny(stepText, "cluster", "health") {
		names = append(names, "get_cluster_health", "detect_cluster_type")
	}

	return orbitUniqueStrings(names)
}

func orbitBuildToolArgs(tool mcp.Tool, mission *OrbitMission) (map[string]interface{}, []string, error) {
	args := make(map[string]interface{})
	clusters := []string{""}
	if _, ok := tool.InputSchema.Properties["source"]; ok {
		args["source"] = "all"
	}
	if _, ok := tool.InputSchema.Properties["limit"]; ok {
		args["limit"] = orbitDefaultToolResultLimit
	}
	if _, ok := tool.InputSchema.Properties["cluster"]; ok && len(mission.Clusters) > 0 {
		clusters = orbitUniqueStrings(mission.Clusters)
	}

	for _, required := range tool.InputSchema.Required {
		switch required {
		case "cluster":
			if len(mission.Clusters) == 0 {
				return nil, nil, fmt.Errorf("tool %q requires a cluster but mission has none configured", tool.Name)
			}
			clusters = orbitUniqueStrings(mission.Clusters)
		case "source":
			args["source"] = "all"
		case "limit":
			args["limit"] = orbitDefaultToolResultLimit
		default:
			return nil, nil, fmt.Errorf("tool %q requires unsupported argument %q", tool.Name, required)
		}
	}

	return args, clusters, nil
}

func orbitToolResultText(result *mcp.CallToolResult) string {
	if result == nil {
		return "tool returned no result"
	}
	parts := make([]string, 0, len(result.Content))
	for _, content := range result.Content {
		text := strings.TrimSpace(content.Text)
		if text != "" {
			parts = append(parts, text)
		}
	}
	if len(parts) == 0 {
		if result.IsError {
			return "tool returned an error"
		}
		return "tool completed without output"
	}
	return orbitCompactSummary(strings.Join(parts, " "))
}

func orbitStepKeywords(mission *OrbitMission, step OrbitStep) []string {
	fields := strings.FieldsFunc(strings.ToLower(strings.Join([]string{mission.OrbitType, step.Title, step.Description}, " ")), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
	keywords := make([]string, 0, len(fields))
	for _, field := range fields {
		if len(field) < 3 {
			continue
		}
		switch field {
		case "check", "with", "that", "this", "from", "into", "than", "their", "there", "verify", "ensure", "within", "across", "orbit":
			continue
		default:
			keywords = append(keywords, field)
		}
	}
	return orbitUniqueStrings(keywords)
}

func orbitMissionLabel(mission *OrbitMission) string {
	if mission == nil {
		return ""
	}
	if mission.Title != "" {
		return mission.Title
	}
	return mission.ID
}

func orbitStepLabel(step OrbitStep) string {
	if strings.TrimSpace(step.Title) != "" {
		return step.Title
	}
	return step.Description
}

func orbitCompactSummary(summary string) string {
	summary = strings.TrimSpace(summary)
	if len(summary) <= orbitMaxExecutionSummaryChars {
		return summary
	}
	return strings.TrimSpace(summary[:orbitMaxExecutionSummaryChars-3]) + "..."
}

func orbitCloneArgs(args map[string]interface{}) map[string]interface{} {
	cloned := make(map[string]interface{}, len(args))
	for key, value := range args {
		cloned[key] = value
	}
	return cloned
}

func orbitContainsAny(value string, keywords ...string) bool {
	for _, keyword := range keywords {
		if strings.Contains(value, keyword) {
			return true
		}
	}
	return false
}

func orbitUniqueStrings(values []string) []string {
	unique := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		unique = append(unique, trimmed)
	}
	return unique
}
