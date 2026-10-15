//go:build windows && !server

package main

import (
	"runtime"
	"sync/atomic"

	"golang.org/x/sys/windows"
)

var setThreadExecutionState = windows.NewLazySystemDLL("kernel32.dll").NewProc("SetThreadExecutionState")

const (
	esSystemRequired  = 0x00000001
	esDisplayRequired = 0x00000002
	esContinuous      = 0x80000000
)

const (
	wmSysCommand   = 0x0112
	scScreenSave   = 0xF140
	scMonitorPower = 0xF170
)

// holding is set while playback holds the display awake.
var holding atomic.Bool

// The execution state does not stop the screen saver, which Windows starts
// by sending SC_SCREENSAVE to the foreground window; as video players do,
// the app declines it, and display power-off, while playing. A screen saver
// that policy enforces with a password still starts.
var wndProcInterceptor = func(_ uintptr, msg uint32, wParam, _ uintptr) (uintptr, bool) {
	if msg == wmSysCommand && holding.Load() {
		switch wParam & 0xFFF0 {
		case scScreenSave, scMonitorPower:
			return 0, true
		}
	}
	return 0, false
}

// The execution state belongs to the thread that set it, so one locked
// thread sets it and clears it.
func platformHoldAwake(string) (func(), error) {
	done := make(chan struct{})
	set := make(chan error, 1)
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()
		if r, _, err := setThreadExecutionState.Call(esContinuous | esSystemRequired | esDisplayRequired); r == 0 {
			set <- err
			return
		}
		set <- nil
		<-done
		setThreadExecutionState.Call(esContinuous)
	}()
	if err := <-set; err != nil {
		return nil, err
	}
	holding.Store(true)
	return func() {
		holding.Store(false)
		close(done)
	}, nil
}
