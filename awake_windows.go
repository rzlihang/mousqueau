//go:build windows && !server

package main

import (
	"runtime"

	"golang.org/x/sys/windows"
)

var setThreadExecutionState = windows.NewLazySystemDLL("kernel32.dll").NewProc("SetThreadExecutionState")

const (
	esSystemRequired  = 0x00000001
	esDisplayRequired = 0x00000002
	esContinuous      = 0x80000000
)

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
	return func() { close(done) }, nil
}
