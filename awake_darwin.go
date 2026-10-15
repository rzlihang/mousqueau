//go:build darwin && cgo && !server

package main

/*
#cgo LDFLAGS: -framework IOKit -framework CoreFoundation
#include <IOKit/pwr_mgt/IOPMLib.h>
#include <stdlib.h>

// holdDisplay asserts what `caffeinate -d` does: no idle display sleep,
// which also keeps the screen saver from starting.
static IOReturn holdDisplay(const char *reason, IOPMAssertionID *id) {
	CFStringRef name = CFStringCreateWithCString(NULL, reason, kCFStringEncodingUTF8);
	IOReturn rc = IOPMAssertionCreateWithName(kIOPMAssertionTypePreventUserIdleDisplaySleep,
		kIOPMAssertionLevelOn, name, id);
	CFRelease(name);
	return rc;
}
*/
import "C"

import (
	"fmt"
	"unsafe"
)

func platformHoldAwake(reason string) (func(), error) {
	name := C.CString(reason)
	defer C.free(unsafe.Pointer(name))
	var id C.IOPMAssertionID
	if rc := C.holdDisplay(name, &id); rc != C.kIOReturnSuccess {
		return nil, fmt.Errorf("IOPMAssertionCreateWithName failed: %#x", uint32(rc))
	}
	return func() { C.IOPMAssertionRelease(id) }, nil
}
