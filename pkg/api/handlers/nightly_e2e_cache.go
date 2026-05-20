package handlers

import (
	"context"
	"log/slog"
	"time"

	"github.com/kubestellar/console/pkg/safego"
)

const prewarmTimeout = 30 * time.Second

func (h *NightlyE2EHandler) prewarm() {
	// #7052 — Use a cancellable context so that on timeout, all goroutines
	// spawned by fetchAllWithContext are cancelled instead of abandoned.
	ctx, cancel := context.WithTimeout(context.Background(), prewarmTimeout)
	defer cancel()

	done := make(chan struct{})
	var resp *NightlyE2EResponse
	var fetchErr error

	safego.Go(func() {
		resp, fetchErr = h.fetchAllWithContext(ctx)
		close(done)
	})

	select {
	case <-done:
		if fetchErr != nil {
			slog.Warn("[NightlyE2E] prewarm failed", "error", fetchErr)
			return
		}
	case <-ctx.Done():
		slog.Warn("[NightlyE2E] prewarm timed out", "timeout", prewarmTimeout)
		return
	}

	ttl := nightlyCacheIdleTTL
	if hasInProgressRuns(resp.Guides) {
		ttl = nightlyCacheActiveTTL
	}
	h.mu.Lock()
	h.cache = resp
	h.cacheExp = time.Now().Add(ttl)
	h.mu.Unlock()
}

// getGuideImages returns cached image maps or fetches fresh ones from GitHub.
func (h *NightlyE2EHandler) getGuideImages() map[string]map[string]string {
	h.imgMu.RLock()
	if h.imgCache != nil && time.Now().Before(h.imgCacheExp) {
		result := h.imgCache
		h.imgMu.RUnlock()
		return result
	}
	h.imgMu.RUnlock()

	images := h.fetchAllGuideImages()

	h.imgMu.Lock()
	h.imgCache = images
	h.imgCacheExp = time.Now().Add(imageCacheTTL)
	h.imgMu.Unlock()

	return images
}

// fetchAllWithContext is the context-aware fetch used by both the handler and
// prewarm paths (#7052).
// When ctx is cancelled, HTTP requests made by sub-goroutines will be
// interrupted instead of running to completion.
func (h *NightlyE2EHandler) fetchAllWithContext(ctx context.Context) (*NightlyE2EResponse, error) {
	type result struct {
		idx  int
		runs []NightlyRun
		err  error
	}

	// Fetch workflow runs and guide images concurrently.
	// #7052 — Check context before spawning goroutines and bail early on
	// cancellation so prewarm timeouts don't leave goroutines running.
	ch := make(chan result, len(nightlyWorkflows))
	for i, wf := range nightlyWorkflows {
		safego.GoWith("nightly-e2e-fetch-workflow", func() {
			select {
			case <-ctx.Done():
				ch <- result{idx: i, err: ctx.Err()}
				return
			default:
			}
			runs, err := h.fetchWorkflowRuns(wf)
			ch <- result{idx: i, runs: runs, err: err}
		})
	}

	// Fetch dynamic image tags (cached separately with longer TTL)
	guideImages := h.getGuideImages()

	// Collect results
	runsByIdx := make(map[int][]NightlyRun, len(nightlyWorkflows))
	for range nightlyWorkflows {
		r := <-ch
		if r.err == nil {
			runsByIdx[r.idx] = r.runs
		}
	}

	guides := make([]NightlyGuideStatus, len(nightlyWorkflows))
	for i, wf := range nightlyWorkflows {
		runs := runsByIdx[i]
		if runs == nil {
			runs = []NightlyRun{}
		}
		var latest *string
		if len(runs) > 0 {
			if runs[0].Conclusion != nil {
				latest = runs[0].Conclusion
			} else {
				s := runs[0].Status
				latest = &s
			}
		}

		// Use dynamically fetched images for this guide
		images := guideImages[wf.GuidePath]
		if images == nil {
			images = map[string]string{}
		}

		guides[i] = NightlyGuideStatus{
			Guide:            wf.Guide,
			Acronym:          wf.Acronym,
			Platform:         wf.Platform,
			Repo:             wf.Repo,
			WorkflowFile:     wf.WorkflowFile,
			Runs:             runs,
			PassRate:         computePassRate(runs),
			Trend:            computeTrend(runs),
			LatestConclusion: latest,
			Model:            wf.Model,
			GPUType:          wf.GPUType,
			GPUCount:         wf.GPUCount,
			LLMDImages:       images,
			OtherImages:      wf.OtherImages,
		}
	}

	return &NightlyE2EResponse{
		Guides:    guides,
		CachedAt:  time.Now().UTC().Format(time.RFC3339),
		FromCache: false,
	}, nil
}
