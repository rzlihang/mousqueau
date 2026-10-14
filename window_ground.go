package main

import "sync"

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
