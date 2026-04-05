package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
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
	assert.Equal(t, "Cluster is unreachable — check network connectivity", payload["errorMessage"])
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

// ──────────────────────────────────────────────────────────────────────────────
// Validation unit tests
// ──────────────────────────────────────────────────────────────────────────────

func TestValidateCluster(t *testing.T) {
	cases := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{"empty is valid (optional)", "", false},
		{"simple name", "my-cluster", false},
		{"dots allowed", "prod.k8s.example.com", false},
		{"underscores allowed", "gke_project_region_name", false},
		{"colons allowed (OpenShift)", "cluster:6443", false},
		{"too long", string(make([]byte, 513)), true},
		{"null byte rejected", "bad\x00cluster", true},
		{"newline rejected", "bad\ncluster", true},
		{"tab rejected", "bad\tcluster", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateCluster(tc.input)
			if tc.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestValidateNamespace(t *testing.T) {
	cases := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{"empty is valid (optional)", "", false},
		{"simple", "default", false},
		{"with hyphen", "kube-system", false},
		{"uppercase rejected", "MyNamespace", true},
		{"underscore rejected", "my_ns", true},
		{"dot rejected", "my.ns", true},
		{"too long (64 chars)", strings.Repeat("a", 64), true},
		{"starts with hyphen", "-bad", true},
		{"ends with hyphen", "bad-", true},
		{"special chars", "ns!@#", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateNamespace(tc.input)
			if tc.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestValidateResourceName(t *testing.T) {
	cases := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{"empty is valid (optional)", "", false},
		{"simple pod name", "my-pod-abc123", false},
		{"with dots", "my.pod.name", false},
		{"uppercase rejected", "MyPod", true},
		{"starts with hyphen", "-pod", true},
		{"ends with hyphen", "pod-", true},
		{"underscore rejected", "my_pod", true},
		{"too long (254 chars)", strings.Repeat("a", 254), true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateResourceName("pod", tc.input)
			if tc.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestValidateLimit(t *testing.T) {
	assert.NoError(t, validateLimit(1))
	assert.NoError(t, validateLimit(50))
	assert.NoError(t, validateLimit(1000))
	assert.Error(t, validateLimit(0))
	assert.Error(t, validateLimit(-1))
	assert.Error(t, validateLimit(1001))
}

func TestValidateLabelSelector(t *testing.T) {
	assert.NoError(t, validateLabelSelector(""))
	assert.NoError(t, validateLabelSelector("app=nginx"))
	assert.NoError(t, validateLabelSelector("env in (prod,staging)"))
	assert.Error(t, validateLabelSelector("bad\x00selector"))
	assert.Error(t, validateLabelSelector("bad\nselector"))
	assert.Error(t, validateLabelSelector(string(make([]byte, 513))))
}

func TestValidateWorkloadType(t *testing.T) {
	for _, valid := range []string{"", "deployment", "statefulset", "daemonset", "replicaset", "job", "cronjob"} {
		assert.NoError(t, validateWorkloadType(valid), "expected %q to be valid", valid)
	}
	for _, invalid := range []string{"pod", "service", "DEPLOYMENT", "../../etc", "deployment; DROP TABLE"} {
		assert.Error(t, validateWorkloadType(invalid), "expected %q to be invalid", invalid)
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// Handler-level validation integration tests
// ──────────────────────────────────────────────────────────────────────────────

func TestMCPGetPods_InvalidNamespaceReturns400(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods", handler.GetPods)

	req, err := http.NewRequest("GET", "/api/mcp/pods?namespace=INVALID_NS", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.NotEmpty(t, payload["error"])
}

func TestMCPGetPods_InvalidLabelSelectorReturns400(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods", handler.GetPods)

	req, err := http.NewRequest("GET", "/api/mcp/pods?labelSelector=bad%0Aselector", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.NotEmpty(t, payload["error"])
}

func TestMCPGetEvents_InvalidLimitReturns400(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/events", handler.GetEvents)

	req, err := http.NewRequest("GET", "/api/mcp/events?cluster=test-cluster&limit=9999", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.NotEmpty(t, payload["error"])
}

func TestMCPGetWorkloads_InvalidTypeReturns400(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/workloads", handler.GetWorkloads)

	req, err := http.NewRequest("GET", "/api/mcp/workloads?type=invalid-type", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.NotEmpty(t, payload["error"])
}

func TestMCPGetPodLogs_InvalidContainerReturns400(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pod-logs", handler.GetPodLogs)

	req, err := http.NewRequest("GET", "/api/mcp/pod-logs?cluster=test-cluster&namespace=default&pod=my-pod&container=INVALID_CONTAINER", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.NotEmpty(t, payload["error"])
}
