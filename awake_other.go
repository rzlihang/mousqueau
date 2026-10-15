//go:build server || !(windows || linux || (darwin && cgo))

package main

// Server builds and other platforms have nothing to hold.
func platformHoldAwake(string) (func(), error) { return func() {}, nil }
