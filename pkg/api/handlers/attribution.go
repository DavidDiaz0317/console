// Attribution signing for console-submitted issues.
//
// Problem: the rewards leaderboard awards 300 points for bug reports, but
// we only want to award that for issues submitted through the console UI
// — not for issues opened directly on github.com. Without a signature,
// contributors can open issues on github.com with a "bug" label and get
// the 300-point reward reserved for UX-friction-tested console submissions.
//
// Solution: when the console backend creates an issue on behalf of the
// user, append an HMAC-signed attribution footer to the issue body. The
// rewards classifier verifies the signature before awarding console-tier
// points. Attackers cannot forge the signature (they don't have the
// server secret), cannot replay a valid signature (each nonce is stored
// in the DB and marked consumed), and cannot copy a valid signature onto
// a different issue (the issue title is bound into the HMAC).

package handlers

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"log/slog"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// attributionVersion is the schema version of the footer. Incrementing
// this lets us evolve the format without mis-parsing old issues.
const attributionVersion = "v1"

// attributionFooterStart / attributionFooterEnd bracket the HTML comment
// so the footer is invisible in the rendered issue but trivially
// extractable from the raw body.
const (
	attributionFooterStart = "<!-- kc-console-attribution-" + attributionVersion + "\n"
	attributionFooterEnd   = "\n-->"
)

// attributionSecretEnv is the env var holding the HMAC secret. If unset,
// signing is disabled and console-submitted issues fall through to the
// web-UI reward tier. This is fail-safe — a missing secret cannot mint
// unearned rewards.
const attributionSecretEnv = "CONSOLE_ATTRIBUTION_SECRET"

// attributionNonceBytes is the entropy of each nonce. 16 bytes = 128 bits
// — enough that an attacker cannot guess a valid nonce even if they know
// one belongs to some unclaimed issue.
const attributionNonceBytes = 16

// attributionMaxAge caps how old a signature can be before it's rejected.
// Longer than a typical issue creation → ingestion gap, short enough to
// limit damage if the secret ever leaks.
const attributionMaxAge = 24 * time.Hour

// ConsoleAttribution holds the parsed contents of an attribution footer.
type ConsoleAttribution struct {
	UserID    string // GitHub user login that submitted via console
	Timestamp int64  // Unix seconds when the signature was issued
	Nonce     string // Random hex string, one-time use
	Signature string // HMAC-SHA256 of v1|user|ts|nonce|title, hex-encoded
}

// getAttributionSecret returns the current signing secret from env.
// Empty string means signing is disabled (fail-safe).
func getAttributionSecret() []byte {
	return []byte(os.Getenv(attributionSecretEnv))
}

// generateNonce returns a cryptographically random hex string.
func generateNonce() (string, error) {
	buf := make([]byte, attributionNonceBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}
	return hex.EncodeToString(buf), nil
}

// computeAttributionHMAC derives the HMAC for a given attribution. The
// input binds the user, timestamp, nonce, AND issue title — so a valid
// signature for issue A cannot be copy-pasted onto issue B. Caller must
// pass the exact title that will be sent to GitHub.
func computeAttributionHMAC(secret []byte, userID string, ts int64, nonce, title string) string {
	mac := hmac.New(sha256.New, secret)
	fmt.Fprintf(mac, "%s|%s|%d|%s|%s", attributionVersion, userID, ts, nonce, title)
	return hex.EncodeToString(mac.Sum(nil))
}

