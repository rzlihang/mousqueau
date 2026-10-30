package main

import (
	"strings"
	"sync"
)

// The desktop's title bar button layout, in GTK's form such as
// "appmenu:minimize,maximize,close", decides which window controls to draw;
// tiling desktops like Hyprland keep only close. Empty when the desktop does
// not say.
var desktopButtonLayout = sync.OnceValue(readButtonLayout)

// windowControls names the drawn controls besides close that a layout keeps,
// or reports false when there is no layout to follow. Close is always drawn.
func windowControls(layout string) (string, bool) {
	if strings.TrimSpace(layout) == "" {
		return "", false
	}
	var kept []string
	for _, button := range strings.FieldsFunc(layout, func(r rune) bool { return r == ':' || r == ',' }) {
		switch strings.TrimSpace(button) {
		case "minimize":
			kept = append(kept, "minimise")
		case "maximize":
			kept = append(kept, "maximise")
		}
	}
	return strings.Join(kept, ","), true
}
