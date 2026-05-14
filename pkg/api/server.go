package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime/debug"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/fileutil"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/mcp"
	"github.com/kubestellar/console/pkg/notifications"
	"github.com/kubestellar/console/pkg/settings"
	"github.com/kubestellar/console/pkg/store"
)

const (
	serverShutdownTimeout   = 30 * time.Second
	serverHealthTimeout     = 2 * time.Second
	serverStartupDelay      = 50 * time.Millisecond
	portReleaseTimeout      = 3 * time.Second
	portReleasePollInterval = 50 * time.Millisecond
	defaultDevFrontendURL   = "http://localhost:5174"
	defaultProdFrontendURL  = "http://localhost:8080"
	defaultKCAgentBaseURL   = "http://127.0.0.1:8585"
	kcAgentURLEnvVar        = "KC_AGENT_URL"

	// kcAgentProxyTimeout is the timeout for proxied requests to kc-agent.
	kcAgentProxyTimeout = 30 * time.Second

	// maxAgentProxyResponseBytes caps io.ReadAll on kc-agent proxy responses.
	maxAgentProxyResponseBytes = 10 * 1024 * 1024 // 10 MiB

	// apiDefaultBodyLimit is the per-route body-size limit enforced by the
	// bodyGuard middleware on all API routes except feedback screenshot uploads.
	apiDefaultBodyLimit = 1 * 1024 * 1024 // 1 MB — sufficient for JSON API requests

	// feedbackBodyLimit is the global Fiber BodyLimit, elevated to support
	// base64-encoded screenshot uploads in POST /api/feedback/requests.
	// Reduced from 20 MB to 5 MB to limit memory-based DoS surface (#9710).
	feedbackBodyLimit = 5 * 1024 * 1024 // 5 MB — base64 screenshot uploads

	// envMaxBodyBytes is the environment variable that overrides the global
	// Fiber BodyLimit applied to every HTTP request (#9891). When unset or
	// invalid, the server falls back to feedbackBodyLimit so feedback screenshot
	// uploads continue to work. Larger deployments can raise this for big
	// form posts; smaller appliances can lower it to tighten DoS surface.
	envMaxBodyBytes = "MAX_BODY_BYTES"
)

// Version is the build version, injected via ldflags at build time.
// Used in /health response for stale-frontend detection.
var Version = "dev"

// kcAgentBaseURL is the loopback URL of the co-located kc-agent HTTP server.
// The backend proxies auto-update requests to this address so the browser
// never makes a cross-origin call to kc-agent (avoids CORS/PNA issues).
var kcAgentBaseURL = defaultKCAgentBaseURL

// BuildInfo holds VCS metadata extracted from the Go binary at startup.
type BuildInfo struct {
	GoVersion   string
	VCSRevision string
	VCSTime     string
	VCSModified string
}

var buildInfo BuildInfo

// GetBuildInfo returns the VCS metadata extracted from the Go binary.
func GetBuildInfo() BuildInfo { return buildInfo }

func init() {
	kcAgentBaseURL = normalizeKCAgentBaseURL(os.Getenv(kcAgentURLEnvVar))

	info, ok := debug.ReadBuildInfo()
	if !ok {
		return
	}
	buildInfo.GoVersion = info.GoVersion
	for _, s := range info.Settings {
		switch s.Key {
		case "vcs.revision":
			buildInfo.VCSRevision = s.Value
		case "vcs.time":
			buildInfo.VCSTime = s.Value
		case "vcs.modified":
			buildInfo.VCSModified = s.Value
		}
	}
}

func normalizeKCAgentBaseURL(raw string) string {
	trimmed := strings.TrimRight(strings.TrimSpace(raw), "/")
	if trimmed == "" {
		return defaultKCAgentBaseURL
	}
	return trimmed
}