// BuildAttributionFooter generates a fresh attribution and formats it as
// an HTML comment to append to the issue body. Returns the footer string
// and the underlying ConsoleAttribution so the caller can persist the
// nonce to the DB. Returns empty string + nil if the secret is unset —
// the caller should proceed to create the issue without a footer; the
// rewards side will fall through to the web-UI tier.
func BuildAttributionFooter(userID, title string) (footer string, attr *ConsoleAttribution, err error) {
	secret := getAttributionSecret()
	if len(secret) == 0 {
		// Signing disabled — skip footer so rewards treats it as
		// a web-UI submission. Log once per process at startup.
		return "", nil, nil
	}

	nonce, err := generateNonce()
	if err != nil {
		return "", nil, err
	}
	ts := time.Now().Unix()
	sig := computeAttributionHMAC(secret, userID, ts, nonce, title)

	a := &ConsoleAttribution{
		UserID:    userID,
		Timestamp: ts,
		Nonce:     nonce,
		Signature: sig,
	}

	var b strings.Builder
	b.WriteString("\n\n")
	b.WriteString(attributionFooterStart)
	fmt.Fprintf(&b, "user: %s\n", a.UserID)
	fmt.Fprintf(&b, "ts: %d\n", a.Timestamp)
	fmt.Fprintf(&b, "nonce: %s\n", a.Nonce)
	fmt.Fprintf(&b, "sig: sha256:%s", a.Signature)
	b.WriteString(attributionFooterEnd)

	return b.String(), a, nil
}

// attributionFooterRegex matches a single attribution footer anywhere in
// the issue body. Capturing groups: (1) user, (2) ts, (3) nonce, (4) sig.
var attributionFooterRegex = regexp.MustCompile(
	`(?m)<!-- kc-console-attribution-v1\s*\n` +
		`user:\s*(\S+)\s*\n` +
		`ts:\s*(\d+)\s*\n` +
		`nonce:\s*([0-9a-f]+)\s*\n` +
		`sig:\s*sha256:([0-9a-f]+)\s*\n?` +
		`-->`,
)

// ParseAttributionFooter extracts the first attribution footer from the
// issue body, if present. Returns nil + nil if no footer is present
// (caller should treat as web-UI submission). Returns nil + error only
// for malformed numeric fields that should never occur with a body
// produced by BuildAttributionFooter.
func ParseAttributionFooter(body string) (*ConsoleAttribution, error) {
	m := attributionFooterRegex.FindStringSubmatch(body)
	if m == nil {
		return nil, nil
	}
	ts, err := strconv.ParseInt(m[2], 10, 64)
	if err != nil {
		return nil, fmt.Errorf("attribution ts: %w", err)
	}
	return &ConsoleAttribution{
		UserID:    m[1],
		Timestamp: ts,
		Nonce:     m[3],
		Signature: m[4],
	}, nil
}

// VerifyAttributionSignature checks (a) the HMAC matches for the given
// title, (b) the timestamp is within attributionMaxAge of now. This is
// the stateless half of verification — the caller is responsible for
// the DB replay check (nonce exists, matches issue, not yet consumed).
func VerifyAttributionSignature(a *ConsoleAttribution, title string) bool {
	if a == nil {
		return false
	}
	secret := getAttributionSecret()
	if len(secret) == 0 {
		return false
	}

	// Reject signatures from the future or too far in the past.
	now := time.Now().Unix()
	if a.Timestamp > now+60 || a.Timestamp < now-int64(attributionMaxAge.Seconds()) {
		return false
	}

	expected := computeAttributionHMAC(secret, a.UserID, a.Timestamp, a.Nonce, title)
	// Constant-time compare to prevent timing side channels.
	return subtle.ConstantTimeCompare([]byte(expected), []byte(a.Signature)) == 1
}

// logAttributionStartup logs the signing status once so operators can
// tell at a glance whether the secret is configured. Called from the
// feedback handler's init path.
var attributionStartupLogged bool

func logAttributionStartupOnce() {
	if attributionStartupLogged {
		return
	}
	attributionStartupLogged = true
	if len(getAttributionSecret()) == 0 {
		slog.Warn("[Attribution] " + attributionSecretEnv + " is not set — console-submitted issues " +
			"will NOT receive signed attribution footers, and the rewards leaderboard will treat " +
			"all issues as web-UI submissions (50 pts). Set " + attributionSecretEnv +
			" to enable the 300/100-pt tier for console submissions.")
	} else {
		slog.Info("[Attribution] console attribution signing enabled")
	}
}
