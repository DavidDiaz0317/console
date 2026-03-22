package main

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"log"
	"math/big"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"time"
)

const (
	watchdogHealthPollInterval  = 2 * time.Second
	watchdogShutdownTimeout     = 5 * time.Second
	watchdogHealthTimeout       = 2 * time.Second
	watchdogProxyHeaderTimeout  = 30 * time.Second // generous for SSE/slow endpoints
	watchdogReadHeaderTimeout   = 10 * time.Second
	watchdogReadTimeout         = 30 * time.Second
	watchdogWriteTimeout        = 5 * time.Minute // match backend for large static assets
	watchdogIdleTimeout         = 2 * time.Minute
	watchdogMaxIdleConns        = 100
	watchdogMaxIdleConnsPerHost = 20
	watchdogIdleConnTimeout     = 90 * time.Second
	watchdogPidFile             = "/tmp/.kc-watchdog.pid"
	watchdogPidFilePerms        = 0600
	watchdogDefaultBackendPort  = 8081
	watchdogDefaultListenPort   = 8080
	watchdogStageFile           = "/tmp/.kc-startup-stage"
	watchdogTLSDir              = "./data/tls"
	watchdogTLSCertFile         = "./data/tls/localhost.crt"
	watchdogTLSKeyFile          = "./data/tls/localhost.key"
	watchdogCertValidity        = 365 * 24 * time.Hour // 1 year
)

// WatchdogConfig holds configuration for the watchdog reverse proxy.
type WatchdogConfig struct {
	ListenPort  int
	BackendPort int
	TLSEnabled  bool
}

