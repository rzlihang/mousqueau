//go:build darwin && cgo

package main

import (
	"strings"
	"testing"
)

func TestPreferLanguageReachesFoundation(t *testing.T) {
	preferLanguage("zh-Hans", []string{"en-US", "ja-US", "zh-Hans-US"})
	if got := processLanguages(); len(got) < 2 || !strings.HasPrefix(got[0], "zh-Hans") || !strings.HasPrefix(got[1], "en") {
		t.Fatalf("Foundation still prefers %v", got)
	}
}
