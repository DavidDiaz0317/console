package handlers

import (
	"testing"
)

func TestIsAllowedQuantumPath(t *testing.T) {
	tests := []struct {
		name     string
		endpoint string
		want     bool
	}{
		// Allowed prefixes (exact matches)
		{"auth exact", "auth", true},
		{"circuit exact", "circuit", true},
		{"execute exact", "execute", true},
		{"health exact", "health", true},
		{"job exact", "job", true},
		{"loop exact", "loop", true},
		{"qasm exact", "qasm", true},
		{"qubits exact", "qubits", true},
		{"result exact", "result", true},
		{"status exact", "status", true},

		// Allowed prefixes with subpaths
		{"auth/save", "auth/save", true},
		{"auth/status", "auth/status", true},
		{"auth/clear", "auth/clear", true},
		{"qasm/file", "qasm/file", true},
		{"qasm/listfiles", "qasm/listfiles", true},
		{"qasm/circuit/ascii", "qasm/circuit/ascii", true},
		{"loop/start", "loop/start", true},
		{"loop/stop", "loop/stop", true},
		{"qubits/simple", "qubits/simple", true},
		{"result/histogram", "result/histogram", true},

		// Disallowed paths
		{"unknown prefix", "unknown", false},
		{"unknown/subpath", "unknown/subpath", false},
		{"config", "config", false},
		{"admin", "admin", false},

		// Path traversal attempts (rejected by isAllowedQuantumPath)
		{"path traversal ../ prefix", "../auth", false},
		{"path traversal in middle", "auth/../status", false},
		{"path traversal complex", "qasm/../../etc/passwd", false},

		// Edge cases
		{"empty string", "", false},
		{"slash only", "/", false},
		{"partial prefix mismatch", "aut", false},
		{"partial prefix mismatch 2", "auth1", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isAllowedQuantumPath(tt.endpoint)
			if got != tt.want {
				t.Errorf("isAllowedQuantumPath(%q) = %v, want %v", tt.endpoint, got, tt.want)
			}
		})
	}
}
