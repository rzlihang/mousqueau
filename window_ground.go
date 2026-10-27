package main

import "sync"

// platformGate holds work that calls application.InvokeSync until App.Run has
// created Wails' platform. v3.0.0 still panics if that runs earlier: dispatchOnMainThread
// dereferences the still-nil implementation. openWindows starts before Run.
type platformGate struct {
	mu      sync.Mutex
	ready   bool
	waiters []func()
}

func (g *platformGate) mark() {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.ready {
		return
	}
	g.ready = true
	waiters := g.waiters
	g.waiters = nil
	for _, fn := range waiters {
		go fn()
	}
}

func (g *platformGate) after(fn func()) {
	g.mu.Lock()
	if g.ready {
		g.mu.Unlock()
		go fn()
		return
	}
	g.waiters = append(g.waiters, fn)
	g.mu.Unlock()
}

// startupPlatform is marked from ApplicationStarted, which is delivered only
// after Run has initialized the platform.
var startupPlatform platformGate

// A navigation event or a different window cannot establish that this
// window's React tree has rendered in the native background's theme.
func windowReadyForGround(name string, dark bool, sender string, data any) bool {
	renderedDark, ok := data.(bool)
	return sender == name && ok && renderedDark == dark
}

// groundedReveal keeps a window hidden until its initial paint completes,
// even when frontend readiness and the recovery timer arrive together.
func groundedReveal(paint func(ready func()), show func()) func() {
	var start, finish sync.Once
	return func() {
		start.Do(func() {
			paint(func() { finish.Do(show) })
		})
	}
}
