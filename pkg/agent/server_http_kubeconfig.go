package agent

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"github.com/kubestellar/console/pkg/agent/protocol"
)

func writeKubeconfigUnauthorized(w http.ResponseWriter, operation, reason string) {
	slog.Warn("kubeconfig auth rejected", "operation", operation, "reason", reason)
	w.WriteHeader(http.StatusUnauthorized)
	writeJSON(w, protocol.ErrorPayload{
		Code:    "unauthorized",
		Message: "Invalid or missing agent token. Refresh the page and try again.",
	})
}

func kubeconfigImportStatus(err error) int {
	if err == nil {
		return http.StatusOK
	}
	errText := strings.ToLower(err.Error())
	if strings.Contains(errText, "invalid kubeconfig") ||
		strings.Contains(errText, "contains no contexts") ||
		strings.Contains(errText, "exec-based auth") {
		return http.StatusBadRequest
	}
	return http.StatusInternalServerError
}

// handleRenameContextHTTP renames a kubeconfig context
func (s *Server) handleRenameContextHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// SECURITY: Validate token for mutation endpoints
	if reason := s.tokenValidationFailure(r); reason != "" {
		writeKubeconfigUnauthorized(w, "rename_context", reason)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w, protocol.ErrorPayload{Code: "method_not_allowed", Message: "POST required"})
		return
	}

	var req protocol.RenameContextRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, protocol.ErrorPayload{Code: "invalid_request", Message: "Invalid JSON"})
		return
	}

	if req.OldName == "" || req.NewName == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, protocol.ErrorPayload{Code: "invalid_names", Message: "Both oldName and newName required"})
		return
	}

	if err := s.kubectl.RenameContext(req.OldName, req.NewName); err != nil {
		slog.Error("rename context error", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w, protocol.ErrorPayload{Code: "rename_failed", Message: "failed to rename context"})
		return
	}

	slog.Info("renamed context", "from", req.OldName, "to", req.NewName)
	writeJSON(w, protocol.RenameContextResponse{Success: true, OldName: req.OldName, NewName: req.NewName})
}

// kubeconfigImportRequest is the JSON body for kubeconfig import/preview
type kubeconfigImportRequest struct {
	Kubeconfig string `json:"kubeconfig"`
}

// kubeconfigImportResponse is the response from kubeconfig import
type kubeconfigImportResponse struct {
	Success       bool     `json:"success"`
	Added         []string `json:"added"`
	Skipped       []string `json:"skipped"`
	ImportedCount int      `json:"importedCount,omitempty"`
	Error         string   `json:"error,omitempty"`
}

// kubeconfigPreviewResponse is the response from kubeconfig preview
type kubeconfigPreviewResponse struct {
	Contexts []KubeconfigPreviewEntry `json:"contexts"`
}

// handleKubeconfigPreviewHTTP returns a dry-run preview of which contexts would be imported
func (s *Server) handleKubeconfigPreviewHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if reason := s.tokenValidationFailure(r); reason != "" {
		writeKubeconfigUnauthorized(w, "preview", reason)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w, protocol.ErrorPayload{Code: "method_not_allowed", Message: "POST required"})
		return
	}

	var req kubeconfigImportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, protocol.ErrorPayload{Code: "invalid_request", Message: "Invalid JSON"})
		return
	}

	if req.Kubeconfig == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, protocol.ErrorPayload{Code: "invalid_request", Message: "kubeconfig field is required"})
		return
	}

	entries, err := s.kubectl.PreviewKubeconfig(req.Kubeconfig)
	if err != nil {
		slog.Error("kubeconfig preview error", "error", err)
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, protocol.ErrorPayload{Code: "preview_failed", Message: err.Error()})
		return
	}

	writeJSON(w, kubeconfigPreviewResponse{Contexts: entries})
}

// handleKubeconfigImportHTTP merges new contexts from a kubeconfig YAML into the local kubeconfig
func (s *Server) handleKubeconfigImportHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if reason := s.tokenValidationFailure(r); reason != "" {
		writeKubeconfigUnauthorized(w, "import", reason)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w, protocol.ErrorPayload{Code: "method_not_allowed", Message: "POST required"})
		return
	}

	var req kubeconfigImportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, protocol.ErrorPayload{Code: "invalid_request", Message: "Invalid JSON"})
		return
	}

	if req.Kubeconfig == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, protocol.ErrorPayload{Code: "invalid_request", Message: "kubeconfig field is required"})
		return
	}

	added, skipped, err := s.kubectl.ImportKubeconfig(req.Kubeconfig)
	if err != nil {
		slog.Error("kubeconfig import error", "error", err)
		w.WriteHeader(kubeconfigImportStatus(err))
		writeJSON(w, kubeconfigImportResponse{Success: false, Error: err.Error()})
		return
	}

	slog.Info("kubeconfig import complete", "added", len(added), "skipped", len(skipped))
	writeJSON(w, kubeconfigImportResponse{Success: true, Added: added, Skipped: skipped, ImportedCount: len(added)})
}

// kubeconfigAddResponse is the response from the add cluster endpoint
type kubeconfigAddResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// handleKubeconfigRemoveHTTP removes a cluster context from the kubeconfig (#5658).
func (s *Server) handleKubeconfigRemoveHTTP(w http.ResponseWriter, r *http.Request) {
	// POST-only kubeconfig removal — preflight must advertise POST (#8201).
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if reason := s.tokenValidationFailure(r); reason != "" {
		writeKubeconfigUnauthorized(w, "remove", reason)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w, map[string]string{"error": "Method not allowed"})
		return
	}

	var req struct {
		Context string `json:"context"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Context == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": "Missing 'context' field"})
		return
	}

	if s.k8sClient == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		writeJSON(w, map[string]string{"error": "k8s client not initialized"})
		return
	}

	if err := s.k8sClient.RemoveContext(req.Context); err != nil {
		slog.Error("[kubeconfig] failed to remove context", "context", req.Context, "error", err)
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, map[string]interface{}{"ok": true, "removed": req.Context})
}

// handleKubeconfigAddHTTP adds a cluster from structured form fields
func (s *Server) handleKubeconfigAddHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if reason := s.tokenValidationFailure(r); reason != "" {
		writeKubeconfigUnauthorized(w, "add", reason)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w, protocol.ErrorPayload{Code: "method_not_allowed", Message: "POST required"})
		return
	}

	var req AddClusterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, protocol.ErrorPayload{Code: "invalid_request", Message: "Invalid JSON"})
		return
	}

	if err := s.kubectl.AddCluster(req); err != nil {
		slog.Error("add cluster error", "error", err)
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, kubeconfigAddResponse{Success: false, Error: err.Error()})
		return
	}

	slog.Info("added cluster via form", "context", req.ContextName, "cluster", req.ClusterName)
	writeJSON(w, kubeconfigAddResponse{Success: true})
}

// handleKubeconfigTestHTTP tests a connection to a Kubernetes API server
func (s *Server) handleKubeconfigTestHTTP(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if reason := s.tokenValidationFailure(r); reason != "" {
		writeKubeconfigUnauthorized(w, "test", reason)
		return
	}

	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w, protocol.ErrorPayload{Code: "method_not_allowed", Message: "POST required"})
		return
	}

	var req TestConnectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, protocol.ErrorPayload{Code: "invalid_request", Message: "Invalid JSON"})
		return
	}

	result, err := s.kubectl.TestClusterConnection(req)
	if err != nil {
		slog.Error("test connection error", "error", err)
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, TestConnectionResult{Reachable: false, Error: err.Error()})
		return
	}

	writeJSON(w, result)
}

// handleWebSocket handles WebSocket connections
