package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/mcp"
)

// orbitSuffixBytes is the number of random bytes used to generate a unique
// suffix for orbit mission IDs, producing a 4-character hex string.
const orbitSuffixBytes = 2

// orbitSuffixNanoMask masks the low 16 bits of a nanosecond timestamp so the
// crypto/rand fallback still produces a 4-char hex suffix with variable bits.
const orbitSuffixNanoMask = 0xffff

// generateOrbitSuffix returns a short random hex string for mission ID uniqueness.
func generateOrbitSuffix() string {
	b := make([]byte, orbitSuffixBytes)
	if _, err := rand.Read(b); err != nil {
		// Fallback: derive from nanosecond timestamp if crypto/rand fails.
		// time.Format("0000") would return the literal string "0000" because
		// "0" is not a reference layout token — use Sprintf to get real bits.
		return fmt.Sprintf("%04x", time.Now().UnixNano()&orbitSuffixNanoMask)
	}
	return hex.EncodeToString(b)
}

// ─── Constants ──────────────────────────────────────────────────────

// orbitScheduleCheckIntervalSec is how often (seconds) the background
// scheduler goroutine checks for due missions. The frontend also polls
// /api/orbit/schedule so this is a belt-and-suspenders approach.
const orbitScheduleCheckIntervalSec = 60

// orbitCadenceHours maps cadence names to their interval in hours.
var orbitCadenceHours = map[string]float64{
	"daily":   24,
	"weekly":  168,
	"monthly": 720,
}

// orbitDefaultDataFile is the filename used to persist orbit missions
// inside the console data directory.
const orbitDefaultDataFile = "orbit_missions.json"

// orbitMaxHistoryEntries is the maximum number of run records kept per orbit mission.
const orbitMaxHistoryEntries = 50

const orbitMissionStepTimeout = 30 * time.Second
const orbitExecutionTimePrecision = 100 * time.Millisecond
const orbitDefaultToolResultLimit = 20
const orbitMaxExecutionSummaryChars = 240
const orbitRunMissionNoExecutorSummary = "Orbit mission skipped: no executor configured"
const orbitSchedulerNoExecutorSummary = "Orbit mission skipped: no executor configured"

// ─── Types ──────────────────────────────────────────────────────────

// OrbitMission represents a recurring maintenance mission.
type OrbitMission struct {
	ID            string           `json:"id"`
	Title         string           `json:"title"`
	Description   string           `json:"description"`
	OrbitType     string           `json:"orbitType"`
	Cadence       string           `json:"cadence"`
	AutoRun       bool             `json:"autoRun"`
	Clusters      []string         `json:"clusters"`
	Steps         []OrbitStep      `json:"steps"`
	LastRunAt     *string          `json:"lastRunAt"`
	LastRunResult *string          `json:"lastRunResult"`
	CreatedAt     string           `json:"createdAt"`
	History       []OrbitRunRecord `json:"history"`
}

// OrbitStep is a single step in an orbit mission template.
type OrbitStep struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}

// OrbitRunRecord tracks one execution of an orbit mission.
type OrbitRunRecord struct {
	Timestamp string `json:"timestamp"`
	Result    string `json:"result"`
	Summary   string `json:"summary,omitempty"`
}

// MissionExecutor provides the MCP operations Orbit uses to run mission steps.
type MissionExecutor interface {
	GetOpsTools() []mcp.Tool
	CallOpsTool(ctx context.Context, name string, args map[string]interface{}) (*mcp.CallToolResult, error)
}

type orbitMissionExecution struct {
	Result        string `json:"result"`
	Summary       string `json:"summary"`
	ExecutionTime string `json:"executionTime"`
}

type orbitToolInvocation struct {
	tool     mcp.Tool
	args     map[string]interface{}
	clusters []string
}

// OrbitScheduleEntry describes a mission that is due or upcoming.
type OrbitScheduleEntry struct {
	MissionID string `json:"missionId"`
	Title     string `json:"title"`
	OrbitType string `json:"orbitType"`
	Cadence   string `json:"cadence"`
	AutoRun   bool   `json:"autoRun"`
	IsDue     bool   `json:"isDue"`
	NextRunAt string `json:"nextRunAt"`
}

