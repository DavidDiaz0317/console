package safego

import (
	"log/slog"
	"runtime/debug"
)

// Go launches fn in a goroutine and recovers panics so one background task
// cannot crash the whole process.
func Go(fn func()) {
	go func() {
		defer recoverAndLog("goroutine")
		fn()
	}()
}

// GoWith launches fn in a goroutine and recovers panics with a descriptive
// label for easier crash triage.
func GoWith(label string, fn func()) {
	go func() {
		defer recoverAndLog(label)
		fn()
	}()
}

func recoverAndLog(label string) {
	if r := recover(); r != nil {
		slog.Error("recovered panic from goroutine",
			"label", label,
			"panic", r,
			"stack", string(debug.Stack()),
		)
	}
}
