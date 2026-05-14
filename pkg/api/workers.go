package api

import (
	"context"
	"log/slog"

	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/mcp"
	"github.com/kubestellar/console/pkg/safego"
)

func newHub(cfg Config) *handlers.Hub {
	hub := handlers.NewHub()
	hub.SetJWTSecret(cfg.JWTSecret)
	hub.SetDevMode(cfg.DevMode)
	safego.GoWith("api/hub-run", func() { hub.Run() })
	return hub
}

func startMCPBridge(cfg Config) *mcp.Bridge {
	if cfg.KubestellarOpsPath == "" && cfg.KubestellarDeployPath == "" {
		return nil
	}

	bridge := mcp.NewBridge(mcp.BridgeConfig{
		KubestellarOpsPath:    cfg.KubestellarOpsPath,
		KubestellarDeployPath: cfg.KubestellarDeployPath,
		Kubeconfig:            cfg.Kubeconfig,
	})

	safego.GoWith("mcp-bridge-start", func() {
		ctx, cancel := context.WithTimeout(context.Background(), serverShutdownTimeout)
		defer cancel()
		if err := bridge.Start(ctx); err != nil {
			// MCP tools not installed — expected for local binary quickstart
			slog.Warn("MCP bridge not available (install kubestellar-ops/deploy plugins to enable)", "error", err)
		} else {
			slog.Info("MCP bridge started successfully")
		}
	})

	return bridge
}

func (s *Server) startBackgroundWorkers() {
	if s.k8sClient != nil {
		s.gpuUtilWorker = NewGPUUtilizationWorker(s.store, s.k8sClient, s.notificationService)
		s.gpuUtilWorker.Start()
	} else {
		slog.Info("[Server] GPU utilization worker skipped — no Kubernetes client available")
	}
}

func (s *Server) startOrbitScheduler(orbit *handlers.OrbitHandler) {
	orbit.StartScheduler(s.done)
}

func (s *Server) startTimelineCollector(timeline *handlers.TimelineHandler) {
	timeline.StartEventCollector(s.done)
}

func (s *Server) stopBackgroundWorkers() {
	if s.gpuUtilWorker != nil {
		s.gpuUtilWorker.Stop()
	}
	if s.hub != nil {
		s.hub.Close()
	}
	if s.workloadHandlers != nil {
		s.workloadHandlers.StopCacheRefresh()
	}
	if s.rewardsHandler != nil {
		s.rewardsHandler.StopEviction()
	}
	handlers.StopOperatorCacheEvictor()
	handlers.StopGitHubProxyLimiterEvictor()
	handlers.StopSSECacheEvictor()
	middleware.ShutdownTokenRevocation()
	if s.k8sClient != nil {
		s.k8sClient.StopWatching()
	}
	if s.bridge != nil {
		if err := s.bridge.Stop(); err != nil {
			slog.Error("[Server] MCP bridge shutdown error", "error", err)
		}
	}
}