// ─── Handler ────────────────────────────────────────────────────────

// OrbitHandler manages orbit mission CRUD and schedule queries.
type OrbitHandler struct {
	mu       sync.RWMutex
	missions map[string]*OrbitMission
	dataFile string
	executor MissionExecutor
}

// NewOrbitHandler creates an OrbitHandler, loading any persisted missions
// from disk. dataDir is the console data directory (e.g. "./data").
func NewOrbitHandler(dataDir string, executor MissionExecutor) *OrbitHandler {
	h := &OrbitHandler{
		missions: make(map[string]*OrbitMission),
		dataFile: filepath.Join(dataDir, orbitDefaultDataFile),
		executor: executor,
	}
	h.loadFromDisk()
	return h
}

// RegisterRoutes wires all orbit endpoints onto the given router group.
func (h *OrbitHandler) RegisterRoutes(g fiber.Router) {
	g.Get("/missions", h.ListMissions)
	g.Post("/missions", h.CreateMission)
	g.Post("/missions/:id/run", h.RunMission)
	g.Get("/schedule", h.GetSchedule)
}

// ─── Endpoints ──────────────────────────────────────────────────────

// ListMissions returns all orbit missions.
// GET /api/orbit/missions
func (h *OrbitHandler) ListMissions(c *fiber.Ctx) error {
	h.mu.RLock()
	defer h.mu.RUnlock()

	out := make([]*OrbitMission, 0, len(h.missions))
	for _, m := range h.missions {
		out = append(out, m)
	}
	return c.JSON(fiber.Map{"missions": out})
}

// CreateMission saves a new orbit mission.
// POST /api/orbit/missions
func (h *OrbitHandler) CreateMission(c *fiber.Ctx) error {
	var m OrbitMission
	if err := c.BodyParser(&m); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	// Validate required fields
	if m.OrbitType == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "orbitType is required"})
	}
	if m.Cadence == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cadence is required"})
	}
	if _, ok := orbitCadenceHours[m.Cadence]; !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cadence must be daily, weekly, or monthly"})
	}

	if m.ID == "" {
		// Use millisecond-precision timestamp plus a random suffix to avoid
		// collisions when two missions are created in the same second (#7800).
		m.ID = "orbit-" + time.Now().Format("20060102150405.000") + "-" + generateOrbitSuffix()
	}
	if m.CreatedAt == "" {
		m.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	if m.History == nil {
		m.History = []OrbitRunRecord{}
	}
	if m.Clusters == nil {
		m.Clusters = []string{}
	}

	h.mu.Lock()
	h.missions[m.ID] = &m
	h.mu.Unlock()
	h.saveToDisk()

	return c.Status(fiber.StatusCreated).JSON(m)
}

// RunMission executes an orbit mission right now.
// POST /api/orbit/missions/:id/run
func (h *OrbitHandler) RunMission(c *fiber.Ctx) error {
	id := c.Params("id")

	h.mu.RLock()
	m, ok := h.missions[id]
	if !ok {
		h.mu.RUnlock()
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "mission not found"})
	}
	mission := cloneOrbitMission(m)
	h.mu.RUnlock()

	execution := h.executeMission(c.UserContext(), mission)
	h.recordMissionRun(id, execution)

	return c.JSON(execution)
}

