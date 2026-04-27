package api

import (
	"strings"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/compliance/residency"
)

// setupPublicRoutes registers unauthenticated, rate-limited routes that serve
// publicly-available data: active-user counts, analytics proxies, YouTube/Medium
// feeds, and compliance-framework read endpoints needed by demo mode.
//
// publicLimiter is the shared rate-limiter for unauthenticated routes.
// missions and complianceFrameworks are shared handler instances whose
// authenticated counterparts are registered separately on the protected api group.
func (s *Server) setupPublicRoutes(
	publicLimiter fiber.Handler,
	missions *handlers.MissionsHandler,
	complianceFrameworks *handlers.ComplianceFrameworksHandler,
) {
	// analyticsBodyLimit constrains analytics proxy POST bodies at the Fiber level
	// so oversized payloads are rejected before full buffering (#7030).
	const analyticsBodyLimit = 64 * 1024 // 64 KB — analytics payloads are small JSON/query strings
	analyticsBodyGuard := func(c *fiber.Ctx) error {
		if len(c.Body()) > analyticsBodyLimit {
			return fiber.ErrRequestEntityTooLarge
		}
		return c.Next()
	}

	// Active users endpoint (public — returns only aggregate counts, no sensitive data)
	s.app.Get("/api/active-users", publicLimiter, func(c *fiber.Ctx) error {
		wsUsers := s.hub.GetActiveUsersCount()
		demoSessions := s.hub.GetDemoSessionCount()
		wsTotalConns := s.hub.GetTotalConnectionsCount()

		// Return whichever is higher (WebSocket users or demo sessions)
		activeUsers := wsUsers
		if demoSessions > wsUsers {
			activeUsers = demoSessions
		}
		totalConnections := wsTotalConns
		if demoSessions > wsTotalConns {
			totalConnections = demoSessions
		}

		return c.JSON(fiber.Map{
			"activeUsers":      activeUsers,
			"totalConnections": totalConnections,
		})
	})

	// Active users heartbeat endpoint (for demo mode session counting)
	// This is unauthenticated telemetry — session IDs are validated for length
	// and the total number of unique sessions is capped to prevent inflation.
	s.app.Post("/api/active-users", publicLimiter, func(c *fiber.Ctx) error {
		var body struct {
			SessionID string `json:"sessionId"`
		}
		if err := c.BodyParser(&body); err != nil || body.SessionID == "" {
			return c.Status(400).JSON(fiber.Map{"error": "sessionId required"})
		}
		if !s.hub.RecordDemoSession(body.SessionID) {
			return c.Status(429).JSON(fiber.Map{"error": "session limit reached"})
		}
		demoCount := s.hub.GetDemoSessionCount()
		return c.JSON(fiber.Map{
			"activeUsers":      demoCount,
			"totalConnections": demoCount,
		})
	})

	// Public API routes (no auth — only non-sensitive, publicly-available data)
	// Nightly E2E status is public GitHub Actions data, safe for desktop widgets
	nightlyE2EPublic := handlers.NewNightlyE2EHandler(s.config.GitHubToken)
	s.app.Get("/api/public/nightly-e2e/runs", publicLimiter, nightlyE2EPublic.GetRuns)
	s.app.Get("/api/public/nightly-e2e/run-logs", publicLimiter, nightlyE2EPublic.GetRunLogs)

	// Analytics proxies (public — no auth required, have their own origin validation)
	// MUST be registered before the /api group so JWTAuth middleware doesn't intercept them.
	// Protected by publicLimiter (#7029) and analyticsBodyGuard (#7030).
	s.app.All("/api/m", publicLimiter, analyticsBodyGuard, handlers.GA4CollectProxy)
	s.app.Get("/api/gtag", publicLimiter, handlers.GA4ScriptProxy)
	s.app.Get("/api/ksc", publicLimiter, handlers.UmamiScriptProxy)
	s.app.Post("/api/send", publicLimiter, analyticsBodyGuard, handlers.UmamiCollectProxy)

	// Network ping proxy (public — lightweight server-side HTTP HEAD for latency measurement)
	// Avoids browser no-cors limitations that produce unreliable results
	s.app.Get("/api/ping", publicLimiter, handlers.PingHandler)

	// YouTube playlist (public — proxies to YouTube RSS feed, cached 1h)
	s.app.Get("/api/youtube/playlist", publicLimiter, handlers.YouTubePlaylistHandler)
	s.app.Get("/api/youtube/thumbnail/:id", publicLimiter, handlers.YouTubeThumbnailProxy)

	// Medium blog (public — proxies to Medium RSS feed, cached 1h)
	s.app.Get("/api/medium/blog", publicLimiter, handlers.MediumBlogHandler)

	// Mission knowledge base browse/file (public — proxies to public GitHub repo)
	missions.RegisterPublicRoutes(s.app.Group("/api/missions"))

	// Compliance frameworks public read endpoints (no auth — needed for demo mode).
	// POST endpoints (evaluate, report) are registered on the auth-protected api group below.
	complianceFrameworks.RegisterPublicRoutes(s.app.Group("/api/compliance/frameworks", publicLimiter))
	// Data residency enforcement (public read — demo mode).
	residencyEngine := residency.NewEngine()
	dataResidency := handlers.NewDataResidencyHandler(residencyEngine)
	dataResidency.RegisterPublicRoutes(s.app.Group("/api/compliance/residency", publicLimiter))

	// Wrap publicLimiter to skip critical paths that must never be rate-limited
	// by background polling collateral. Fiber v2 group("/api") prefix matching
	// applies group middleware to ALL /api/* routes — including /api/me,
	// /api/feedback/requests, /api/github/*, and /api/version — even though
	// those routes are registered standalone outside the group. Without this
	// skip wrapper, 16 compliance/supply-chain handlers each creating
	// Group("/api", publicLimiter) would stack 16 independent publicLimiter
	// checks on every /api/* request.
	publicLimiterSkipPaths := map[string]bool{
		"/api/feedback/requests": true,
		"/api/me":                true,
		"/api/version":           true,
	}
	publicLimiterWithSkip := func(c *fiber.Ctx) error {
		path := c.Path()
		if publicLimiterSkipPaths[path] {
			return c.Next()
		}
		if strings.HasPrefix(path, "/api/github/") {
			return c.Next()
		}
		if strings.HasPrefix(path, "/api/auth/") {
			return c.Next()
		}
		return publicLimiter(c)
	}
	publicAPI := s.app.Group("/api", publicLimiterWithSkip)

	// Change control audit trail public read endpoints (demo mode).
	changeControl := handlers.NewChangeControlHandler()
	changeControl.RegisterPublicRoutes(publicAPI)

	// Segregation of duties public read endpoints (demo mode).
	sodHandler := handlers.NewSoDHandler()
	sodHandler.RegisterPublicRoutes(publicAPI)

	// BAA tracker public read endpoints (demo mode).
	baaHandler := handlers.NewBAAHandler()
	baaHandler.RegisterPublicRoutes(publicAPI)
	// HIPAA compliance public read endpoints (demo mode).
	hipaaHandler := handlers.NewHIPAAHandler()
	hipaaHandler.RegisterPublicRoutes(publicAPI)
	// GxP / 21 CFR Part 11 public read endpoints (demo mode).
	gxpHandler := handlers.NewGxPHandler()
	gxpHandler.RegisterPublicRoutes(publicAPI)
	// NIST 800-53 control mapping public read endpoints (demo mode).
	nistHandler := handlers.NewNIST80053Handler()
	nistHandler.RegisterPublicRoutes(publicAPI)
	// DISA STIG compliance public read endpoints (demo mode).
	stigHandler := handlers.NewSTIGHandler()
	stigHandler.RegisterPublicRoutes(publicAPI)
	// Air-gap readiness public read endpoints (demo mode).
	airgapHandler := handlers.NewAirGapHandler()
	airgapHandler.RegisterPublicRoutes(publicAPI)
	// FedRAMP readiness public read endpoints (demo mode).
	fedrampHandler := handlers.NewFedRAMPHandler()
	fedrampHandler.RegisterPublicRoutes(publicAPI)
	// Epic 5: Security Operations — SIEM Export (#9643).
	siemHandler := handlers.NewSIEMHandler()
	siemHandler.RegisterPublicRoutes(publicAPI)
	// Epic 6: Supply Chain & Software Provenance (#9632, #9644, #9646, #9647, #9648).
	sbomHandler := handlers.NewSBOMHandler()
	sbomHandler.RegisterPublicRoutes(publicAPI)
	signingHandler := handlers.NewSigningHandler()
	signingHandler.RegisterPublicRoutes(publicAPI)
	slsaHandler := handlers.NewSLSAHandler()
	slsaHandler.RegisterPublicRoutes(publicAPI)
	licenseHandler := handlers.NewLicenseHandler()
	licenseHandler.RegisterPublicRoutes(publicAPI)
	// Runtime Attestation Score (#9987) — composite trust score per cluster.
	attestationHandler := handlers.NewAttestationHandler()
	attestationHandler.RegisterPublicRoutes(publicAPI)
}
