// Package handlers — GitHub Pipelines dashboard
//
// Go port of web/netlify/functions/github-pipelines.mts. Same six views,
// same response shapes, same behavior. Lets the /ci-cd pipeline cards
// work with live data in localhost and in-cluster deployments (the
// Netlify Function only covers console.kubestellar.io).
//
// If two versions drift, the Netlify function is the canonical source.
package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/client"
	"golang.org/x/sync/singleflight"
)

// Types, constants, and shared variables are in github_pipelines_types.go


func (h *ghpHistory) merge(runs []ghpWorkflowRun) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, r := range runs {
		if len(r.CreatedAt) < 10 {
			continue
		}
		day := r.CreatedAt[:10]
		byRepo, ok := h.days[r.Repo]
		if !ok {
			byRepo = make(map[string]map[string]ghpHistoryDay)
			h.days[r.Repo] = byRepo
		}
		byWF, ok := byRepo[r.Name]
		if !ok {
			byWF = make(map[string]ghpHistoryDay)
			byRepo[r.Name] = byWF
		}
		// When conclusion is nil but the run is actively executing, surface
		// "in_progress" instead of null so the matrix renders a blue dot
		// rather than a grey unknown dot.
		conclusion := r.Conclusion
		if conclusion == nil && (r.Status == "in_progress" || r.Status == "queued") {
			inProg := "in_progress"
			conclusion = &inProg
		}
		existing, had := byWF[day]
		if !had || r.ID > existing.RunID {
			byWF[day] = ghpHistoryDay{RunID: r.ID, Conclusion: conclusion, HTMLURL: r.HTMLURL}
		}
	}
	// Trim to retention window (UTC to match GitHub's ISO-8601 timestamps)
	cutoff := time.Now().UTC().AddDate(0, 0, -ghpHistoryRetentionDays).Format("2006-01-02")
	for repo, byRepo := range h.days {
		for wf, byWF := range byRepo {
			for d := range byWF {
				if d < cutoff {
					delete(byWF, d)
				}
			}
			if len(byWF) == 0 {
				delete(byRepo, wf)
			}
		}
		if len(byRepo) == 0 {
			delete(h.days, repo)
		}
	}
}

func (h *ghpHistory) snapshot() map[string]map[string]map[string]ghpHistoryDay {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make(map[string]map[string]map[string]ghpHistoryDay, len(h.days))
	for repo, byRepo := range h.days {
		rMap := make(map[string]map[string]ghpHistoryDay, len(byRepo))
		out[repo] = rMap
		for wf, byWF := range byRepo {
			wMap := make(map[string]ghpHistoryDay, len(byWF))
			rMap[wf] = wMap
			for d, v := range byWF {
				wMap[d] = v
			}
		}
	}
	return out
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

// GitHubPipelinesHandler serves /api/github-pipelines.
type GitHubPipelinesHandler struct {
	token         string
	mutationToken string
	httpClient    *http.Client
	history       *ghpHistory

	mu       sync.RWMutex
	cache    map[string]ghpCacheEntry // cacheKey -> entry
	fetchGrp singleflight.Group
}
// NewGitHubPipelinesHandler constructs the handler. `githubToken` is the
// read-only PAT. Mutation token comes from GITHUB_MUTATIONS_TOKEN env var
// — if unset, mutations return 503.
func NewGitHubPipelinesHandler(githubToken string) *GitHubPipelinesHandler {
	return &GitHubPipelinesHandler{
		token:         githubToken,
		mutationToken: os.Getenv("GITHUB_MUTATIONS_TOKEN"),
		httpClient:    client.GitHub,
		history:       newGHPHistory(),
		cache:         make(map[string]ghpCacheEntry),
	}
}

// HandleHealth validates the GitHub token by calling GitHub's /user endpoint.
// Returns 503 if token is missing or invalid, 200 if token is valid.
func (h *GitHubPipelinesHandler) HandleHealth(c *fiber.Ctx) error {
	if h.token == "" {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "GITHUB_TOKEN not configured"})
	}

	ctx, cancel := context.WithTimeout(c.UserContext(), 10*time.Second)
	defer cancel()

	res, err := h.ghGet(ctx, "/user")
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "GitHub token validation failed"})
	}
	defer res.Body.Close()

	if res.StatusCode >= 400 {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "GitHub token validation failed"})
	}

	return c.JSON(fiber.Map{"status": "ok"})
}

