package main

import (
	"reflect"
	"testing"
)

func TestPreferredOrderPutsTheAppLanguageFirst(t *testing.T) {
	system := []string{"en-US", "ja-US", "zh-Hans-US", "zh-Hant-US"}
	got := preferredOrder("zh-Hans", system)
	want := []string{"zh-Hans", "en-US", "ja-US", "zh-Hant-US"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}
