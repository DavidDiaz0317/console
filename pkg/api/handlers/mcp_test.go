package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/runtime"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

func TestWaitWithDeadline_CompletesBeforeDeadline(t *testing.T) {
	var wg sync.WaitGroup
	wg.Add(1)

	_, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		defer wg.Done()
		time.Sleep(5 * time.Millisecond)
	}()

	timedOut := waitWithDeadline(&wg, cancel, 200*time.Millisecond)
	assert.False(t, timedOut)
}

func TestWaitWithDeadline_DeadlineHit(t *testing.T) {
	var wg sync.WaitGroup
	wg.Add(1)

	_, cancel := context.WithCancel(context.Background())
	defer cancel()

	timedOut := waitWithDeadline(&wg, cancel, 10*time.Millisecond)
	assert.True(t, timedOut)

	wg.Done()
}

func TestWaitWithDeadline_CancelledOnDeadline(t *testing.T) {
	var wg sync.WaitGroup
	wg.Add(1)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cancelled := make(chan struct{})
	go func() {
		defer wg.Done()
		<-ctx.Done()
		close(cancelled)
	}()

	timedOut := waitWithDeadline(&wg, cancel, 20*time.Millisecond)
	assert.True(t, timedOut)

	select {
	case <-cancelled:
		// goroutine was cancelled as expected
	case <-time.After(200 * time.Millisecond):
		t.Error("goroutine was not cancelled after deadline")
	}
}

func TestMCPGetPods_DemoModeReturnsDemoData(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods", handler.GetPods)

	req, err := http.NewRequest("GET", "/api/mcp/pods", nil)
	require.NoError(t, err)
	req.Header.Set("X-Demo-Mode", "true")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)

	var payload map[string]interface{}
	require.NoError(t, json.Unmarshal(body, &payload))
	assert.Equal(t, "demo", payload["source"])

	pods, ok := payload["pods"].([]interface{})
	require.True(t, ok)
	assert.NotEmpty(t, pods)
}

func TestMCPGetPods_NoClusterAccessReturns503(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, nil)
	env.App.Get("/api/mcp/pods", handler.GetPods)

	req, err := http.NewRequest("GET", "/api/mcp/pods", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "No cluster access available", payload["error"])
}

func TestMCPGetPods_SingleClusterEmptyIsArray(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods", handler.GetPods)

	req, err := http.NewRequest("GET", "/api/mcp/pods?cluster=test-cluster", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "k8s", payload["source"])

	pods, ok := payload["pods"].([]interface{})
	require.True(t, ok, "pods should be a JSON array, not null")
	assert.Len(t, pods, 0)
}

func TestMCPGetPods_InternalErrorIsSanitized(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods", handler.GetPods)

	k8sClient, err := env.K8sClient.GetClient("test-cluster")
	require.NoError(t, err)

	fakeClient, ok := k8sClient.(*k8sfake.Clientset)
	require.True(t, ok, "expected fake clientset for test-cluster")

	fakeClient.PrependReactor("list", "pods", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("forced pods list error")
	})

	req, err := http.NewRequest("GET", "/api/mcp/pods?cluster=test-cluster", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "internal server error", payload["error"])
}

func TestMCPGetPods_NetworkErrorReturnsUnavailable(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods", handler.GetPods)

	k8sClient, err := env.K8sClient.GetClient("test-cluster")
	require.NoError(t, err)

	fakeClient, ok := k8sClient.(*k8sfake.Clientset)
	require.True(t, ok, "expected fake clientset for test-cluster")

	// Simulate a network error (connection refused) — should NOT return 500
	fakeClient.PrependReactor("list", "pods", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("dial tcp 127.0.0.1:6443: connect: connection refused")
	})

	req, err := http.NewRequest("GET", "/api/mcp/pods?cluster=test-cluster", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode, "network errors should return 200, not 500")

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "unavailable", payload["clusterStatus"])
	assert.Equal(t, "network", payload["errorType"])
	assert.Contains(t, payload["errorMessage"], "connection refused")
}

func TestMCPGetDaemonSets_SingleClusterEmptyIsArray(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/daemonsets", handler.GetDaemonSets)

	req, err := http.NewRequest("GET", "/api/mcp/daemonsets?cluster=test-cluster", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "k8s", payload["source"])

	items, ok := payload["daemonsets"].([]interface{})
	require.True(t, ok, "daemonsets should be a JSON array, not null")
	assert.Len(t, items, 0)
}

func TestMCPGetEvents_SingleClusterEmptyIsArray(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/events", handler.GetEvents)

	req, err := http.NewRequest("GET", "/api/mcp/events?cluster=test-cluster&limit=10", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "k8s", payload["source"])
	assert.Equal(t, "test-cluster", payload["cluster"])

	events, ok := payload["events"].([]interface{})
	require.True(t, ok, "events should be a JSON array, not null")
	assert.Len(t, events, 0)
}