// Config holds server configuration
type Config struct {
	Port                  int
	DevMode               bool
	SkipOnboarding        bool
	DatabasePath          string
	GitHubClientID        string
	GitHubSecret          string
	GitHubURL             string // GitHub base URL (e.g., "https://github.ibm.com"), defaults to "https://github.com"
	JWTSecret             string
	FrontendURL           string
	ClaudeAPIKey          string
	KubestellarOpsPath    string
	KubestellarDeployPath string
	Kubeconfig            string
	// Dev mode user settings (used when GitHub OAuth not configured)
	DevUserLogin  string
	DevUserEmail  string
	DevUserAvatar string
	// GitHubToken is the consolidated GitHub PAT used for all GitHub operations:
	// API proxy (activity card, CI), feedback/issue creation, missions, and rewards.
	// Resolved from FEEDBACK_GITHUB_TOKEN env var, falling back to GITHUB_TOKEN.
	GitHubToken string
	// Feature request/feedback configuration (repo targeting, not token)
	GitHubWebhookSecret string // Secret for validating GitHub webhooks
	FeedbackRepoOwner   string // GitHub org/owner (e.g., "kubestellar")
	FeedbackRepoName    string // GitHub repo name (e.g., "console")
	// GitHub activity rewards
	RewardsGitHubOrgs string // Org filter for GitHub search (e.g., "org:kubestellar org:llm-d")
	// Benchmark data configuration (Google Drive)
	BenchmarkGoogleDriveAPIKey string // API key for fetching benchmark data from Google Drive
	BenchmarkFolderID          string // Google Drive folder ID containing benchmark results
	// Sidebar configuration
	EnabledDashboards string // Comma-separated list of dashboard IDs to show in sidebar (empty = all)
	// White-label project context (e.g., "kubestellar", "crossplane", "istio")
	// Controls which project-specific cards, dashboards, and routes are active.
	// Default: "kubestellar"
	ConsoleProject string
	// White-label branding configuration
	BrandAppName      string // APP_NAME — display name (default: "KubeStellar Console")
	BrandAppShortName string // APP_SHORT_NAME — compact name (default: "KubeStellar")
	BrandTagline      string // APP_TAGLINE (default: "multi-cluster first, saving time and tokens")
	BrandLogoURL      string // LOGO_URL — path to logo image (default: "/kubestellar-logo.svg")
	BrandFaviconURL   string // FAVICON_URL (default: "/favicon.ico")
	BrandThemeColor   string // THEME_COLOR — PWA theme color (default: "#7c3aed")
	BrandDocsURL      string // DOCS_URL (default: "https://kubestellar.io/docs/console/readme")
	BrandCommunityURL string // COMMUNITY_URL (default: "https://kubestellar.io/community")
	BrandWebsiteURL   string // WEBSITE_URL (default: "https://kubestellar.io")
	BrandIssuesURL    string // ISSUES_URL (default: "https://github.com/kubestellar/kubestellar/issues/new")
	BrandRepoURL      string // REPO_URL (default: "https://github.com/kubestellar/console")
	BrandHostedDomain string // HOSTED_DOMAIN — domain for demo mode (default: "console.kubestellar.io")
	// AgentToken is the shared secret for authenticating with kc-agent.
	// startup-oauth.sh generates this and passes it to both kc-agent and
	// the Go backend via the KC_AGENT_TOKEN env var. The backend serves
	// it via GET /api/agent/token so the frontend can call kc-agent
	// endpoints that require Bearer auth.
	AgentToken string
	// Kubara platform catalog configuration
	// KubaraCatalogRepo is the GitHub owner/name of the catalog repo
	// (e.g. "my-org/my-catalog"). Defaults to "kubara-io/kubara".
	KubaraCatalogRepo string
	// KubaraCatalogPath is the directory path inside the repo containing
	// Helm chart subdirectories. Defaults to the standard Kubara path.
	KubaraCatalogPath string
	// NoLocalAgent suppresses the frontend's local kc-agent connections
	// (ws://127.0.0.1:8585). Set to true for in-cluster deployments
	// (Helm/Kubernetes) where no local kc-agent exists on the user's machine.
	// Exposed via /health as "no_local_agent" so the pre-built frontend image
	// can detect this at runtime without requiring a VITE_NO_LOCAL_AGENT rebuild.
	NoLocalAgent bool
	// Watchdog support: when set, the backend listens on this port instead of Port
	BackendPort int
}

