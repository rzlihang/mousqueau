//go:build windows && !server

package main

import "testing"

func TestScreenSaverIsDeclinedOnlyWhilePlaying(t *testing.T) {
	declined := func(wParam uintptr) bool {
		_, handled := wndProcInterceptor(0, wmSysCommand, wParam, 0)
		return handled
	}
	if declined(scScreenSave) {
		t.Fatal("declined while not playing")
	}
	holding.Store(true)
	defer holding.Store(false)
	if !declined(scScreenSave) || !declined(scMonitorPower|0x2) || declined(0xF020) {
		t.Fatal("wrong messages declined while playing")
	}
}