func TestMCPGetEvents_NetworkErrorReturnsUnavailable(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/events", handler.GetEvents)

	k8sClient, err := env.K8sClient.GetClient("test-cluster")
	require.NoError(t, err)

	fakeClient, ok := k8sClient.(*k8sfake.Clientset)
	require.True(t, ok, "expected fake clientset for test-cluster")

	// Simulate a connection-refused error — should NOT return 500
	fakeClient.PrependReactor("list", "events", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("dial tcp 127.0.0.1:6443: connect: connection refused")
	})

	req, err := http.NewRequest("GET", "/api/mcp/events?cluster=test-cluster&limit=10", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode, "network errors should return 200, not 500")

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "unavailable", payload["clusterStatus"])
	assert.Equal(t, "network", payload["errorType"])
}

func TestMCPGetNodes_NetworkErrorReturnsUnavailable(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/nodes", handler.GetNodes)

	k8sClient, err := env.K8sClient.GetClient("test-cluster")
	require.NoError(t, err)

	fakeClient, ok := k8sClient.(*k8sfake.Clientset)
	require.True(t, ok, "expected fake clientset for test-cluster")

	// Simulate a connection-refused error — should NOT return 500
	fakeClient.PrependReactor("list", "nodes", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("dial tcp 10.0.0.1:443: connect: connection refused")
	})

	req, err := http.NewRequest("GET", "/api/mcp/nodes?cluster=test-cluster", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode, "network errors should return 200, not 500")

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "unavailable", payload["clusterStatus"])
	assert.Equal(t, "network", payload["errorType"])
}

func TestMCPGetPods_AuthErrorReturnsUnavailable(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods", handler.GetPods)

	k8sClient, err := env.K8sClient.GetClient("test-cluster")
	require.NoError(t, err)

	fakeClient, ok := k8sClient.(*k8sfake.Clientset)
	require.True(t, ok, "expected fake clientset for test-cluster")

	// Simulate an auth error — should NOT return 500
	fakeClient.PrependReactor("list", "pods", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("Unauthorized: token expired")
	})

	req, err := http.NewRequest("GET", "/api/mcp/pods?cluster=test-cluster", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode, "auth errors should return 200, not 500")

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "unavailable", payload["clusterStatus"])
	assert.Equal(t, "auth", payload["errorType"])
}

// TestMCPGetPods_MultiCluster_PartialFailureSetsPartialFlag verifies that when one
// cluster in an all-cluster query fails, the response still contains data from the
// healthy cluster, sets partial=true, and includes a clusterErrors entry.
func TestMCPGetPods_MultiCluster_PartialFailureSetsPartialFlag(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods", handler.GetPods)

	// Add a second cluster that will fail
	addClusterToRawConfig(env.K8sClient, "bad-cluster")
	badFake := k8sfake.NewSimpleClientset()
	env.K8sClient.InjectClient("bad-cluster", badFake)
	badFake.PrependReactor("list", "pods", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("dial tcp 10.0.0.2:6443: connect: connection refused")
	})

	// All-clusters query (no cluster param)
	req, err := http.NewRequest("GET", "/api/mcp/pods", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 10000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "k8s", payload["source"])
	assert.Equal(t, true, payload["partial"], "partial flag should be set when a cluster fails")

	clusterErrors, ok := payload["clusterErrors"].([]interface{})
	require.True(t, ok, "clusterErrors should be a JSON array")
	require.Len(t, clusterErrors, 1)

	clusterErr, ok := clusterErrors[0].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, "bad-cluster", clusterErr["cluster"])
	assert.Equal(t, "network", clusterErr["errorType"])
	assert.NotEmpty(t, clusterErr["errorMessage"])
}

// TestMCPGetPods_MultiCluster_AllSuccessNoPartialFlag verifies that when all clusters
// succeed, the partial flag is absent from the response.
func TestMCPGetPods_MultiCluster_AllSuccessNoPartialFlag(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods", handler.GetPods)

	req, err := http.NewRequest("GET", "/api/mcp/pods", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 10000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "k8s", payload["source"])
	_, hasPartial := payload["partial"]
	assert.False(t, hasPartial, "partial flag should not be present when all clusters succeed")
	_, hasClusterErrors := payload["clusterErrors"]
	assert.False(t, hasClusterErrors, "clusterErrors should not be present when all clusters succeed")
}

// TestMCPGetDeployments_MultiCluster_PartialFailureSetsPartialFlag verifies partial
// failure tracking for GetDeployments.
func TestMCPGetDeployments_MultiCluster_PartialFailureSetsPartialFlag(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/deployments", handler.GetDeployments)

	addClusterToRawConfig(env.K8sClient, "bad-cluster")
	badFake := k8sfake.NewSimpleClientset()
	env.K8sClient.InjectClient("bad-cluster", badFake)
	badFake.PrependReactor("list", "deployments", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("dial tcp 10.0.0.2:6443: connect: connection refused")
	})

	req, err := http.NewRequest("GET", "/api/mcp/deployments", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 10000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, true, payload["partial"])

	clusterErrors, ok := payload["clusterErrors"].([]interface{})
	require.True(t, ok)
	require.Len(t, clusterErrors, 1)
	clusterErr := clusterErrors[0].(map[string]interface{})
	assert.Equal(t, "bad-cluster", clusterErr["cluster"])
	assert.Equal(t, "network", clusterErr["errorType"])
}
