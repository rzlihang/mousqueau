package main

import "testing"

func TestWindowControlsFollowTheButtonLayout(t *testing.T) {
	for layout, want := range map[string]string{
		"appmenu:close":                   "",
		"appmenu:minimize,maximize,close": "minimise,maximise",
		"close,minimize:":                 "minimise",
		"menu:maximize, close":            "maximise",
	} {
		if got, ok := windowControls(layout); !ok || got != want {
			t.Errorf("layout %q kept %q, %v; want %q", layout, got, ok, want)
		}
	}
	if _, ok := windowControls(""); ok {
		t.Error("an unknown layout was followed")
	}
}
