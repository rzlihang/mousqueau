package main

import (
	"os"
	"path/filepath"
	"testing"

	"mousqueau/internal/omarchy"
	"mousqueau/internal/settings"
)

func TestDesktopThemeSwitch(t *testing.T) {
	omarchyLook := omarchy.Look{Present: true, Accent: "#f48fb8", Mode: "light", Radius: 8}
	path := filepath.Join(t.TempDir(), "settings.json")
	s := &EditorService{settings: settings.Default(), settingsPath: path, look: omarchyLook}
	view := s.GetSettings()
	if !view.DesktopTheme || !view.DesktopThemeAvailable || s.DesktopLook() != omarchyLook || s.darkTheme() {
		t.Fatalf("on Omarchy the theme is followed by default: %+v %+v", view, s.DesktopLook())
	}
	view, err := s.SetDesktopTheme(false)
	if err != nil || view.DesktopTheme || !view.DesktopThemeAvailable {
		t.Fatalf("off: %+v %v", view, err)
	}
	if s.DesktopLook().Present || s.desktopMode() != "" {
		t.Fatalf("the look is still followed: %+v", s.DesktopLook())
	}
	if saved, err := settings.Load(path); err != nil || saved.DesktopTheme {
		t.Fatalf("saved: %+v %v", saved, err)
	}
}

func TestDesktopThemeDefaultsOnForEarlierSettings(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")
	if err := os.WriteFile(path, []byte(`{"theme":"dark","openLastProject":false}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if loaded, err := settings.Load(path); err != nil || !loaded.DesktopTheme {
		t.Fatalf("loaded: %+v %v", loaded, err)
	}
}

func TestNoDesktopThemeAwayFromOmarchy(t *testing.T) {
	s := &EditorService{settings: settings.Default()}
	if view := s.GetSettings(); view.DesktopThemeAvailable || s.DesktopLook().Present {
		t.Fatalf("Omarchy reported where there is none: %+v", view)
	}
}
