//go:build !windows || server

package main

// Only Windows asks the app before starting the screen saver.
var wndProcInterceptor func(hwnd uintptr, msg uint32, wParam, lParam uintptr) (uintptr, bool)
