package main

import (
	"mousqueau/internal/i18n"
	"reflect"
	"testing"
)

func TestAppleLanguageKeepsTaiwanAndHongKongApart(t *testing.T) {
	if appleLanguage[i18n.Traditional] != "zh-Hant" {
		t.Fatalf("Taiwan tag %q", appleLanguage[i18n.Traditional])
	}
	if appleLanguage[i18n.HongKong] != "zh-Hant-HK" {
		t.Fatalf("Hong Kong tag %q", appleLanguage[i18n.HongKong])
	}
}

func TestPreferredOrderPutsTheAppLanguageFirst(t *testing.T) {
	system := []string{"en-US", "ja-US", "zh-Hans-US", "zh-Hant-US"}
	got := preferredOrder("zh-Hans", system)
	want := []string{"zh-Hans", "en-US", "ja-US", "zh-Hant-US"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}
