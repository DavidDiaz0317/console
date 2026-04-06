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

	// Mix of valid and invalid category/severity values
	preds := []AIPrediction{
		{Category: "pod-crash", Severity: "critical"},       // valid
		{Category: "UNKNOWN_CATEGORY", Severity: "critical"}, // invalid category -> "unknown"
		{Category: "anomaly", Severity: "HIGH"},              // invalid severity -> "unknown"
		{Category: "evil|injection", Severity: "warning"},   // pipe in value -> sanitized to "unknown"
	}
	// Should not panic
	SetActivePredictions(preds)
}

func TestRecordPrediction_SanitizesLabels(t *testing.T) {
	InitPredictionMetrics()

	// Valid values should be accepted without panic
	RecordPrediction("pod-crash", "warning", "ai", "openai")

	// Invalid values should be mapped to "unknown" without panic
	RecordPrediction("invalid-type", "CRITICAL", "unknown-source", "openai")
}

func TestRecordFeedback_SanitizesLabels(t *testing.T) {
	InitPredictionMetrics()

	// Valid feedback
	RecordFeedback("accurate", "openai")

	// Invalid feedback -> mapped to "unknown"
	RecordFeedback("very-helpful!!!", "openai")
}

