package main

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestGroundedRevealWaitsForPaint(t *testing.T) {
	var finishPaint func()
	visible := false
	reveal := groundedReveal(func(ready func()) {
		finishPaint = ready
	}, func() { visible = true })

	reveal()
	if visible {
		t.Fatal("window became visible before WebKit finished painting")
	}
	finishPaint()
	if !visible {
		t.Fatal("painted window remained hidden")
	}
}

func TestGroundedRevealOnlyStartsAndShowsOnce(t *testing.T) {
	var starts, shows atomic.Int32
	var finishPaint func()
	reveal := groundedReveal(func(ready func()) {
		starts.Add(1)
		finishPaint = ready
	}, func() { shows.Add(1) })

	var group sync.WaitGroup
	for range 10 {
		group.Go(reveal)
	}
	group.Wait()
	if starts.Load() != 1 {
		t.Fatalf("started %d paints, want 1", starts.Load())
	}
	finishPaint()
	finishPaint()
	reveal()
	if shows.Load() != 1 {
		t.Fatalf("showed %d times, want 1", shows.Load())
	}
}

func TestPlatformGateHoldsWorkUntilRun(t *testing.T) {
	var gate platformGate
	started := make(chan struct{})
	gate.after(func() { close(started) })
	select {
	case <-started:
		t.Fatal("polling started before the platform was ready")
	case <-time.After(30 * time.Millisecond):
	}
	gate.mark()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("polling did not start after the platform was ready")
	}
	// A second mark must not run waiters again.
	again := make(chan struct{})
	gate.mark()
	select {
	case <-again:
		t.Fatal("mark ran a waiter that was not registered")
	case <-time.After(30 * time.Millisecond):
	}
}

func TestPlatformGateRunsImmediatelyWhenAlreadyReady(t *testing.T) {
	var gate platformGate
	gate.mark()
	started := make(chan struct{})
	gate.after(func() { close(started) })
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("polling waited even though the platform was already ready")
	}
}

func TestWindowReadyRequiresItsOwnRenderedTheme(t *testing.T) {
	if !windowReadyForGround("settings", false, "settings", false) {
		t.Fatal("light window rejected a matching rendered theme")
	}
	for _, tc := range []struct {
		name   string
		sender string
		data   any
		want   bool
	}{
		{"ready", "settings", true, true},
		{"another window", "main", true, false},
		{"wrong initial theme", "settings", false, false},
		{"document only", "settings", nil, false},
		{"invalid payload", "settings", "dark", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := windowReadyForGround("settings", true, tc.sender, tc.data); got != tc.want {
				t.Fatalf("ready = %v, want %v", got, tc.want)
			}
		})
	}
}