// Server represents the API server
type Server struct {
	app                 *fiber.App
	store               store.Store
	config              Config
	hub                 *handlers.Hub
	bridge              *mcp.Bridge
	k8sClient           *k8s.MultiClusterClient
	notificationService *notifications.Service
	persistenceStore    *store.PersistenceStore
	loadingSrv          *http.Server          // temporary loading screen server
	authHandler         *handlers.AuthHandler // guarded by oauthMu for hot-reload
	oauthMu             sync.RWMutex          // protects authHandler during manifest flow hot-reload
	shuttingDown        int32                 // atomic flag: 1 during graceful shutdown
	gpuUtilWorker       *GPUUtilizationWorker
	workloadHandlers    *handlers.WorkloadHandlers // for cache refresh shutdown (#10007)
	rewardsHandler      *handlers.RewardsHandler   // for eviction goroutine shutdown
	failureTracker      *middleware.FailureTracker // tracks auth failure counts for rate limiting
	done                chan struct{}              // closed on Shutdown to stop background goroutines
	shutdownOnce        sync.Once                  // ensures Shutdown is idempotent (#6478)
	quantumWorkloadMu   sync.RWMutex               // protects quantum workload cache
	quantumAvailable    bool                       // cached quantum-kc-demo availability
	quantumCacheTime    time.Time                  // when quantum cache was last updated
}

// NewServer creates a new API server.
func NewServer(cfg Config) (*Server, error) {
	return newServer(cfg)
}

// In production (non-dev), frontend and backend are served from the same origin,
// so we use FrontendURL. In dev mode, they run on separate ports.
func (s *Server) backendURL() string {
	if !s.config.DevMode && s.config.FrontendURL != "" {
		return s.config.FrontendURL
	}
	port := s.config.Port
	if s.config.BackendPort > 0 {
		port = s.config.BackendPort
	}
	return fmt.Sprintf("http://localhost:%d", port)
}

// Start shuts down the temporary loading server and starts the real Fiber app.
func (s *Server) Start() error {
	// When BackendPort is set (watchdog mode), listen on that port instead
	listenPort := s.config.Port
	if s.config.BackendPort > 0 {
		listenPort = s.config.BackendPort
	}
	addr := fmt.Sprintf(":%d", listenPort)

	// Shut down the temporary loading page server to free the port
	if s.loadingSrv != nil {
		ctx, cancel := context.WithTimeout(context.Background(), serverHealthTimeout)
		defer cancel()
		s.loadingSrv.Shutdown(ctx)
		s.loadingSrv = nil

		// Wait for the OS to fully release the port instead of a fixed sleep.
		// The previous 50ms sleep was insufficient on some systems.
		if err := waitForPortRelease(listenPort, portReleaseTimeout); err != nil {
			slog.Warn("[Server] port may not be fully released", "port", listenPort, "error", err)
		}
	}

	slog.Info("[Server] starting", "addr", addr, "devMode", s.config.DevMode)
	return s.app.Listen(addr)
}

// waitForPortRelease polls until the given port is free or the timeout expires.
// fileExists returns true when the path exists and is a regular file.
func fileExists(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return !info.IsDir()
}

func waitForPortRelease(port int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	addr := fmt.Sprintf("127.0.0.1:%d", port)
	for time.Now().Before(deadline) {
		ln, err := net.Listen("tcp", addr)
		if err == nil {
			ln.Close()
			return nil
		}
		time.Sleep(portReleasePollInterval)
	}
	return fmt.Errorf("port %d not released within %v", port, timeout)
}

// Shutdown gracefully shuts down the server.
// Sets shuttingDown flag first so /health returns "shutting_down"
// before services are torn down, giving the frontend time to notice.
//
// Shutdown is idempotent (#6478): subsequent calls are no-ops. Previously a
// second call panicked with "close of closed channel" when close(s.done)
// was invoked a second time.
func (s *Server) Shutdown() error {
	var shutdownErr error
	s.shutdownOnce.Do(func() {
		atomic.StoreInt32(&s.shuttingDown, 1)

		// Signal background goroutines (orbit scheduler, etc.) to stop.
		close(s.done)

		// If Shutdown is called before Start, the temporary loading server
		// is still running and holding the port. Shut it down first.
		if s.loadingSrv != nil {
			ctx, cancel := context.WithTimeout(context.Background(), serverHealthTimeout)
			defer cancel()
			s.loadingSrv.Shutdown(ctx)
			s.loadingSrv = nil
		}

		s.stopBackgroundWorkers()
		if err := s.store.Close(); err != nil {
			shutdownErr = err
			return
		}
		shutdownErr = s.app.Shutdown()
	})
	return shutdownErr
}

