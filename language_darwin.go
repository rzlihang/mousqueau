//go:build darwin && cgo

package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Foundation
#import <Foundation/Foundation.h>
#include <stdlib.h>

// preferLanguages puts tags ahead of the user's languages for this process
// only, as launching with -AppleLanguages would; nothing is saved.
static void preferLanguages(const char *joined) {
	@autoreleasepool {
		NSArray *tags = [[NSString stringWithUTF8String:joined] componentsSeparatedByString:@","];
		NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
		NSMutableDictionary *args = [[defaults volatileDomainForName:NSArgumentDomain] mutableCopy];
		args[@"AppleLanguages"] = tags;
		[defaults setVolatileDomain:args forName:NSArgumentDomain];
	}
}

static char *preferredLanguages(void) {
	@autoreleasepool {
		return strdup([[[NSLocale preferredLanguages] componentsJoinedByString:@","] UTF8String]);
	}
}
*/
import "C"

import (
	"strings"
	"unsafe"
)

// preferLanguage makes AppKit treat the app's language as the user's first
// choice, so menus and other native text pick that script's fonts. With
// Japanese ahead of Chinese in System Settings, Chinese menu labels were
// otherwise drawn in a Japanese font. It must run before AppKit starts and
// takes effect for the rest of the process, so a later change needs a relaunch.
func preferLanguage(tag string, system []string) {
	joined := C.CString(strings.Join(preferredOrder(tag, system), ","))
	defer C.free(unsafe.Pointer(joined))
	C.preferLanguages(joined)
}

func processLanguages() []string {
	out := C.preferredLanguages()
	defer C.free(unsafe.Pointer(out))
	return strings.Split(C.GoString(out), ",")
}
