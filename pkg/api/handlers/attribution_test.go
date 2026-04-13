package handlers

import (
	"os"
	"strings"
	"testing"
	"time"
)

const testSecret = "test-hmac-secret-do-not-use-in-production"

// setTestSecret is a helper that sets CONSOLE_ATTRIBUTION_SECRET for the
// duration of a test and restores the previous value on cleanup.
func setTestSecret(t *testing.T, v string) {
	t.Helper()
	prev := os.Getenv(attributionSecretEnv)
	t.Setenv(attributionSecretEnv, v)
	t.Cleanup(func() { t.Setenv(attributionSecretEnv, prev) })
}

func TestBuildAttributionFooter_NoSecret(t *testing.T) {
	setTestSecret(t, "")
	footer, attr, err := BuildAttributionFooter("alice", "Bug: crash on login")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if footer != "" || attr != nil {
		t.Errorf("expected empty footer + nil attr when secret unset, got footer=%q attr=%v", footer, attr)
	}
}

func TestBuildAndParseAttributionFooter_RoundTrip(t *testing.T) {
	setTestSecret(t, testSecret)
	footer, attr, err := BuildAttributionFooter("alice", "Bug: crash on login")
	if err != nil {
		t.Fatalf("BuildAttributionFooter: %v", err)
	}
	if attr == nil || footer == "" {
		t.Fatal("expected non-nil attr and non-empty footer")
	}

	// Parse the footer back out — simulates reading it from an issue body.
	body := "Some user-written description.\n\n" + footer
	parsed, err := ParseAttributionFooter(body)
	if err != nil {
		t.Fatalf("ParseAttributionFooter: %v", err)
	}
	if parsed == nil {
		t.Fatal("expected non-nil parsed attribution")
	}
	if parsed.UserID != attr.UserID ||
		parsed.Timestamp != attr.Timestamp ||
		parsed.Nonce != attr.Nonce ||
		parsed.Signature != attr.Signature {
		t.Errorf("parsed attribution does not match built: got %+v want %+v", parsed, attr)
	}
}

func TestVerifyAttributionSignature_Valid(t *testing.T) {
	setTestSecret(t, testSecret)
	_, attr, err := BuildAttributionFooter("alice", "Bug: crash on login")
	if err != nil {
		t.Fatal(err)
	}
	if !VerifyAttributionSignature(attr, "Bug: crash on login") {
		t.Error("expected signature to verify with correct title")
	}
}

func TestVerifyAttributionSignature_RejectsDifferentTitle(t *testing.T) {
	// This is the main anti-gaming property: an attacker can't copy the
	// footer from a legit issue onto a different issue, because the title
	// is bound into the HMAC.
	setTestSecret(t, testSecret)
	_, attr, err := BuildAttributionFooter("alice", "Bug: crash on login")
	if err != nil {
		t.Fatal(err)
	}
	if VerifyAttributionSignature(attr, "Bug: different issue entirely") {
		t.Error("expected signature to FAIL when title changes")
	}
}

func TestVerifyAttributionSignature_RejectsNoSecret(t *testing.T) {
	setTestSecret(t, testSecret)
	_, attr, _ := BuildAttributionFooter("alice", "Bug: x")
	setTestSecret(t, "")
	if VerifyAttributionSignature(attr, "Bug: x") {
		t.Error("expected verification to fail when secret is unset")
	}
}

func TestVerifyAttributionSignature_RejectsNil(t *testing.T) {
	setTestSecret(t, testSecret)
	if VerifyAttributionSignature(nil, "anything") {
		t.Error("expected nil attribution to fail verification")
	}
}

func TestVerifyAttributionSignature_RejectsExpired(t *testing.T) {
	setTestSecret(t, testSecret)
	_, attr, err := BuildAttributionFooter("alice", "Bug: x")
	if err != nil {
		t.Fatal(err)
	}
	// Backdate timestamp beyond the max age.
	attr.Timestamp = time.Now().Add(-48 * time.Hour).Unix()
	// Re-sign with backdated ts so we're testing timestamp check, not HMAC.
	attr.Signature = computeAttributionHMAC([]byte(testSecret), attr.UserID, attr.Timestamp, attr.Nonce, "Bug: x")

	if VerifyAttributionSignature(attr, "Bug: x") {
		t.Error("expected expired signature to be rejected")
	}
}

func TestVerifyAttributionSignature_RejectsFuture(t *testing.T) {
	setTestSecret(t, testSecret)
	_, attr, err := BuildAttributionFooter("alice", "Bug: x")
	if err != nil {
		t.Fatal(err)
	}
	attr.Timestamp = time.Now().Add(5 * time.Minute).Unix()
	attr.Signature = computeAttributionHMAC([]byte(testSecret), attr.UserID, attr.Timestamp, attr.Nonce, "Bug: x")
	if VerifyAttributionSignature(attr, "Bug: x") {
		t.Error("expected future-dated signature to be rejected")
	}
}

func TestVerifyAttributionSignature_RejectsDifferentSecret(t *testing.T) {
	// Attacker has their own HMAC implementation but guessed-wrong secret.
	setTestSecret(t, testSecret)
	_, attr, err := BuildAttributionFooter("alice", "Bug: x")
	if err != nil {
		t.Fatal(err)
	}
	setTestSecret(t, "wrong-secret")
	if VerifyAttributionSignature(attr, "Bug: x") {
		t.Error("expected signature forged with wrong secret to be rejected")
	}
}

func TestParseAttributionFooter_NoFooter(t *testing.T) {
	attr, err := ParseAttributionFooter("Just a regular issue body, no footer here.")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if attr != nil {
		t.Errorf("expected nil attribution for body without footer, got %+v", attr)
	}
}

func TestParseAttributionFooter_ExtractsFromMiddle(t *testing.T) {
	setTestSecret(t, testSecret)
	footer, _, err := BuildAttributionFooter("alice", "Bug: x")
	if err != nil {
		t.Fatal(err)
	}
	// Footer embedded in the middle of a real-world body with trailing content.
	body := "## Description\n\nStuff." + footer + "\n\n## More\n\nTrailing content."
	attr, err := ParseAttributionFooter(body)
	if err != nil {
		t.Fatal(err)
	}
	if attr == nil {
		t.Fatal("expected to parse footer from middle of body")
	}
	if attr.UserID != "alice" {
		t.Errorf("user mismatch: got %s want alice", attr.UserID)
	}
}

func TestBuildAttributionFooter_NoncesAreUnique(t *testing.T) {
	setTestSecret(t, testSecret)
	seen := make(map[string]bool)
	const trials = 200
	for i := 0; i < trials; i++ {
		_, attr, err := BuildAttributionFooter("alice", "Bug: x")
		if err != nil {
			t.Fatal(err)
		}
		if seen[attr.Nonce] {
			t.Fatalf("nonce collision at iteration %d: %s", i, attr.Nonce)
		}
		seen[attr.Nonce] = true
	}
}

func TestBuildAttributionFooter_FooterIsCommented(t *testing.T) {
	// The footer must be an HTML comment so it doesn't render visibly
	// in the GitHub issue UI. Users shouldn't see cryptic attribution data.
	setTestSecret(t, testSecret)
	footer, _, err := BuildAttributionFooter("alice", "Bug: x")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(footer, "<!--") || !strings.Contains(footer, "-->") {
		t.Errorf("footer should be wrapped in HTML comment; got:\n%s", footer)
	}
}
