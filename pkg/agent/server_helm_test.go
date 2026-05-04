package agent

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"strings"
	"testing"
)

func TestValidateHelmK8sName(t *testing.T) {
	tests := []struct {
		name    string
		val     string
		field   string
		wantErr bool
	}{
		{"empty", "", "cluster", false},
		{"valid simple", "my-cluster", "cluster", false},
		{"starts with dash", "-cluster", "cluster", true},
		{"invalid char", "cluster@1", "cluster", true},
		{"too long", strings.Repeat("a", 254), "cluster", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateHelmK8sName(tt.val, tt.field)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateHelmK8sName() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestValidateHelmChartArg(t *testing.T) {
	tests := []struct {
		name    string
		chart   string
		wantErr bool
	}{
		{"empty", "", true},
		{"valid standard", "bitnami/nginx", false},
		{"valid oci", "oci://registry-1.docker.io/bitnamicharts/nginx", false},
		{"starts with dash", "-chart", true},
		{"invalid char", "chart;rm", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateHelmChartArg(tt.chart)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateHelmChartArg() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestValidateHelmChartVersion(t *testing.T) {
	tests := []struct {
		name    string
		version string
		wantErr bool
	}{
		{"empty", "", false},
		{"valid standard", "1.2.3", false},
		{"valid with meta", "1.2.3+meta-data", false},
		{"starts with dash", "-1.2.3", true},
		{"invalid char", "1.2.3;", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateHelmChartVersion(tt.version)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateHelmChartVersion() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestServer_HandleHelmRollback(t *testing.T) {
	defer func() { execCommand = exec.Command; execCommandContext = exec.CommandContext }()
	execCommand = fakeExecCommand
	execCommandContext = fakeExecCommandContext

	server := &Server{
		allowedOrigins: []string{"*"},
		agentToken:     "test-token",
	}

	// Case 1: Success
	mockExitCode = 0
	mockStdout = "Rollback successful"
	reqBody := helmRollbackRequest{
		Release:   "my-release",
		Namespace: "my-ns",
		Cluster:   "my-cluster",
		Revision:  1,
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest("POST", "/helm/rollback", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer test-token")
	w := httptest.NewRecorder()

	server.handleHelmRollback(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d. Body: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["success"] != true {
		t.Errorf("Expected success=true, got %v", resp["success"])
	}

	// Case 2: Validation failure (missing release)
	reqBody = helmRollbackRequest{Namespace: "my-ns", Revision: 1}
	body, _ = json.Marshal(reqBody)
	req = httptest.NewRequest("POST", "/helm/rollback", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer test-token")
	w = httptest.NewRecorder()
	server.handleHelmRollback(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d", w.Code)
	}

	// Case 3: Exec failure
	mockExitCode = 1
	mockStderr = "rollback failed for some reason"
	reqBody = helmRollbackRequest{Release: "r", Namespace: "n", Revision: 1}
	body, _ = json.Marshal(reqBody)
	req = httptest.NewRequest("POST", "/helm/rollback", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer test-token")
	w = httptest.NewRecorder()
	server.handleHelmRollback(w, req)
	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected 500, got %d", w.Code)
	}
}

func TestServer_HandleHelmUninstall(t *testing.T) {
	defer func() { execCommand = exec.Command; execCommandContext = exec.CommandContext }()
	execCommand = fakeExecCommand
	execCommandContext = fakeExecCommandContext

	server := &Server{
		allowedOrigins: []string{"*"},
		agentToken:     "test-token",
	}

	// Case 1: Success
	mockExitCode = 0
	mockStdout = "Uninstalled"
	reqBody := helmUninstallRequest{
		Release:   "my-release",
		Namespace: "my-ns",
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest("POST", "/helm/uninstall", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer test-token")
	w := httptest.NewRecorder()

	server.handleHelmUninstall(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	// Case 2: Exec failure
	mockExitCode = 1
	mockStderr = "uninstall failed"
	req = httptest.NewRequest("POST", "/helm/uninstall", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer test-token")
	w = httptest.NewRecorder()
	server.handleHelmUninstall(w, req)
	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected 500, got %d", w.Code)
	}
}

func TestServer_HandleHelmUpgrade(t *testing.T) {
	defer func() { execCommand = exec.Command; execCommandContext = exec.CommandContext }()
	execCommand = fakeExecCommand
	execCommandContext = fakeExecCommandContext

	server := &Server{
		allowedOrigins: []string{"*"},
		agentToken:     "test-token",
	}

	// Case 1: Success (without values)
	mockExitCode = 0
	reqBody := helmUpgradeRequest{
		Release:   "my-release",
		Namespace: "my-ns",
		Chart:     "my-chart",
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest("POST", "/helm/upgrade", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer test-token")
	w := httptest.NewRecorder()

	server.handleHelmUpgrade(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	// Case 2: Success (with values)
	reqBody.Values = "key: value"
	body, _ = json.Marshal(reqBody)
	req = httptest.NewRequest("POST", "/helm/upgrade", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer test-token")
	w = httptest.NewRecorder()
	server.handleHelmUpgrade(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	// Case 3: Invalid chart name
	reqBody.Chart = "-invalid"
	body, _ = json.Marshal(reqBody)
	req = httptest.NewRequest("POST", "/helm/upgrade", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer test-token")
	w = httptest.NewRecorder()
	server.handleHelmUpgrade(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d", w.Code)
	}
}
