package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/k8s"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func (h *WorkloadHandlers) MonitorWorkload(c *fiber.Ctx) error {
	return h.withDemoAndClient(
		c,
		func() error {
			return c.JSON(fiber.Map{
				"workload":     c.Params("name"),
				"namespace":    c.Params("namespace"),
				"cluster":      c.Params("cluster"),
				"status":       "Healthy",
				"dependencies": make([]fiber.Map, 0),
				"issues":       make([]fiber.Map, 0),
			})
		},
		func(client *k8s.MultiClusterClient) error {
			cluster := c.Params("cluster")
			namespace := c.Params("namespace")
			name := c.Params("name")

			ctx, cancel := context.WithTimeout(c.Context(), workloadDefaultTimeout)
			defer cancel()

			result, err := client.MonitorWorkload(ctx, cluster, namespace, name)
			if err != nil {
				if strings.Contains(err.Error(), "not found") {
					slog.Info("[Workloads] not found", "error", err)
					return c.Status(404).JSON(fiber.Map{"error": "not found"})
				}
				return handleK8sError(c, err)
			}

			return c.JSON(result)
		},
	)
}


func (h *WorkloadHandlers) GetDeployStatus(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return c.JSON(fiber.Map{
			"cluster":       c.Params("cluster"),
			"namespace":     c.Params("namespace"),
			"name":          c.Params("name"),
			"status":        "Running",
			"replicas":      defaultDemoReplicas,
			"readyReplicas": defaultDemoReplicas,
		})
	}
	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}

	cluster := c.Params("cluster")
	namespace := c.Params("namespace")
	name := c.Params("name")

	ctx, cancel := context.WithTimeout(c.Context(), workloadDefaultTimeout)
	defer cancel()

	workload, err := h.k8sClient.GetWorkload(ctx, cluster, namespace, name)
	if err != nil {
		return handleK8sError(c, err)
	}

	if workload == nil {
		// #5958 — The status field was previously "not_found" (snake_case) which
		// the frontend's DeployMissions poll loop did not recognise, leaving the
		// mission stuck in a "pending" state for many poll cycles. Return a
		// stable shape that the frontend checks for explicitly.
		return c.JSON(fiber.Map{
			"cluster":       cluster,
			"namespace":     namespace,
			"name":          name,
			"status":        "NotFound",
			"notFound":      true,
			"replicas":      0,
			"readyReplicas": 0,
			"reason":        "WorkloadDeleted",
			"message":       "workload no longer exists on target cluster",
		})
	}

	return c.JSON(fiber.Map{
		"cluster":         cluster,
		"namespace":       namespace,
		"name":            name,
		"status":          workload.Status,
		"replicas":        workload.Replicas,
		"readyReplicas":   workload.ReadyReplicas,
		"updatedReplicas": workload.UpdatedReplicas,
		"reason":          workload.Reason,
		"message":         workload.Message,
		"type":            workload.Type,
		"image":           workload.Image,
	})
}

// ClusterFilter is a single condition on cluster metadata
type ClusterFilter struct {
	Field    string `json:"field"`    // healthy, distribution, cpuCores, memoryGB, gpuCount, nodeCount, podCount
	Operator string `json:"operator"` // eq, neq, gt, gte, lt, lte, in
	Value    string `json:"value"`
}

// ClusterGroupQuery defines how dynamic groups select clusters

