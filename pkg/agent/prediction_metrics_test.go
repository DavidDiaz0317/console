package agent

import (
	"testing"
	"time"
)

func TestPredictionMetrics(t *testing.T) {
	// Call init
	InitPredictionMetrics()

	// Record some metrics
	RecordPrediction("restart", "high", "ai", "openai")
	RecordFeedback("helpful", "claude")
	RecordAnalysisDuration("openai", 2*time.Second)
	RecordAnalysisError("gemini", "timeout")
	RecordMetricsSnapshot()

	// Test SetActivePredictions
	preds := []AIPrediction{
		{Category: "restart", Severity: "high"},
		{Category: "resource", Severity: "medium"},
	}
	SetActivePredictions(preds)

	// Get handler (should not panic)
	handler := GetMetricsHandler()
	if handler == nil {
		t.Error("Metrics handler is nil")
	}
}

func TestSanitizeLabel(t *testing.T) {
	allowed := map[string]bool{"foo": true, "bar": true}

	tests := []struct {
		input string
		want  string
	}{
		{"foo", "foo"},
		{"bar", "bar"},
		{"baz", "unknown"},
		{"", "unknown"},
		{"FOO", "unknown"},
	}
	for _, tc := range tests {
		got := sanitizeLabel(tc.input, allowed)
		if got != tc.want {
			t.Errorf("sanitizeLabel(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

func TestSetActivePredictions_SanitizesLabels(t *testing.T) {
	InitPredictionMetrics()

	// Mix of valid and invalid category/severity values — must not panic.
	preds := []AIPrediction{
		{Category: "pod-crash", Severity: "critical"},        // valid
		{Category: "UNKNOWN_CATEGORY", Severity: "critical"}, // invalid category -> "unknown"
		{Category: "anomaly", Severity: "HIGH"},              // invalid severity -> "unknown"
		{Category: "evil|injection", Severity: "warning"},    // pipe in value -> sanitized to "unknown"
	}
	SetActivePredictions(preds)

	// Verify sanitization logic directly: invalid inputs produce "unknown"
	if got := sanitizeLabel("UNKNOWN_CATEGORY", allowedCategories); got != "unknown" {
		t.Errorf("expected 'unknown' for invalid category, got %q", got)
	}
	if got := sanitizeLabel("HIGH", allowedSeverities); got != "unknown" {
		t.Errorf("expected 'unknown' for invalid severity, got %q", got)
	}
	if got := sanitizeLabel("pod-crash", allowedCategories); got != "pod-crash" {
		t.Errorf("expected 'pod-crash' for valid category, got %q", got)
	}
}

func TestRecordPrediction_SanitizesLabels(t *testing.T) {
	InitPredictionMetrics()

	// Valid values should pass through unchanged.
	if got := sanitizeLabel("pod-crash", allowedCategories); got != "pod-crash" {
		t.Errorf("expected 'pod-crash', got %q", got)
	}
	if got := sanitizeLabel("warning", allowedSeverities); got != "warning" {
		t.Errorf("expected 'warning', got %q", got)
	}
	if got := sanitizeLabel("ai", allowedSources); got != "ai" {
		t.Errorf("expected 'ai', got %q", got)
	}
	if got := sanitizeLabel("openai", allowedProviders); got != "openai" {
		t.Errorf("expected 'openai', got %q", got)
	}

	// Invalid values must be mapped to "unknown".
	if got := sanitizeLabel("invalid-type", allowedCategories); got != "unknown" {
		t.Errorf("expected 'unknown' for invalid predType, got %q", got)
	}
	if got := sanitizeLabel("CRITICAL", allowedSeverities); got != "unknown" {
		t.Errorf("expected 'unknown' for invalid severity, got %q", got)
	}
	if got := sanitizeLabel("unknown-source", allowedSources); got != "unknown" {
		t.Errorf("expected 'unknown' for invalid source, got %q", got)
	}
	if got := sanitizeLabel("evil-provider", allowedProviders); got != "unknown" {
		t.Errorf("expected 'unknown' for invalid provider, got %q", got)
	}

	// Should not panic with any inputs.
	RecordPrediction("pod-crash", "warning", "ai", "openai")
	RecordPrediction("invalid-type", "CRITICAL", "unknown-source", "evil-provider")
}

func TestRecordFeedback_SanitizesLabels(t *testing.T) {
	InitPredictionMetrics()

	// Valid feedback passes through unchanged.
	if got := sanitizeLabel("accurate", allowedFeedback); got != "accurate" {
		t.Errorf("expected 'accurate', got %q", got)
	}

	// Invalid feedback -> "unknown".
	if got := sanitizeLabel("very-helpful!!!", allowedFeedback); got != "unknown" {
		t.Errorf("expected 'unknown' for invalid feedback, got %q", got)
	}

	// Should not panic with any inputs.
	RecordFeedback("accurate", "openai")
	RecordFeedback("very-helpful!!!", "openai")
}

func TestRecordAnalysisError_SanitizesLabels(t *testing.T) {
	InitPredictionMetrics()

	// Valid error type passes through.
	if got := sanitizeLabel("timeout", allowedErrorTypes); got != "timeout" {
		t.Errorf("expected 'timeout', got %q", got)
	}

	// Invalid error type -> "unknown".
	if got := sanitizeLabel("arbitrary-error", allowedErrorTypes); got != "unknown" {
		t.Errorf("expected 'unknown' for invalid errorType, got %q", got)
	}

	// Should not panic with any inputs.
	RecordAnalysisError("gemini", "timeout")
	RecordAnalysisError("gemini", "arbitrary-error")
}