// runWatchdog starts the watchdog reverse proxy. It proxies all traffic to the
// backend and serves a branded "Reconnecting..." page when the backend is down.
// The watchdog survives startup-oauth.sh restart cycles via a PID file.
func runWatchdog(cfg WatchdogConfig) error {
	// Write PID file so startup-oauth.sh can detect us
	if err := writePidFile(watchdogPidFile); err != nil {
		log.Printf("[Watchdog] Warning: could not write PID file: %v", err)
	}
	defer os.Remove(watchdogPidFile)

	backendURL := &url.URL{
		Scheme: "http",
		Host:   fmt.Sprintf("127.0.0.1:%d", cfg.BackendPort),
	}

	// Track backend health with atomic for lock-free reads
	var backendHealthy int32 // 0 = unhealthy, 1 = healthy
	var fallbacksServed int64 // count of fallback pages served (for observability)
	var backendStatus atomic.Value // raw status string from /health ("ok", "starting", "")

	// Create reverse proxy
	proxy := httputil.NewSingleHostReverseProxy(backendURL)

	// Flush immediately so SSE events are not buffered. Without this the
	// reverse proxy accumulates response bytes and only forwards them when
	// its internal buffer fills, which defeats the purpose of server-sent events.
	proxy.FlushInterval = -1

	// Custom transport with managed connection pool and timeouts.
	// DisableCompression prevents the Transport from adding Accept-Encoding: gzip
	// to proxied requests. Without this, fasthttp's SendFile tries to create
	// compressed file caches (.fiber.gz) which fails on read-only filesystems,
	// causing 404s for static assets like manifest.json and favicon.ico.
	proxy.Transport = &http.Transport{
		DialContext: (&net.Dialer{
			Timeout: watchdogHealthTimeout,
		}).DialContext,
		DisableCompression:    true,
		ResponseHeaderTimeout: watchdogProxyHeaderTimeout,
		MaxIdleConns:          watchdogMaxIdleConns,
		MaxIdleConnsPerHost:   watchdogMaxIdleConnsPerHost,
		IdleConnTimeout:       watchdogIdleConnTimeout,
	}

	// Custom error handler: serve fallback page on connection failures.
	// Only mark backend unhealthy on hard connection errors (refused, reset, EOF).
	// Client-side disconnects (context canceled) and timeouts do NOT mean the
	// backend is down — the client navigated away or the request was slow.
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		errMsg := err.Error()

		// Client disconnected (e.g. browser navigated away, closed SSE stream).
		// This is normal — do NOT mark backend unhealthy.
		isClientGone := strings.Contains(errMsg, "context canceled") ||
			strings.Contains(errMsg, "client disconnected") ||
			strings.Contains(errMsg, "write: broken pipe")
		if isClientGone {
			log.Printf("[Watchdog] Client disconnected (backend still healthy): %v", err)
			return
		}

		// Backend slow but still running — don't mark unhealthy.
		isTimeout := strings.Contains(errMsg, "timeout awaiting response headers") ||
			strings.Contains(errMsg, "context deadline exceeded")
		if isTimeout {
			log.Printf("[Watchdog] Proxy timeout (backend still healthy): %v", err)
			http.Error(w, "Gateway Timeout", http.StatusGatewayTimeout)
			return
		}

		// Hard connection failure — backend is genuinely down.
		log.Printf("[Watchdog] Proxy error (backend down): %v", err)
		atomic.StoreInt32(&backendHealthy, 0)
		serveFallback(w, r)
	}

	// Cancellable context for background goroutines
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Background health poller
	go pollBackendHealth(ctx, backendURL.String(), &backendHealthy, &backendStatus)

	// Request handler
	mux := http.NewServeMux()

	// Watchdog's own health endpoint — always responds 200 (liveness), never proxied.
	// Includes the current startup stage from the stage file written by startup-oauth.sh.
	mux.HandleFunc("/watchdog/health", func(w http.ResponseWriter, r *http.Request) {
		beStatus := "down"
		if atomic.LoadInt32(&backendHealthy) == 1 {
			beStatus = "ok"
		}
		stage := readStartupStage()
		if rawStatus, ok := backendStatus.Load().(string); ok && rawStatus == "starting" {
			stage = "backend_starting"
		}
		if beStatus == "ok" {
			stage = "ready"
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":           "watchdog",
			"backend":          beStatus,
			"stage":            stage,
			"fallbacks_served": atomic.LoadInt64(&fallbacksServed),
		})
	})

	// Readiness endpoint — returns 503 when backend is down (for K8s traffic routing)
	mux.HandleFunc("/watchdog/ready", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if atomic.LoadInt32(&backendHealthy) == 1 {
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(map[string]string{"status": "ready"})
		} else {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{"status": "not_ready"})
		}
	})

	// All other requests: proxy or fallback
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if atomic.LoadInt32(&backendHealthy) == 1 {
			proxy.ServeHTTP(w, r)
			return
		}
		atomic.AddInt64(&fallbacksServed, 1)
		serveFallback(w, r)
	})

	addr := fmt.Sprintf(":%d", cfg.ListenPort)
	srv := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: watchdogReadHeaderTimeout,
		ReadTimeout:       watchdogReadTimeout,
		WriteTimeout:      watchdogWriteTimeout,
		IdleTimeout:       watchdogIdleTimeout,
	}

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("[Watchdog] Shutting down...")
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), watchdogShutdownTimeout)
		defer shutdownCancel()
		srv.Shutdown(shutdownCtx)
	}()

	if cfg.TLSEnabled {
		certFile, keyFile, err := ensureSelfSignedCert()
		if err != nil {
			return fmt.Errorf("watchdog TLS setup error: %w", err)
		}
		log.Printf("[Watchdog] HTTPS/HTTP2 on %s, proxying to %s", addr, backendURL.String())
		log.Printf("[Watchdog] NOTE: Browser will show a certificate warning for the self-signed cert — click Advanced > Proceed to accept it")
		if err := srv.ListenAndServeTLS(certFile, keyFile); err != nil && err != http.ErrServerClosed {
			return fmt.Errorf("watchdog TLS listen error: %w", err)
		}
	} else {
		log.Printf("[Watchdog] HTTP on %s, proxying to %s", addr, backendURL.String())
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			return fmt.Errorf("watchdog listen error: %w", err)
		}
	}
	return nil
}

// checkBackendHealth performs a single health check against the backend.
// Returns the status string ("ok", "starting", "shutting_down") or "" if unreachable.
func checkBackendHealth(client *http.Client, healthURL string) string {
	resp, err := client.Get(healthURL)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	var body map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return ""
	}
	if s, ok := body["status"].(string); ok {
		return s
	}
	return ""
}

// pollBackendHealth polls the backend's /health endpoint and updates the atomic flags.
// Only status "ok" counts as healthy — "starting" and "shutting_down" are treated as unhealthy.
func pollBackendHealth(ctx context.Context, backendBase string, healthy *int32, backendStatus *atomic.Value) {
	client := &http.Client{Timeout: watchdogHealthTimeout}
	healthURL := backendBase + "/health"

	for {
		wasHealthy := atomic.LoadInt32(healthy) == 1
		status := checkBackendHealth(client, healthURL)
		backendStatus.Store(status)
		isHealthy := status == "ok"

		if isHealthy {
			if !wasHealthy {
				log.Printf("[Watchdog] Backend is healthy")
			}
			atomic.StoreInt32(healthy, 1)
		} else {
			if wasHealthy {
				log.Printf("[Watchdog] Backend unreachable")
			}
			atomic.StoreInt32(healthy, 0)
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(watchdogHealthPollInterval):
		}
	}
}