// Serve routes a request to the right view.
func (h *GitHubPipelinesHandler) Serve(c *fiber.Ctx) error {
	view := c.Query("view", "pulse")
	method := c.Method()

	if view == "mutate" {
		if method != fiber.MethodPost {
			return c.Status(fiber.StatusMethodNotAllowed).JSON(fiber.Map{"error": "Mutations require POST"})
		}
		return h.handleMutate(c)
	}
	if method != fiber.MethodGet {
		return c.Status(fiber.StatusMethodNotAllowed).JSON(fiber.Map{"error": "GET required"})
	}

	if h.token == "" {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "GITHUB_TOKEN not configured"})
	}

	switch view {
	case "pulse":
		return h.serveCached(c, h.cacheKey(c), h.buildPulse)
	case "matrix":
		return h.serveCached(c, h.cacheKey(c), h.buildMatrixFromQuery)
	case "flow":
		return h.serveCached(c, h.cacheKey(c), h.buildFlowFromQuery)
	case "failures":
		return h.serveCached(c, h.cacheKey(c), h.buildFailuresFromQuery)
	case "all":
		return h.serveCached(c, h.cacheKey(c), h.buildAll)
	case "log":
		return h.handleLog(c)
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid view parameter"})
	}
}

func (h *GitHubPipelinesHandler) cacheKey(c *fiber.Ctx) string {
	view := c.Query("view", "pulse")
	// Pulse cache key includes the current hour so it rotates hourly
	// and doesn't serve yesterday's release tag after a new nightly publishes.
	datePrefix := ""
	if view == "pulse" {
		datePrefix = time.Now().UTC().Format("2006-01-02T15")
	}
	return fmt.Sprintf("%s:%s:%s:%s:%s",
		view,
		datePrefix,
		c.Query("repo", "all"),
		c.Query("days"),
		c.Query("job"),
	)
}

func (h *GitHubPipelinesHandler) serveCached(c *fiber.Ctx, key string, build func(c *fiber.Ctx) (any, error)) error {
	// go/allocation-size-overflow: convert TTL to seconds via int64 (not int) and
	// clamp to 0 so the Sprintf value is always non-negative and never overflows.
	maxAge := int64(ghpCacheTTL.Seconds())
	if maxAge < 0 {
		maxAge = 0
	}

	h.mu.RLock()
	entry, ok := h.cache[key]
	h.mu.RUnlock()
	if ok && time.Now().Before(entry.exp) {
		c.Set("X-Cache", "HIT")
		c.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
		c.Set(fiber.HeaderCacheControl, fmt.Sprintf("public, max-age=%d", maxAge))
		return c.Send(entry.body)
	}

	// Coalesce concurrent cold fetches
	v, err, _ := h.fetchGrp.Do(key, func() (any, error) {
		return build(c)
	})
	if err != nil {
		// Try stale cache for GitHub API failures (rate limits, network errors)
		if stale := h.getStale(key); stale != nil {
			slog.Info("[github-pipelines] serving stale cache on error", "key", key, "error", err)
			c.Set("X-Cache", "STALE")
			c.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
			c.Set(fiber.HeaderCacheControl, fmt.Sprintf("public, max-age=%d", maxAge))
			return c.Send(stale.body)
		}
		// No stale available - return error
		// Distinguish client-validation errors (unknown repo, bad params) from
		// upstream GitHub failures so callers get the correct HTTP status.
		status := fiber.StatusBadGateway
		genericMsg := "failed to fetch pipeline data"
		if err.Error() == "unknown repo" {
			status = fiber.StatusBadRequest
			genericMsg = "unknown repo"
		}
		slog.Error("[GitHubPipelines] fetch failed", "error", err)
		return c.Status(status).JSON(fiber.Map{"error": genericMsg})
	}
	// Wrap payload with the repo list so the client reads it from the
	// response instead of hardcoding. Uses a two-step marshal: first the
	// inner payload, then merge with the repos envelope.
	inner, err := json.Marshal(v)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "marshal failed"})
	}
	// Build merged JSON: { ...payload, "repos": [...] }
	reposJSON, err := json.Marshal(ghpRepos)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "repos marshal failed"})
	}
	body := make([]byte, 0)
	if len(inner) > 2 && inner[0] == '{' {
		// Merge repos into existing object.
		// Guard against integer overflow before computing the allocation size
		// (go/allocation-size-overflow): both len values come from json.Marshal
		// on data that originates from a GitHub API response, so they are
		// bounded in practice, but CodeQL cannot prove that statically.
		const ghpMaxMergedBodyBytes = 100 * 1024 * 1024 // 100 MB hard cap
		if len(inner)+len(reposJSON)+12 > ghpMaxMergedBodyBytes {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "response too large"})
		}
		body = make([]byte, 0, len(inner)+len(reposJSON)+12)
		body = append(body, inner[:len(inner)-1]...) // strip trailing }
		body = append(body, `,"repos":`...)
		body = append(body, reposJSON...)
		body = append(body, '}')
	} else {
		body = inner
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "marshal failed"})
	}
	h.mu.Lock()
	h.cache[key] = ghpCacheEntry{body: body, exp: time.Now().Add(ghpCacheTTL)}
	h.mu.Unlock()
	c.Set("X-Cache", "MISS")
	c.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
	c.Set(fiber.HeaderCacheControl, fmt.Sprintf("public, max-age=%d", maxAge))
	// Forward GitHub rate limit headers from context if present
	if headers, ok := c.UserContext().Value(ghpRateLimitHeadersKey).(map[string]string); ok {
		for k, v := range headers {
			c.Set(k, v)
		}
	}
	return c.Send(body)
}

