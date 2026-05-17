package handlers

import (
	"context"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

const (
	// workloadListTimeout is the timeout for listing workloads across clusters.
	workloadListTimeout = 30 * time.Second
	// workloadPodsTimeout is the timeout for fetching pod/health context for AI queries.
	workloadPodsTimeout = 15 * time.Second
	// workloadDefaultTimeout is the per-cluster timeout for single-cluster workload queries.
	workloadDefaultTimeout = 15 * time.Second
	// workloadWriteTimeout is the timeout for workload write operations (deploy, scale, delete).
	workloadWriteTimeout = 30 * time.Second
	// workloadDeployLogsTimeout is the timeout for fetching deploy logs (events + pod queries).
	workloadDeployLogsTimeout = 15 * time.Second
	// defaultDemoReplicas is the replica count returned for deployments in demo mode.
	defaultDemoReplicas = 3
)

const (
	// clusterGroupRefreshInterval is how often the in-memory cluster group
	// cache is re-synced from the persistent store. This ensures that in
	// multi-instance deployments each backend picks up writes made by
	// other instances within a bounded window (#10007).
	clusterGroupRefreshInterval = 30 * time.Second
)

// WorkloadHandlers handles workload API endpoints
type WorkloadHandlers struct {
	k8sClient *k8s.MultiClusterClient
	hub       *Hub
	store     store.Store
	stopOnce  sync.Once
	stopCh    chan struct{}
}

// NewWorkloadHandlers creates a new workload handlers instance
func NewWorkloadHandlers(k8sClient *k8s.MultiClusterClient, hub *Hub, s store.Store) *WorkloadHandlers {
	return &WorkloadHandlers{
		k8sClient: k8sClient,
		hub:       hub,
		store:     s,
		stopCh:    make(chan struct{}),
	}
}

// requireAdmin enforces the console-admin role on mutating workload endpoints
// (#5974). All modify endpoints — deploy, scale, delete, cluster-group CRUD —
// go through this single helper so the check can never drift between
// handlers. When no user store is configured (dev/demo/tests) the check is
// skipped; production wiring always passes a real store in.
func (h *WorkloadHandlers) requireAdmin(c *fiber.Ctx) error {
	if h.store == nil {
		return nil
	}
	currentUserID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(c.UserContext(), currentUserID)
	if err != nil || currentUser == nil || currentUser.Role != models.UserRoleAdmin {
		return fiber.NewError(fiber.StatusForbidden, "Console admin access required")
	}
	return nil
}

func (h *WorkloadHandlers) withDemoAndClient(
	c *fiber.Ctx,
	demoHandler func() error,
	handler func(client *k8s.MultiClusterClient) error,
) error {
	if isDemoMode(c) {
		return demoHandler()
	}
	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}
	return handler(h.k8sClient)
}

func (h *WorkloadHandlers) ListWorkloads(c *fiber.Ctx) error {
	return h.withDemoAndClient(
		c,
		func() error {
			return demoResponse(c, "workloads", getDemoWorkloads())
		},
		func(client *k8s.MultiClusterClient) error {
			// Optional filters
			cluster := c.Query("cluster")
			namespace := c.Query("namespace")
			workloadType := c.Query("type")

			ctx, cancel := context.WithTimeout(c.Context(), workloadListTimeout)
			defer cancel()

			workloads, err := client.ListWorkloads(ctx, cluster, namespace, workloadType)
			if err != nil {
				return handleK8sError(c, err)
			}

			return c.JSON(workloads)
		},
	)
}

// GetWorkload returns a specific workload
// GET /api/workloads/:cluster/:namespace/:name
func (h *WorkloadHandlers) GetWorkload(c *fiber.Ctx) error {
	return h.withDemoAndClient(
		c,
		func() error {
			demos := getDemoWorkloads()
			if len(demos) > 0 {
				return c.JSON(demos[0])
			}
			return c.JSON(fiber.Map{})
		},
		func(client *k8s.MultiClusterClient) error {
			cluster := c.Params("cluster")
			namespace := c.Params("namespace")
			name := c.Params("name")

			ctx, cancel := context.WithTimeout(c.Context(), workloadDefaultTimeout)
			defer cancel()

			workload, err := client.GetWorkload(ctx, cluster, namespace, name)
			if err != nil {
				return handleK8sError(c, err)
			}

			if workload == nil {
				return c.Status(404).JSON(fiber.Map{"error": "Workload not found"})
			}

			return c.JSON(workload)
		},
	)
}

