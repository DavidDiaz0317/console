package agent

import (
	"strings"
	"testing"
)

func TestBuildPromptWithHistoryGeneric_UnknownRoleSkipped(t *testing.T) {
	req := &ChatRequest{
		Prompt:       "Hello",
		SystemPrompt: "You are helpful.",
		History: []ChatMessage{
			{Role: "user", Content: "What is Kubernetes?"},
			{Role: "assistant", Content: "It is an orchestration platform."},
			{Role: "tool", Content: "This should be skipped."},
			{Role: "function", Content: "This should also be skipped."},
		},
	}

	result := buildPromptWithHistoryGeneric(req)

	// Unknown role content must not appear in the prompt
	if strings.Contains(result, "This should be skipped.") {
		t.Error("expected message with unknown role 'tool' to be skipped, but its content appears in the prompt")
	}
	if strings.Contains(result, "This should also be skipped.") {
		t.Error("expected message with unknown role 'function' to be skipped, but its content appears in the prompt")
	}

	// Known roles must still appear
	if !strings.Contains(result, "What is Kubernetes?") {
		t.Error("expected user message content to appear in the prompt")
	}
	if !strings.Contains(result, "It is an orchestration platform.") {
		t.Error("expected assistant message content to appear in the prompt")
	}
}

func TestBuildPromptWithHistoryGeneric_KnownRolesLabeled(t *testing.T) {
	req := &ChatRequest{
		Prompt:       "Follow up",
		SystemPrompt: "Be concise.",
		History: []ChatMessage{
			{Role: "user", Content: "user message"},
			{Role: "assistant", Content: "assistant message"},
			{Role: "system", Content: "system message"},
		},
	}

	result := buildPromptWithHistoryGeneric(req)

	if !strings.Contains(result, "User: user message") {
		t.Error("expected 'User: ' label for user role")
	}
	if !strings.Contains(result, "Assistant: assistant message") {
		t.Error("expected 'Assistant: ' label for assistant role")
	}
	if !strings.Contains(result, "System: system message") {
		t.Error("expected 'System: ' label for system role")
	}
}