// getStale returns a cached entry even if expired, as long as it is within ghpCacheStaleTTL.
// Used to serve stale data when GitHub rate-limits us — better than an error.
func (h *GitHubPipelinesHandler) getStale(key string) *ghpCacheEntry {
	h.mu.RLock()
	defer h.mu.RUnlock()
	entry, ok := h.cache[key]
	if !ok {
		return nil
	}
	// Check if entry is within stale window (exp - TTL + staleTTL)
	staleCutoff := entry.exp.Add(-ghpCacheTTL).Add(ghpCacheStaleTTL)
	if time.Now().After(staleCutoff) {
		return nil
	}
	// Return a copy to prevent mutation after lock release
	// Note: cache stores values (not pointers like missions.go), so we create a new entry
	cp := entry
	return &cp
}

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

func (h *GitHubPipelinesHandler) ghGet(ctx context.Context, path string) (*http.Response, error) {
	ctx, cancel := context.WithTimeout(ctx, ghpHTTPTimeout)
	defer cancel()
	// Use net/url.Parse to check whether path is already an absolute URL instead
	// of a raw strings.HasPrefix("http") check, which CodeQL flags as
	// js/incomplete-url-substring-sanitization (issue #9119).
	fullURL := path
	if parsed, err := url.Parse(path); err != nil || parsed.Scheme == "" {
		fullURL = ghpGitHubAPIBase + path
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fullURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Authorization", "Bearer "+h.token)
	return h.httpClient.Do(req)
}

// ghGetWithRetry wraps ghGet with exponential-backoff retries on GitHub
// rate-limit responses (403 and 429). Per issue #9059, the GitHub Pipelines
// dashboard fails immediately on rate-limit errors even though the 5000/hour
// limit is temporary; a few retries usually succeed.
//
// Behavior:
//   - Non-rate-limit responses (including 2xx and other 4xx/5xx) are returned
//     directly so existing error handling is unchanged. Backward compatible
//     with ghGet — opt-in only.
//   - On 403/429, drains+closes the body and waits before retrying. If
//     the response carries a Retry-After header (seconds), that value is
//     honored (capped at GH_RETRY_MAX_DELAY_MS). Otherwise an exponential
//     backoff is used: GH_RETRY_BASE_DELAY_MS * 2^(attempt-1), capped at
//     GH_RETRY_MAX_DELAY_MS.
//   - Honors context cancellation during the backoff sleep so callers can
//     abort cleanly (no goroutine leak on request timeout).
//   - After GH_RETRY_MAX_ATTEMPTS, returns the last response (still
//     possibly 403/429) so the caller can surface the rate-limit error.
func (h *GitHubPipelinesHandler) ghGetWithRetry(ctx context.Context, path string) (*http.Response, error) {
	var lastResp *http.Response
	var lastErr error
	for attempt := 1; attempt <= GH_RETRY_MAX_ATTEMPTS; attempt++ {
		resp, err := h.ghGet(ctx, path)
		if err != nil {
			// Network/transport errors are not retried — same semantics as
			// ghGet. Caller decides whether to retry at a higher level.
			return nil, err
		}
		if resp.StatusCode != http.StatusForbidden && resp.StatusCode != http.StatusTooManyRequests {
			return resp, nil
		}
		// Rate-limited. If this is the final attempt, hand the response back
		// to the caller so its existing 4xx branch formats the error.
		lastErr = fmt.Errorf("github rate-limited (status %d)", resp.StatusCode)
		if attempt == GH_RETRY_MAX_ATTEMPTS {
			lastResp = resp
			break
		}
		// Compute backoff: prefer Retry-After header, else exponential.
		// Drain+close the body before sleeping so the connection can be reused.
		backoff := time.Duration(GH_RETRY_BASE_DELAY_MS*(1<<(attempt-1))) * time.Millisecond
		maxBackoff := time.Duration(GH_RETRY_MAX_DELAY_MS) * time.Millisecond
		if ra := resp.Header.Get("Retry-After"); ra != "" {
			if secs, parseErr := strconv.Atoi(strings.TrimSpace(ra)); parseErr == nil && secs > 0 {
				backoff = time.Duration(secs) * time.Second
			}
		}
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
		slog.Info("[github-pipelines] retrying after rate-limit",
			"path", path,
			"status", resp.StatusCode,
			"attempt", attempt,
			"maxAttempts", GH_RETRY_MAX_ATTEMPTS,
			"backoff", backoff,
		)
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
		select {
		case <-time.After(backoff):
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	return lastResp, lastErr
}

// ghpStoreRateLimitHeaders stores GitHub API rate limit headers in the context
// for later forwarding to the client response.
func ghpStoreRateLimitHeaders(ctx context.Context, resp *http.Response) context.Context {
	headers := make(map[string]string)
	for _, header := range []string{
		"X-RateLimit-Limit",
		"X-RateLimit-Remaining",
		"X-RateLimit-Reset",
		"X-RateLimit-Used",
	} {
		if v := resp.Header.Get(header); v != "" {
			headers[header] = v
		}
	}
	if len(headers) > 0 {
		return context.WithValue(ctx, ghpRateLimitHeadersKey, headers)
	}
	return ctx
}

// ghpForwardRateLimitHeaders forwards GitHub API rate limit headers from
// the context to the fiber response.
func ghpForwardRateLimitHeaders(c *fiber.Ctx, resp *http.Response) {
	for _, header := range []string{
		"X-RateLimit-Limit",
		"X-RateLimit-Remaining",
		"X-RateLimit-Reset",
		"X-RateLimit-Used",
	} {
		if v := resp.Header.Get(header); v != "" {
			c.Set(header, v)
		}
	}
}

// workflowRunsRaw is the subset of GitHub's workflow_run JSON we consume.
func normalizeRunRaw(r workflowRunRaw, repo string) ghpWorkflowRun {
	prs := make([]ghpPullRequestRef, 0)
	for _, pr := range r.PullRequests {
		prs = append(prs, ghpPullRequestRef{Number: pr.Number, URL: pr.URL})
	}
	// For push events (merge commits), the pull_requests array is empty.
	// Extract the PR number from the commit message pattern "feat: … (#1234)".
	if len(prs) == 0 && r.Event == "push" && r.HeadCommit.Message != "" {
		if m := ghpPRFromCommitRe.FindStringSubmatch(r.HeadCommit.Message); len(m) > 1 {
			n, _ := strconv.Atoi(m[1])
			if n > 0 {
				prs = append(prs, ghpPullRequestRef{
					Number: n,
					URL:    fmt.Sprintf("https://github.com/%s/pull/%d", repo, n),
				})
			}
		}
	}
	return ghpWorkflowRun{
		ID:           r.ID,
		Repo:         repo,
		Name:         r.Name,
		WorkflowID:   r.WorkflowID,
		HeadBranch:   r.HeadBranch,
		Status:       r.Status,
		Conclusion:   r.Conclusion,
		Event:        r.Event,
		RunNumber:    r.RunNumber,
		HTMLURL:      r.HTMLURL,
		CreatedAt:    r.CreatedAt,
		UpdatedAt:    r.UpdatedAt,
		PullRequests: prs,
	}
}
