package agent

import (
	"context"
	"strings"
	"testing"
)

func TestChatViaOpenAICompatible_EmptyAPIKey(t *testing.T) {
	// Ensure no env key is set for "test-provider" so GetAPIKey returns "".
	req := &ChatRequest{Prompt: "Hello"}
	_, err := chatViaOpenAICompatible(context.Background(), req, "test-provider", "http://example.com", "TestAgent")
	if err == nil {
		t.Fatal("expected error for empty API key, got nil")
	}
	if !strings.Contains(err.Error(), "API key not configured for provider test-provider") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestStreamViaOpenAICompatible_EmptyAPIKey(t *testing.T) {
	// Ensure no env key is set for "test-provider" so GetAPIKey returns "".
	req := &ChatRequest{Prompt: "Hello"}
	_, err := streamViaOpenAICompatible(context.Background(), req, "test-provider", "http://example.com", "TestAgent", nil)
	if err == nil {
		t.Fatal("expected error for empty API key, got nil")
	}
	if !strings.Contains(err.Error(), "API key not configured for provider test-provider") {
		t.Errorf("unexpected error message: %v", err)
	}
}