// serveFallback serves the appropriate response when the backend is down.
// HTML requests get the branded reconnecting page; API requests get a 503 JSON response.
func serveFallback(w http.ResponseWriter, r *http.Request) {
	accept := r.Header.Get("Accept")
	if strings.Contains(accept, "text/html") || accept == "" || accept == "*/*" {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(watchdogFallbackHTML))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusServiceUnavailable)
	json.NewEncoder(w).Encode(map[string]string{
		"error":  "backend_unavailable",
		"status": "watchdog",
	})
}

// readStartupStage reads the current startup stage from the stage file.
// Returns "watchdog" if the file doesn't exist or can't be read.
func readStartupStage() string {
	data, err := os.ReadFile(watchdogStageFile)
	if err != nil {
		return "watchdog"
	}
	stage := strings.TrimSpace(string(data))
	if stage == "" {
		return "watchdog"
	}
	return stage
}

// writePidFile writes the current process ID to the given file path.
func writePidFile(path string) error {
	return os.WriteFile(path, []byte(strconv.Itoa(os.Getpid())), watchdogPidFilePerms)
}

// ensureSelfSignedCert checks for existing TLS cert/key files and generates
// new ones if they are missing or expired. Returns the paths to the cert and
// key files. The certificate is a self-signed ECDSA P-256 cert valid for
// localhost, 127.0.0.1, and ::1 with a 1-year validity period.
func ensureSelfSignedCert() (certFile, keyFile string, err error) {
	certFile = watchdogTLSCertFile
	keyFile = watchdogTLSKeyFile

	// Check if existing cert/key are present and not expired
	if certValid(certFile) {
		log.Printf("[Watchdog] Using existing TLS cert: %s", certFile)
		return certFile, keyFile, nil
	}

	log.Printf("[Watchdog] Generating self-signed TLS certificate for localhost...")

	// Ensure directory exists
	if err := os.MkdirAll(watchdogTLSDir, 0755); err != nil {
		return "", "", fmt.Errorf("create TLS dir: %w", err)
	}

	// Generate ECDSA P-256 private key
	privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return "", "", fmt.Errorf("generate key: %w", err)
	}

	// Build X.509 certificate template
	serialNumber, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return "", "", fmt.Errorf("generate serial: %w", err)
	}

	now := time.Now()
	template := &x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			Organization: []string{"KubeStellar Console (self-signed)"},
			CommonName:   "localhost",
		},
		NotBefore:             now,
		NotAfter:              now.Add(watchdogCertValidity),
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		DNSNames:              []string{"localhost"},
		IPAddresses:           []net.IP{net.IPv4(127, 0, 0, 1), net.IPv6loopback},
	}

	// Self-sign the certificate
	certDER, err := x509.CreateCertificate(rand.Reader, template, template, &privateKey.PublicKey, privateKey)
	if err != nil {
		return "", "", fmt.Errorf("create certificate: %w", err)
	}

	// Write cert PEM
	certOut, err := os.Create(certFile)
	if err != nil {
		return "", "", fmt.Errorf("create cert file: %w", err)
	}
	defer certOut.Close()
	if err := pem.Encode(certOut, &pem.Block{Type: "CERTIFICATE", Bytes: certDER}); err != nil {
		return "", "", fmt.Errorf("write cert PEM: %w", err)
	}

	// Write key PEM
	keyDER, err := x509.MarshalECPrivateKey(privateKey)
	if err != nil {
		return "", "", fmt.Errorf("marshal key: %w", err)
	}
	keyOut, err := os.OpenFile(keyFile, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return "", "", fmt.Errorf("create key file: %w", err)
	}
	defer keyOut.Close()
	if err := pem.Encode(keyOut, &pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER}); err != nil {
		return "", "", fmt.Errorf("write key PEM: %w", err)
	}

	log.Printf("[Watchdog] Generated self-signed TLS cert (valid until %s)", template.NotAfter.Format("2006-01-02"))
	return certFile, keyFile, nil
}

// certValid returns true if the cert file exists and is not expired.
func certValid(certFile string) bool {
	data, err := os.ReadFile(certFile)
	if err != nil {
		return false
	}
	block, _ := pem.Decode(data)
	if block == nil {
		return false
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return false
	}
	// Consider cert invalid if it expires within 7 days
	return time.Now().Add(7 * 24 * time.Hour).Before(cert.NotAfter)
}