// GetSchedule returns which missions are due based on their cadence.
// GET /api/orbit/schedule
func (h *OrbitHandler) GetSchedule(c *fiber.Ctx) error {
	h.mu.RLock()
	defer h.mu.RUnlock()

	entries := make([]OrbitScheduleEntry, 0)
	now := time.Now().UTC()

	for _, m := range h.missions {
		cadenceHrs, ok := orbitCadenceHours[m.Cadence]
		if !ok {
			continue
		}
		cadenceDuration := time.Duration(cadenceHrs * float64(time.Hour))

		var nextRun time.Time
		var isDue bool
		if m.LastRunAt == nil {
			// Never run — immediately due
			nextRun = now
			isDue = true
		} else {
			lastRun, err := time.Parse(time.RFC3339, *m.LastRunAt)
			if err != nil {
				nextRun = now
				isDue = true
			} else {
				nextRun = lastRun.Add(cadenceDuration)
				isDue = now.After(nextRun) || now.Equal(nextRun)
			}
		}

		entries = append(entries, OrbitScheduleEntry{
			MissionID: m.ID,
			Title:     m.Title,
			OrbitType: m.OrbitType,
			Cadence:   m.Cadence,
			AutoRun:   m.AutoRun,
			IsDue:     isDue,
			NextRunAt: nextRun.UTC().Format(time.RFC3339),
		})
	}

	return c.JSON(fiber.Map{"schedule": entries})
}

// StartScheduler starts a background goroutine that checks for due
// auto-run missions every orbitScheduleCheckIntervalSec seconds and
// marks them as run. The goroutine stops when the provided done channel
// is closed.
func (h *OrbitHandler) StartScheduler(done <-chan struct{}) {
	ticker := time.NewTicker(time.Duration(orbitScheduleCheckIntervalSec) * time.Second)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				h.checkDueMissions()
			}
		}
	}()
}

// checkDueMissions iterates all missions and auto-runs those that are
// due and have autoRun enabled.
func (h *OrbitHandler) checkDueMissions() {
	h.mu.RLock()
	now := time.Now().UTC()
	dueMissionIDs := make([]string, 0)
	dueMissions := make([]*OrbitMission, 0)
	for _, m := range h.missions {
		if !m.AutoRun {
			continue
		}
		cadenceHrs, ok := orbitCadenceHours[m.Cadence]
		if !ok {
			continue
		}
		cadenceDuration := time.Duration(cadenceHrs * float64(time.Hour))

		isDue := false
		if m.LastRunAt == nil {
			isDue = true
		} else {
			lastRun, err := time.Parse(time.RFC3339, *m.LastRunAt)
			if err != nil {
				isDue = true
			} else {
				isDue = now.After(lastRun.Add(cadenceDuration))
			}
		}

		if isDue {
			dueMissionIDs = append(dueMissionIDs, m.ID)
			dueMissions = append(dueMissions, cloneOrbitMission(m))
		}
	}
	h.mu.RUnlock()

	for idx, mission := range dueMissions {
		execution := h.executeMission(context.Background(), mission)
		h.recordMissionRun(dueMissionIDs[idx], execution)
		slog.Info("orbit auto-run triggered", "mission", mission.ID, "type", mission.OrbitType, "result", execution.Result, "summary", execution.Summary, "executionTime", execution.ExecutionTime)
	}
}

