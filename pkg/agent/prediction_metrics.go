package agent

import (
	"net/http"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Allowlists for Prometheus label values to prevent unbounded cardinality.
// Any value not in the allowlist is replaced with "unknown".
var (
	allowedCategories = map[string]bool{
		"pod-crash":            true,
		"node-pressure":        true,
		"gpu-exhaustion":       true,
		"resource-exhaustion":  true,
		"resource-trend":       true,
		"capacity-risk":        true,
		"anomaly":              true,
	}

	allowedSeverities = map[string]bool{
		"warning":  true,
		"critical": true,
	}

	allowedSources = map[string]bool{
		"heuristic": true,
		"ai":        true,
	}

	allowedFeedback = map[string]bool{
		"accurate":   true,
		"inaccurate": true,
	}

	// allowedErrorTypes lists the error categories for AI analysis failures.
	allowedErrorTypes = map[string]bool{
		"timeout":        true,
		"rate_limit":     true,
		"parse_error":    true,
		"network":        true,
		"auth":           true,
		"quota_exceeded": true,
		"unavailable":    true,
	}

	// allowedProviders lists every registered AI provider name.
	// Add new entries here whenever a new provider is added to the registry.
	allowedProviders = map[string]bool{
		"antigravity":  true,
		"bob":          true,
		"claude":       true,
		"claude-code":  true,
		"claude-desktop": true,
		"cline":        true,
		"codex":        true,
		"continue":     true,
		"copilot-cli":  true,
		"cursor":       true,
		"gemini":       true,
		"gemini-cli":   true,
		"gh-copilot":   true,
		"goose":        true,
		"jetbrains":    true,
		"open-webui":   true,
		"openai":       true,
		"raycast":      true,
		"vscode":       true,
		"windsurf":     true,
		"zed":          true,
	}
)

// sanitizeLabel returns value if it exists in the allowed set, otherwise "unknown".
// This prevents unbounded label cardinality in Prometheus metrics.
func sanitizeLabel(value string, allowed map[string]bool) string {
	if allowed[value] {
		return value
	}
	return "unknown"
}

var (
	// Prediction counters
	predictionsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "kc_predictions_total",
			Help: "Total number of predictions generated",
		},
		[]string{"type", "severity", "source", "provider"},
	)

	// Current predictions gauge
	predictionsActive = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "kc_predictions_active",
			Help: "Current number of active predictions",
		},
		[]string{"type", "severity", "source"},
	)

	// Prediction feedback
	predictionFeedback = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "kc_prediction_feedback_total",
			Help: "Total feedback received on predictions",
		},
		[]string{"feedback", "provider"},
	)

	// AI analysis timing
	aiAnalysisDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "kc_ai_analysis_duration_seconds",
			Help:    "Duration of AI prediction analysis",
			Buckets: prometheus.ExponentialBuckets(1, 2, 8), // 1, 2, 4, 8, 16, 32, 64, 128 seconds
		},
		[]string{"provider"},
	)

	// AI analysis errors
	aiAnalysisErrors = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "kc_ai_analysis_errors_total",
			Help: "Total AI analysis errors",
		},
		[]string{"provider", "error_type"},
	)

	// Metrics history snapshots
	metricsSnapshotsTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "kc_metrics_snapshots_total",
			Help: "Total metrics snapshots captured",
		},
	)

	metricsInit sync.Once
)

// InitPredictionMetrics registers all prediction-related Prometheus metrics
func InitPredictionMetrics() {
	metricsInit.Do(func() {
		prometheus.MustRegister(predictionsTotal)
		prometheus.MustRegister(predictionsActive)
		prometheus.MustRegister(predictionFeedback)
		prometheus.MustRegister(aiAnalysisDuration)
		prometheus.MustRegister(aiAnalysisErrors)
		prometheus.MustRegister(metricsSnapshotsTotal)
	})
}

// RecordPrediction records a new prediction in metrics.
// Category, severity, source, and provider are validated against known allowlists to
// prevent unbounded Prometheus label cardinality.
func RecordPrediction(predType, severity, source, provider string) {
	predictionsTotal.WithLabelValues(
		sanitizeLabel(predType, allowedCategories),
		sanitizeLabel(severity, allowedSeverities),
		sanitizeLabel(source, allowedSources),
		sanitizeLabel(provider, allowedProviders),
	).Inc()
}

// SetActivePredictions updates the gauge of active predictions.
// Category and severity are validated against known allowlists to prevent
// unbounded Prometheus label cardinality from AI-controlled values.
func SetActivePredictions(predictions []AIPrediction) {
	// Reset all gauges
	predictionsActive.Reset()

	// Count by type, severity, source
	counts := make(map[string]float64)
	for _, p := range predictions {
		cat := sanitizeLabel(p.Category, allowedCategories)
		sev := sanitizeLabel(p.Severity, allowedSeverities)
		key := cat + "|" + sev + "|ai"
		counts[key]++
	}

	for key, count := range counts {
		parts := splitKey(key)
		if len(parts) == 3 {
			predictionsActive.WithLabelValues(parts[0], parts[1], parts[2]).Set(count)
		}
	}
}

// RecordFeedback records prediction feedback in metrics.
// Feedback and provider are validated against known allowlists to prevent unbounded cardinality.
func RecordFeedback(feedback, provider string) {
	predictionFeedback.WithLabelValues(
		sanitizeLabel(feedback, allowedFeedback),
		sanitizeLabel(provider, allowedProviders),
	).Inc()
}

// RecordAnalysisDuration records the time taken for AI analysis.
// Provider is validated against the known allowlist to prevent unbounded cardinality.
func RecordAnalysisDuration(provider string, duration time.Duration) {
	aiAnalysisDuration.WithLabelValues(sanitizeLabel(provider, allowedProviders)).Observe(duration.Seconds())
}

// RecordAnalysisError records an AI analysis error.
// Provider and errorType are validated against known allowlists to prevent unbounded cardinality.
func RecordAnalysisError(provider, errorType string) {
	aiAnalysisErrors.WithLabelValues(
		sanitizeLabel(provider, allowedProviders),
		sanitizeLabel(errorType, allowedErrorTypes),
	).Inc()
}

// RecordMetricsSnapshot records a metrics snapshot capture
func RecordMetricsSnapshot() {
	metricsSnapshotsTotal.Inc()
}

// GetMetricsHandler returns the Prometheus HTTP handler
func GetMetricsHandler() http.Handler {
	InitPredictionMetrics()
	return promhttp.Handler()
}

// Helper function to split a pipe-delimited key
func splitKey(key string) []string {
	var parts []string
	var current []rune
	for _, r := range key {
		if r == '|' {
			parts = append(parts, string(current))
			current = nil
		} else {
			current = append(current, r)
		}
	}
	parts = append(parts, string(current))
	return parts
}
