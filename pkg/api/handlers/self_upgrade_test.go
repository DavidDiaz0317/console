package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestImageTagValidation_RejectsPathTraversal(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewSelfUpgradeHandler(nil, env.Hub)
	env.App.Post("/api/self-upgrade/trigger", handler.TriggerUpgrade)

	maliciousTags := []string{
		"../../attacker:v1",
		"../../attacker-repo:evil",
		"../evil",
		"ghcr.io/attacker/console:v1",
		"image@sha256:abc",
		"my:tag",
		"tag with spaces",
		"tag\twith\ttabs",
		"tag\nwith\nnewlines",
		"tag\"with\"quotes",
		"tag'with'quotes",
		"tag\\with\\backslash",
		"tag{with}braces",
		"",
	}

	for _, tag := range maliciousTags {
		tag := tag
		t.Run(fmt.Sprintf("rejects_%q", tag), func(t *testing.T) {
			body, err := json.Marshal(map[string]string{"imageTag": tag})
			require.NoError(t, err)

			req, err := http.NewRequest("POST", "/api/self-upgrade/trigger", bytes.NewReader(body))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")

			resp, err := env.App.Test(req, 5000)
			require.NoError(t, err)
			assert.Equal(t, http.StatusBadRequest, resp.StatusCode,
				"imageTag %q should be rejected", tag)
		})
	}
}

func TestImageTagValidation_AcceptsValidTags(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewSelfUpgradeHandler(nil, env.Hub)
	env.App.Post("/api/self-upgrade/trigger", handler.TriggerUpgrade)

	validTags := []string{
		"v0.3.12",
		"v0.3.12-nightly.20260312",
		"latest",
		"1.0.0",
		"v1",
		"release-2024.01.01",
		"abc123",
		"v2.0.0-alpha.1",
		"build_456",
	}

	for _, tag := range validTags {
		tag := tag
		t.Run(fmt.Sprintf("accepts_%q", tag), func(t *testing.T) {
			body, err := json.Marshal(map[string]string{"imageTag": tag})
			require.NoError(t, err)

			req, err := http.NewRequest("POST", "/api/self-upgrade/trigger", bytes.NewReader(body))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")

			resp, err := env.App.Test(req, 5000)
			require.NoError(t, err)
			// Should not be rejected with 400 due to validation
			// (may fail with 400 "not running in-cluster" which is fine)
			if resp.StatusCode == http.StatusBadRequest {
				var result map[string]interface{}
				require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
				assert.NotEqual(t, "invalid imageTag format", result["error"],
					"valid tag %q should pass imageTag format validation", tag)
			}
		})
	}
}

func TestImageTagRegex_DirectValidation(t *testing.T) {
	validTags := []string{
		"v0.3.12",
		"v0.3.12-nightly.20260312",
		"latest",
		"1.0.0",
		"v1",
		"release-2024.01.01",
		"abc123",
		"v2.0.0-alpha.1",
		"build_456",
		"a",
	}
	for _, tag := range validTags {
		assert.True(t, imageTagRegex.MatchString(tag), "tag %q should be valid", tag)
	}

	invalidTags := []string{
		"",
		"../../attacker:v1",
		"ghcr.io/attacker/console:v1",
		"image@sha256:abc",
		"my:tag",
		"tag with spaces",
		".starts-with-dot",
		"-starts-with-dash",
		"tag\twith\ttab",
	}
	for _, tag := range invalidTags {
		assert.False(t, imageTagRegex.MatchString(tag), "tag %q should be invalid", tag)
	}
}
