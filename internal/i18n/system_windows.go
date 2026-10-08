package i18n

import (
	"context"
	"syscall"
	"unsafe"
)

const muiLanguageName = 0x8

var preferredUILanguages = syscall.NewLazyDLL("kernel32.dll").NewProc("GetUserPreferredUILanguages")

// SystemLanguages lists the user's preferred display languages, most
// preferred first.
func SystemLanguages(context.Context, string) []string {
	var count, size uint32
	if r, _, _ := preferredUILanguages.Call(muiLanguageName, uintptr(unsafe.Pointer(&count)), 0, uintptr(unsafe.Pointer(&size))); r == 0 || size == 0 {
		return envLanguages()
	}
	buf := make([]uint16, size)
	if r, _, _ := preferredUILanguages.Call(muiLanguageName, uintptr(unsafe.Pointer(&count)), uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&size))); r == 0 {
		return envLanguages()
	}
	// A list of NUL-terminated names ending with an empty one.
	var tags []string
	for start, i := 0, 0; i < len(buf); i++ {
		if buf[i] == 0 {
			if i == start {
				break
			}
			tags = append(tags, syscall.UTF16ToString(buf[start:i]))
			start = i + 1
		}
	}
	return tags
}