func (h *OrbitHandler) executeMission(ctx context.Context, mission *OrbitMission) orbitMissionExecution {
	startedAt := time.Now()
	execution := orbitMissionExecution{
		Result:  "skipped",
		Summary: orbitRunMissionNoExecutorSummary,
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
		execution.Summary = fmt.Sprintf("Orbit mission %q skipped: MCP executor has no available ops tools", orbitMissionLabel(mission))
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

func cloneOrbitMission(m *OrbitMission) *OrbitMission {
	if m == nil {
		return nil
	}

	cloned := *m
	cloned.Clusters = append([]string(nil), m.Clusters...)
	cloned.Steps = append([]OrbitStep(nil), m.Steps...)
	cloned.History = append([]OrbitRunRecord(nil), m.History...)
	return &cloned
}

func (h *OrbitHandler) recordMissionRun(id string, execution orbitMissionExecution) {
	now := time.Now().UTC().Format(time.RFC3339)

	h.mu.Lock()
	mission, ok := h.missions[id]
	if !ok {
		h.mu.Unlock()
		return
	}
	mission.LastRunAt = &now
	result := execution.Result
	mission.LastRunResult = &result
	mission.History = append(mission.History, OrbitRunRecord{
		Timestamp: now,
		Result:    execution.Result,
		Summary:   execution.Summary,
	})
	if len(mission.History) > orbitMaxHistoryEntries {
		mission.History = mission.History[len(mission.History)-orbitMaxHistoryEntries:]
	}
	h.saveToDiskLocked()
	h.mu.Unlock()
}

// ─── Persistence ────────────────────────────────────────────────────

// loadFromDisk reads the JSON data file and populates in-memory state.
func (h *OrbitHandler) loadFromDisk() {
	data, err := os.ReadFile(h.dataFile)
	if err != nil {
		if !os.IsNotExist(err) {
			slog.Warn("orbit: failed to read data file", "path", h.dataFile, "error", err)
		}
		return
	}

	var missions []*OrbitMission
	if err := json.Unmarshal(data, &missions); err != nil {
		slog.Warn("orbit: failed to parse data file", "path", h.dataFile, "error", err)
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	for _, m := range missions {
		h.missions[m.ID] = m
	}
	slog.Info("orbit: loaded missions from disk", "count", len(missions))
}

// saveToDisk persists all missions to the JSON data file.
//
// Takes an exclusive write lock so only one goroutine writes at a time.
// Previously this used RLock(), which allowed the background scheduler
// (checkDueMissions) and concurrent HTTP handlers to enter os.WriteFile
// simultaneously and corrupt the orbit_missions.json file (issue 8003).
func (h *OrbitHandler) saveToDisk() {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.saveToDiskLocked()
}

// saveToDiskLocked persists missions. The caller must hold the write lock
// (h.mu.Lock, not RLock) — concurrent entries would race on the file write.
func (h *OrbitHandler) saveToDiskLocked() {
	missions := make([]*OrbitMission, 0, len(h.missions))
	for _, m := range h.missions {
		missions = append(missions, m)
	}

	data, err := json.MarshalIndent(missions, "", "  ")
	if err != nil {
		slog.Error("orbit: failed to marshal missions", "error", err)
		return
	}

	// Ensure directory exists
	dir := filepath.Dir(h.dataFile)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		slog.Error("orbit: failed to create data directory", "path", dir, "error", err)
		return
	}

	// Atomic write: write to a temp file in the same directory and then
	// rename over the target. Rename is atomic on the same filesystem, so
	// a concurrent reader (or a crash mid-write) either sees the old
	// complete file or the new complete file — never a partial one.
	// Belt-and-braces alongside the write-lock switch above — if a future
	// caller accidentally holds only a read lock, an interrupted write
	// still can't leave behind a corrupted target file.
	tmp, err := os.CreateTemp(dir, ".orbit_missions-*.json.tmp")
	if err != nil {
		slog.Error("orbit: failed to create temp data file", "dir", dir, "error", err)
		return
	}
	tmpPath := tmp.Name()
	// Best-effort cleanup if we bail out before the rename.
	defer func() {
		if _, err := os.Stat(tmpPath); err == nil {
			_ = os.Remove(tmpPath)
		}
	}()
	if _, err := tmp.Write(data); err != nil {
		slog.Error("orbit: failed to write temp data file", "path", tmpPath, "error", err)
		_ = tmp.Close()
		return
	}
	if err := tmp.Sync(); err != nil {
		slog.Error("orbit: failed to fsync temp data file", "path", tmpPath, "error", err)
		_ = tmp.Close()
		return
	}
	if err := tmp.Close(); err != nil {
		slog.Error("orbit: failed to close temp data file", "path", tmpPath, "error", err)
		return
	}
	if err := os.Chmod(tmpPath, 0o644); err != nil {
		slog.Warn("orbit: failed to chmod temp data file", "path", tmpPath, "error", err)
		// Non-fatal — proceed with rename; the file is still ours.
	}
	if err := os.Rename(tmpPath, h.dataFile); err != nil {
		slog.Error("orbit: failed to rename temp data file", "from", tmpPath, "to", h.dataFile, "error", err)
		return
	}
}
