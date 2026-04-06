package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMCPValidation_InvalidClusterNameRejects(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods", handler.GetPods)

	// Special characters in cluster name should be rejected
	req, err := http.NewRequest("GET", "/api/mcp/pods?cluster=my%3Bcluster", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	assert.Contains(t, string(body), "invalid cluster")
}

func TestMCPValidation_InvalidNamespaceRejects(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods", handler.GetPods)

	// Namespace with uppercase letters should be rejected
	req, err := http.NewRequest("GET", "/api/mcp/pods?namespace=INVALID", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	assert.Contains(t, string(body), "invalid namespace")
}

func TestMCPValidation_ValidClusterAccepted(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods", handler.GetPods)

	// Valid k8s name should work normally
	req, err := http.NewRequest("GET", "/api/mcp/pods?cluster=test-cluster", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestMCPValidation_EmptyParamsAccepted(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods", handler.GetPods)

	// No cluster/namespace params (query all) should work
	req, err := http.NewRequest("GET", "/api/mcp/pods", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestMCPValidation_InvalidWorkloadTypeRejects(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/workloads", handler.GetWorkloads)

	req, err := http.NewRequest("GET", "/api/mcp/workloads?type=InvalidType", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	assert.Contains(t, string(body), "invalid type")
}

func TestMCPValidation_ValidWorkloadTypeAccepted(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/workloads", handler.GetWorkloads)

	for _, wt := range []string{"", "Deployment", "StatefulSet", "DaemonSet"} {
		url := "/api/mcp/workloads"
		if wt != "" {
			url += "?type=" + wt
		}
		req, err := http.NewRequest("GET", url, nil)
		require.NoError(t, err)

		resp, err := env.App.Test(req, 5000)
		require.NoError(t, err)
		assert.NotEqual(t, http.StatusBadRequest, resp.StatusCode,
			"workload type %q should be accepted", wt)
	}
}

func TestMCPValidation_InvalidLabelSelectorRejects(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods", handler.GetPods)

	// Semicolons should be rejected
	req, err := http.NewRequest("GET", "/api/mcp/pods?labelSelector=app%3Dfoo%3Bbar", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	assert.Contains(t, string(body), "invalid labelSelector")
}

func TestMCPValidation_EventsLimitTooHighRejects(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/events", handler.GetEvents)

	req, err := http.NewRequest("GET", "/api/mcp/events?limit=99999", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	assert.Contains(t, string(body), "invalid limit")
}

func TestMCPValidation_DemoModeBypassesValidation(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods", handler.GetPods)

	// Even with invalid params, demo mode should succeed (validation runs after demo check)
	req, err := http.NewRequest("GET", "/api/mcp/pods?cluster=INVALID", nil)
	require.NoError(t, err)
	req.Header.Set("X-Demo-Mode", "true")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "demo", payload["source"])
}

func TestMCPValidation_ClusterWithDotsAccepted(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/nodes", handler.GetNodes)

	// Cluster names with dots (e.g. "api.cluster.example.com") should be valid
	req, err := http.NewRequest("GET", "/api/mcp/nodes?cluster=api.cluster.example.com", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	// Should not be 400 — the cluster may not exist but validation should pass
	assert.NotEqual(t, http.StatusBadRequest, resp.StatusCode)
}

// ---------------------------------------------------------------------------
// Cron schedule validation unit tests
// ---------------------------------------------------------------------------

func TestMCPValidateCronSchedule_EmptyAllowed(t *testing.T) {
	// Empty schedule is valid — the caller will use the default
	assert.NoError(t, mcpValidateCronSchedule(""))
}

func TestMCPValidateCronSchedule_ValidExpressions(t *testing.T) {
	valid := []string{
		"*/5 * * * *",     // every 5 minutes
		"0 2 * * *",       // daily at 02:00
		"0 0 * * 0",       // weekly on Sunday
		"30 8 * * 1-5",    // weekdays at 08:30
		"0 */6 * * *",     // every 6 hours
		"0 0 1 * *",       // first of each month
		"1,2,3 * * * *",   // minutes 1, 2, 3
		"0-30 * * * *",    // minutes 0 through 30
		"*/10 0-5 * * *",  // every 10 minutes during hours 0-5
	}
	for _, s := range valid {
		assert.NoError(t, mcpValidateCronSchedule(s), "expected %q to be valid", s)
	}
}

func TestMCPValidateCronSchedule_TooManyFields(t *testing.T) {
	err := mcpValidateCronSchedule("* * * * * * * * *")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "5 fields")
}

func TestMCPValidateCronSchedule_TooFewFields(t *testing.T) {
	err := mcpValidateCronSchedule("* * *")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "5 fields")
}

func TestMCPValidateCronSchedule_InvalidField(t *testing.T) {
	invalid := []string{
		"abc * * * *",     // non-numeric field
		"* * * * rm -rf",  // shell injection attempt
		"* * * * ?",        // question mark not allowed
		"* * * * @reboot",  // @reboot macro not supported
	}
	for _, s := range invalid {
		err := mcpValidateCronSchedule(s)
		require.Error(t, err, "expected %q to be invalid", s)
		assert.Contains(t, err.Error(), "invalid schedule", "expected 'invalid schedule' in error for %q", s)
	}
}

func TestMCPValidateCronSchedule_TooLong(t *testing.T) {
	long := "* * * * " + string(make([]byte, mcpMaxCronScheduleLen))
	err := mcpValidateCronSchedule(long)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "exceeds maximum length")
}

// ---------------------------------------------------------------------------
// InstallGPUHealthCronJob handler schedule-validation integration test
// ---------------------------------------------------------------------------

func TestInstallGPUHealthCronJob_InvalidScheduleRejects(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Post("/api/mcp/gpu/cronjob/install", handler.InstallGPUHealthCronJob)

	body := `{"cluster":"test-cluster","namespace":"default","schedule":"* * * * * * * * *","tier":1}`
	req, err := http.NewRequest("POST", "/api/mcp/gpu/cronjob/install", strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	b, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	assert.Contains(t, string(b), "invalid schedule")
}

func TestInstallGPUHealthCronJob_ValidSchedulePassesValidation(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Post("/api/mcp/gpu/cronjob/install", handler.InstallGPUHealthCronJob)

	body := `{"cluster":"test-cluster","namespace":"default","schedule":"*/5 * * * *","tier":1}`
	req, err := http.NewRequest("POST", "/api/mcp/gpu/cronjob/install", strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	// Validation passes; downstream k8s call may fail, but it must not be a 400 from schedule validation
	assert.NotEqual(t, http.StatusBadRequest, resp.StatusCode)
}