// NOTE: DeployWorkload moved to kc-agent (#7993 Phase 1 PR B).
// The agent (pkg/agent/server_http.go handleDeployWorkloadHTTP) runs under
// the user's kubeconfig instead of the backend pod SA and calls the same
// shared pkg/k8s MultiClusterClient.DeployWorkload method.

// ResolveDependencies returns the dependency tree for a workload without deploying (dry-run).
// GET /api/workloads/resolve-deps/:cluster/:namespace/:name
func (h *WorkloadHandlers) ResolveDependencies(c *fiber.Ctx) error {
	return h.withDemoAndClient(
		c,
		func() error {
			return c.JSON(fiber.Map{
				"workload":     c.Params("name"),
				"kind":         "Deployment",
				"namespace":    c.Params("namespace"),
				"cluster":      c.Params("cluster"),
				"dependencies": make([]fiber.Map, 0),
				"warnings":     make([]string, 0),
			})
		},
		func(client *k8s.MultiClusterClient) error {
			cluster := c.Params("cluster")
			namespace := c.Params("namespace")
			name := c.Params("name")

			ctx, cancel := context.WithTimeout(c.Context(), workloadDefaultTimeout)
			defer cancel()

			workloadKind, bundle, err := client.ResolveWorkloadDependencies(ctx, cluster, namespace, name)
			if err != nil {
				if strings.Contains(err.Error(), "not found") {
					slog.Info("[Workloads] not found", "error", err)
					return c.Status(404).JSON(fiber.Map{"error": "not found"})
				}
				return handleK8sError(c, err)
			}

			type depDTO struct {
				Kind      string `json:"kind"`
				Name      string `json:"name"`
				Namespace string `json:"namespace"`
				Optional  bool   `json:"optional"`
				Order     int    `json:"order"`
			}

			deps := make([]depDTO, 0, len(bundle.Dependencies))
			for _, d := range bundle.Dependencies {
				deps = append(deps, depDTO{
					Kind:      string(d.Kind),
					Name:      d.Name,
					Namespace: d.Namespace,
					Optional:  d.Optional,
					Order:     d.Order,
				})
			}

			warnings := bundle.Warnings
			if warnings == nil {
				warnings = []string{}
			}

			return c.JSON(fiber.Map{
				"workload":     name,
				"kind":         workloadKind,
				"namespace":    namespace,
				"cluster":      cluster,
				"dependencies": deps,
				"warnings":     warnings,
			})
		},
	)
}

// MonitorWorkload returns a workload's dependencies with health status and detected issues.
// GET /api/workloads/monitor/:cluster/:namespace/:name

func (h *WorkloadHandlers) GetClusterCapabilities(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}

	ctx, cancel := context.WithTimeout(c.Context(), workloadListTimeout)
	defer cancel()

	capabilities, err := h.k8sClient.GetClusterCapabilities(ctx)
	if err != nil {
		return handleK8sError(c, err)
	}

	return c.JSON(capabilities)
}

// ListBindingPolicies returns all binding policies
// GET /api/workloads/policies
func (h *WorkloadHandlers) ListBindingPolicies(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}

	ctx, cancel := context.WithTimeout(c.Context(), workloadDefaultTimeout)
	defer cancel()

	policies, err := h.k8sClient.ListBindingPolicies(ctx)
	if err != nil {
		return handleK8sError(c, err)
	}

	return c.JSON(policies)
}

// GetDeployLogs returns Kubernetes events and recent log lines from a workload's pods.
// Events are more useful than pod stdout during deployment (image pulls, scheduling, etc.).
// GET /api/workloads/deploy-logs/:cluster/:namespace/:name?tail=8
