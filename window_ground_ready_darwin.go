//go:build darwin && !server && cgo

package main

/*
#include <stdint.h>
*/
import "C"
import "runtime/cgo"

//export completeWebViewGround
func completeWebViewGround(token C.uintptr_t) {
	handle := cgo.Handle(token)
	ready := handle.Value().(func())
	handle.Delete()
	ready()
}