func (h *WorkloadHandlers) GetDeployLogs(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}

	cluster := c.Params("cluster")
	namespace := c.Params("namespace")
	name := c.Params("name")
	const defaultTailLines = 8
	tailLines := c.QueryInt("tail", defaultTailLines)
	// Clamp to a safe range to prevent panic from negative slice indices (#7003).
	if tailLines <= 0 {
		tailLines = defaultTailLines
	}

	client, err := h.k8sClient.GetClient(cluster)
	if err != nil {
		slog.Error("[workloads] failed to get cluster client", "cluster", cluster, "error", err)
		return c.Status(500).JSON(fiber.Map{"error": "cluster access failed"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), workloadDeployLogsTimeout)
	defer cancel()

	// Validate workload name to prevent label selector injection (#7004).
	// A crafted name like "foo,env=prod" would expand to "app=foo,env=prod"
	// and match pods from unrelated workloads.
	if !validLabelValue.MatchString(name) {
		return c.Status(400).JSON(fiber.Map{"error": "invalid workload name"})
	}

	// Try label selector first: app=<name>
	pods, err := client.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("app=%s", name),
	})
	if err != nil || len(pods.Items) == 0 {
		// Fallback: list all pods and filter by name prefix
		allPods, listErr := client.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
		if listErr != nil {
			slog.Error("[workloads] failed to list pods", "namespace", namespace, "error", listErr)
			return c.Status(500).JSON(fiber.Map{"error": "failed to list pods"})
		}
		filtered := allPods.DeepCopy()
		filtered.Items = nil
		for _, p := range allPods.Items {
			if strings.HasPrefix(p.Name, name+"-") || p.Name == name {
				filtered.Items = append(filtered.Items, p)
			}
		}
		pods = filtered
	}

	// Collect k8s events for the deployment and its pods.
	// Use a single namespace-wide query instead of N+1 per-pod calls (#14410).
	const maxEventsTotal int64 = 500
	allEvents := make([]corev1.Event, 0, maxEventsTotal)

	// Build a set of names we care about: the deployment + all its pods.
	relevantNames := make(map[string]struct{}, 1+len(pods.Items))
	relevantNames[name] = struct{}{}
	for _, pod := range pods.Items {
		relevantNames[pod.Name] = struct{}{}
	}

	// Single API call: fetch all events in this namespace, bounded by limit.
	nsEvents, _ := client.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{
		Limit: maxEventsTotal,
	})
	if nsEvents != nil {
		for i := range nsEvents.Items {
			if _, ok := relevantNames[nsEvents.Items[i].InvolvedObject.Name]; ok {
				allEvents = append(allEvents, nsEvents.Items[i])
			}
		}
	}

	// Sort events by actual timestamp (newest last) (#3718, #6042).
	// Prefer modern EventTime; fall back to LastTimestamp then CreationTimestamp.
	sort.Slice(allEvents, func(i, j int) bool {
		ti := k8s.EffectiveEventTime(&allEvents[i])
		if ti.IsZero() {
			ti = allEvents[i].CreationTimestamp.Time
		}
		tj := k8s.EffectiveEventTime(&allEvents[j])
		if tj.IsZero() {
			tj = allEvents[j].CreationTimestamp.Time
		}
		return ti.Before(tj)
	})
	if len(allEvents) > tailLines {
		allEvents = allEvents[len(allEvents)-tailLines:]
	}
	eventLines := make([]string, 0, len(allEvents))
	for _, ev := range allEvents {
		eventLines = append(eventLines, formatEvent(ev))
	}

	// Return Kubernetes events only — pod stdout is misleading for deploy events
	// (e.g. nginx worker notices have nothing to do with the deploy lifecycle).
	podName := ""
	if len(pods.Items) > 0 {
		podName = pods.Items[0].Name
	}
	return c.JSON(fiber.Map{
		"logs": eventLines,
		"pod":  podName,
		"type": "events",
	})
}

// formatEvent formats a k8s event into a compact log line for mission display.
func formatEvent(ev corev1.Event) string {
	ts := k8s.EffectiveEventTime(&ev)
	if ts.IsZero() {
		ts = ev.CreationTimestamp.Time
	}
	prefix := ""
	if ev.Type == "Warning" {
		prefix = "⚠ "
	}
	return fmt.Sprintf("%s %s%s: %s",
		ts.Format("15:04:05"),
		prefix,
		ev.Reason,
		ev.Message,
	)
}
