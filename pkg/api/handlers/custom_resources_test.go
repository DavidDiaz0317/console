package handlers

import (
	"io"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetCustomResources_InvalidGroupRejects(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/custom-resources", handler.GetCustomResources)

	// Group with a semicolon injection (%3B = ';') should be rejected
	req, err := http.NewRequest("GET", "/api/mcp/custom-resources?group=keda%3Bsh&version=v1alpha1&resource=scaledobjects", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	assert.Contains(t, string(body), "invalid group")
}

func TestGetCustomResources_InvalidVersionRejects(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/custom-resources", handler.GetCustomResources)

	// Version with uppercase letters should be rejected
	req, err := http.NewRequest("GET", "/api/mcp/custom-resources?group=keda.sh&version=V1ALPHA1&resource=scaledobjects", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	assert.Contains(t, string(body), "invalid version")
}

func TestGetCustomResources_InvalidResourceRejects(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/custom-resources", handler.GetCustomResources)

	// Resource with path separator should be rejected
	req, err := http.NewRequest("GET", "/api/mcp/custom-resources?group=keda.sh&version=v1alpha1&resource=scaled%2Fobjects", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	assert.Contains(t, string(body), "invalid resource")
}

func TestGetCustomResources_InvalidClusterRejects(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/custom-resources", handler.GetCustomResources)

	// Cluster with special characters should be rejected
	req, err := http.NewRequest("GET", "/api/mcp/custom-resources?group=keda.sh&version=v1alpha1&resource=scaledobjects&cluster=bad%3Bcluster", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	assert.Contains(t, string(body), "invalid cluster")
}

func TestGetCustomResources_InvalidNamespaceRejects(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/custom-resources", handler.GetCustomResources)

	// Namespace with uppercase letters should be rejected
	req, err := http.NewRequest("GET", "/api/mcp/custom-resources?group=keda.sh&version=v1alpha1&resource=scaledobjects&namespace=INVALID", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	assert.Contains(t, string(body), "invalid namespace")
}

func TestGetCustomResources_EmptyParamsReturnsEmptyList(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/custom-resources", handler.GetCustomResources)

	// Missing required GVR params should return empty list (not 400), for backwards compat
	req, err := http.NewRequest("GET", "/api/mcp/custom-resources", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestGetCustomResources_ValidGVRAccepted(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/custom-resources", handler.GetCustomResources)

	// Valid Kubernetes GVR parameters should pass validation (may get 503 without k8s client)
	req, err := http.NewRequest("GET", "/api/mcp/custom-resources?group=keda.sh&version=v1alpha1&resource=scaledobjects", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.NotEqual(t, http.StatusBadRequest, resp.StatusCode)
}
