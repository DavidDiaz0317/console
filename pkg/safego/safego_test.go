package safego

import (
	"testing"
	"time"
)

func TestGoWithRunsFunction(t *testing.T) {
	done := make(chan struct{})
	GoWith("test-run", func() {
		close(done)
	})

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for goroutine")
	}
}

func TestGoWithRecoversPanic(t *testing.T) {
	done := make(chan struct{})

	GoWith("test-panic", func() {
		panic("boom")
	})
	GoWith("test-after-panic", func() {
		close(done)
	})

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for post-panic goroutine")
	}
}