func customErrorHandler(c *fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	message := "Internal Server Error"

	if e, ok := err.(*fiber.Error); ok {
		code = e.Code
		message = e.Message
	}

	return c.Status(code).JSON(fiber.Map{
		"error": message,
	})
}

// LoadConfigFromEnv loads configuration from environment variables
func LoadConfigFromEnv() Config {
	port := 8080
	if p := os.Getenv("PORT"); p != "" {
		if v, err := strconv.Atoi(p); err != nil {
			slog.Warn("[Server] invalid PORT, using default", "value", p, "default", port, "error", err)
		} else {
			port = v
		}
	}

	var backendPort int
	if p := os.Getenv("BACKEND_PORT"); p != "" {
		if v, err := strconv.Atoi(p); err != nil {
			slog.Warn("[Server] invalid BACKEND_PORT, ignoring", "value", p, "error", err)
		} else {
			backendPort = v
		}
	}

	dbPath := "./data/console.db"
	if p := os.Getenv("DATABASE_PATH"); p != "" {
		dbPath = p
	}

	devModeEnv := os.Getenv("DEV_MODE")
	devMode := devModeEnv == "true"

	// Defense-in-depth: auto-activate dev mode when OAuth is unconfigured (#10925).
	// Without this, a missing DEV_MODE export (e.g. older start.sh) causes the
	// auth-retry cascade: JWTAuth rejects every request → frontend retries → 429.
	// Skip auto-activation when DEV_MODE is explicitly "false" — the one-click
	// manifest flow intentionally starts with no OAuth credentials (#10931).
	githubClientID := os.Getenv("GITHUB_CLIENT_ID")
	githubSecret := os.Getenv("GITHUB_CLIENT_SECRET")
	if !devMode && devModeEnv != "false" && githubClientID == "" && githubSecret == "" {
		slog.Warn("[Config] No GitHub OAuth credentials and DEV_MODE not set — auto-activating dev mode")
		devMode = true
	}

	// Frontend URL can be explicitly set via env var
	// If not set, leave empty and compute default in NewServer based on final DevMode
	// (This allows --dev flag to override env var for frontend URL default)
	frontendURL := os.Getenv("FRONTEND_URL")

	// JWT secret - read from env, validation and default generation happens in NewServer
	// (This allows --dev flag to override env var for JWT secret default)
	jwtSecret := os.Getenv("JWT_SECRET")

	// Warn when feedback/rewards env vars are not set — forks and enterprise
	// deployments should set these to avoid routing user actions to the
	// upstream kubestellar repositories.  See #2826.
	warnDefaultEnvVars(map[string]string{
		"FEEDBACK_REPO_OWNER": "kubestellar",
		"FEEDBACK_REPO_NAME":  "console",
		"REWARDS_GITHUB_ORGS": "repo:kubestellar/console repo:kubestellar/console-marketplace repo:kubestellar/console-kb repo:kubestellar/docs",
	})

	return Config{
		Port:                  port,
		DevMode:               devMode,
		DatabasePath:          dbPath,
		GitHubClientID:        githubClientID,
		GitHubSecret:          githubSecret,
		GitHubURL:             getEnvOrDefault("GITHUB_URL", "https://github.com"),
		JWTSecret:             jwtSecret,
		FrontendURL:           frontendURL,
		ClaudeAPIKey:          os.Getenv("CLAUDE_API_KEY"),
		KubestellarOpsPath:    getEnvOrDefault("KUBESTELLAR_OPS_PATH", "kubestellar-ops"),
		KubestellarDeployPath: getEnvOrDefault("KUBESTELLAR_DEPLOY_PATH", "kubestellar-deploy"),
		Kubeconfig:            os.Getenv("KUBECONFIG"),
		// Dev mode user settings
		DevUserLogin:  getEnvOrDefault("DEV_USER_LOGIN", "dev-user"),
		DevUserEmail:  getEnvOrDefault("DEV_USER_EMAIL", "dev@localhost"),
		DevUserAvatar: getEnvOrDefault("DEV_USER_AVATAR", ""),
		// kc-agent shared secret (generated by startup-oauth.sh)
		AgentToken: os.Getenv("KC_AGENT_TOKEN"),
		// Consolidated GitHub token (FEEDBACK_GITHUB_TOKEN preferred, GITHUB_TOKEN as alias)
		GitHubToken:         settings.ResolveGitHubTokenEnv(),
		GitHubWebhookSecret: os.Getenv("GITHUB_WEBHOOK_SECRET"),
		FeedbackRepoOwner:   getEnvOrDefault("FEEDBACK_REPO_OWNER", "kubestellar"),
		FeedbackRepoName:    getEnvOrDefault("FEEDBACK_REPO_NAME", "console"),
		// GitHub activity rewards
		RewardsGitHubOrgs: getEnvOrDefault("REWARDS_GITHUB_ORGS", "repo:kubestellar/console repo:kubestellar/console-marketplace repo:kubestellar/console-kb repo:kubestellar/docs"),
		// Skip onboarding questionnaire for new users
		SkipOnboarding: os.Getenv("SKIP_ONBOARDING") == "true",
		// Benchmark data from Google Drive
		BenchmarkGoogleDriveAPIKey: os.Getenv("GOOGLE_DRIVE_API_KEY"),
		BenchmarkFolderID:          getEnvOrDefault("BENCHMARK_FOLDER_ID", "1r2Z2Xp1L0KonUlvQHvEzed8AO9Xj8IPm"),
		// Kubara platform catalog (optional — defaults to kubara-io/kubara public catalog)
		KubaraCatalogRepo: os.Getenv("KUBARA_CATALOG_REPO"),
		KubaraCatalogPath: os.Getenv("KUBARA_CATALOG_PATH"),
		// Sidebar dashboard filter
		EnabledDashboards: os.Getenv("ENABLED_DASHBOARDS"),
		// White-label project context
		ConsoleProject: getEnvOrDefault("CONSOLE_PROJECT", "kubestellar"),
		// White-label branding (all default to KubeStellar values)
		BrandAppName:      getEnvOrDefault("APP_NAME", "KubeStellar Console"),
		BrandAppShortName: getEnvOrDefault("APP_SHORT_NAME", "KubeStellar"),
		BrandTagline:      getEnvOrDefault("APP_TAGLINE", "multi-cluster first, saving time and tokens"),
		BrandLogoURL:      getEnvOrDefault("LOGO_URL", "/kubestellar-logo.svg"),
		BrandFaviconURL:   getEnvOrDefault("FAVICON_URL", "/favicon.ico"),
		BrandThemeColor:   getEnvOrDefault("THEME_COLOR", "#7c3aed"),
		BrandDocsURL:      getEnvOrDefault("DOCS_URL", "https://kubestellar.io/docs/console/readme"),
		BrandCommunityURL: getEnvOrDefault("COMMUNITY_URL", "https://kubestellar.io/community"),
		BrandWebsiteURL:   getEnvOrDefault("WEBSITE_URL", "https://kubestellar.io"),
		BrandIssuesURL:    getEnvOrDefault("ISSUES_URL", "https://github.com/kubestellar/kubestellar/issues/new"),
		BrandRepoURL:      getEnvOrDefault("REPO_URL", "https://github.com/kubestellar/console"),
		BrandHostedDomain: getEnvOrDefault("HOSTED_DOMAIN", "console.kubestellar.io"),
		// Suppress local kc-agent connections in in-cluster deployments
		NoLocalAgent: os.Getenv("NO_LOCAL_AGENT") == "true",
		// Watchdog backend port override
		BackendPort: backendPort,
	}
}

func getEnvOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

// resolveMaxBodyBytes returns the global Fiber BodyLimit in bytes.
// It reads the envMaxBodyBytes environment variable and falls back to
// feedbackBodyLimit when the value is unset, non-numeric, or non-positive.
// This is the canonical cap that rejects oversized payloads before Fiber
// buffers them, mitigating memory-exhaustion DoS (#9891).
func resolveMaxBodyBytes() int {
	raw := os.Getenv(envMaxBodyBytes)
	if raw == "" {
		return feedbackBodyLimit
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		slog.Warn("invalid MAX_BODY_BYTES env var; using default",
			"value", raw, "default_bytes", feedbackBodyLimit)
		return feedbackBodyLimit
	}
	return n
}

// warnDefaultEnvVars logs a warning for each env var that is not explicitly
// set.  This helps fork and enterprise deployers notice that the defaults
// point to the upstream kubestellar repositories so they can override them.
func warnDefaultEnvVars(vars map[string]string) {
	keys := make([]string, 0, len(vars))
	for k := range vars {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, envVar := range keys {
		defaultVal := vars[envVar]
		if os.Getenv(envVar) == "" {
			slog.Warn("[Server] env var not set, using default — set this for fork/enterprise deployments",
				"envVar", envVar, "default", defaultVal)
		}
	}
}

// devSecretBytes is the number of random bytes used to generate a dev secret (32 bytes = 256 bits).
const devSecretBytes = 32

// devSecretFile is the filename used to persist the auto-generated JWT secret
// across dev-mode restarts (#6850). The file is created in the working directory
// and should be gitignored.
const devSecretFile = ".jwt-secret"

// sharedSecretDir is the user-level config directory where the JWT secret is
// also persisted so it survives across fresh curl-install runs (#8202).
const sharedSecretDir = ".kubestellar"

// loadOrCreateDevSecret checks two locations for an existing JWT secret:
// first the local working directory (explicit override), then the shared
// ~/.kubestellar/ dir (survives reinstalls). If neither exists, it generates
// a new secret and writes to both locations.
func loadOrCreateDevSecret() string {
	localPath := filepath.Join(".", devSecretFile)
	sharedPath := sharedSecretPath()

	for _, p := range []string{localPath, sharedPath} {
		if p == "" {
			continue
		}
		data, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		secret := strings.TrimSpace(string(data))
		if len(secret) >= devSecretBytes {
			slog.Info("Loaded persisted dev JWT secret", "path", p)
			if p == sharedPath {
				persistSecret(localPath, secret)
			}
			return secret
		}
		slog.Warn("Existing secret file is too short, skipping", "path", p)
	}

	secret := generateRandomSecret()

	persistSecret(localPath, secret)
	if sharedPath != "" {
		persistSecret(sharedPath, secret)
	}

	return secret
}

func sharedSecretPath() string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return ""
	}
	return filepath.Join(home, sharedSecretDir, devSecretFile)
}

