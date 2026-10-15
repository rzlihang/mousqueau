//go:build darwin && !server && cgo

package main

import (
	"os/exec"
	"strings"
	"testing"

	"mousqueau/internal/settings"
)

func TestDarkThemeReadsSystemAppearanceBeforeAppRun(t *testing.T) {
	output, err := exec.CommandContext(t.Context(), "/usr/bin/defaults", "read", "-g", "AppleInterfaceStyle").CombinedOutput()
	if err != nil && !strings.Contains(string(output), "does not exist") {
		t.Fatalf("read macOS appearance: %v: %s", err, output)
	}
	want := strings.TrimSpace(string(output)) == "Dark"
	service := &EditorService{settings: settings.Settings{Theme: "system"}}
	if got := service.darkTheme(); got != want {
		t.Fatalf("before app.Run: dark = %v, macOS preference = %v", got, want)
	}
}