func persistSecret(path, secret string) {
	const secretFilePerms = 0o600
	const secretDirPerms = 0o700
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, secretDirPerms); err != nil {
		slog.Warn("Could not create directory for JWT secret", "dir", dir, "error", err)
		return
	}
	if err := fileutil.AtomicWriteFile(path, []byte(secret+"\n"), secretFilePerms); err != nil {
		slog.Warn("Could not persist dev JWT secret", "path", path, "error", err)
	} else {
		slog.Info("Persisted dev JWT secret", "path", path)
	}
}

// generateRandomSecret produces a cryptographically random hex string for use
// as a JWT signing secret.
func generateRandomSecret() string {
	b := make([]byte, devSecretBytes)
	if _, err := rand.Read(b); err != nil {
		// crypto/rand.Read should never fail on supported platforms;
		// if it does, fall back to a logged warning and a best-effort value.
		slog.Error("[Server] crypto/rand.Read failed, using fallback", "error", err)
		return fmt.Sprintf("dev-fallback-%d", b)
	}
	return hex.EncodeToString(b)
}

// gitFallbackRevision returns the current git HEAD SHA by shelling out to git.
// Used as a fallback when debug.ReadBuildInfo() doesn't include VCS metadata
// (e.g. when running with `go run` outside a module-aware build).
func gitFallbackRevision() string {
	const gitCmdTimeout = 5 * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), gitCmdTimeout)
	defer cancel()
	out, err := exec.CommandContext(ctx, "git", "rev-parse", "HEAD").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// gitFallbackTime returns the commit time of HEAD by shelling out to git.
// Used as a fallback when debug.ReadBuildInfo() doesn't include VCS metadata.
func gitFallbackTime() string {
	const gitCmdTimeout = 5 * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), gitCmdTimeout)
	defer cancel()
	out, err := exec.CommandContext(ctx, "git", "log", "-1", "--format=%cI").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// detectInstallMethod returns how the console was installed: dev, binary, or helm.
func detectInstallMethod(inCluster bool) string {
	if inCluster {
		return "helm"
	}
	if _, err := os.Stat("go.mod"); err == nil {
		return "dev"
	}
	return "binary"
}
