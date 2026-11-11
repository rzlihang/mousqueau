package main

import (
	"context"
	"os/exec"
	"runtime"
	"time"

	"mousqueau/internal/omarchy"
)

// lookReader follows Omarchy's theme and Hyprland's rounding. Only Linux can
// be running Omarchy; elsewhere the reader finds no theme and stays absent.
func lookReader() omarchy.Reader {
	if runtime.GOOS != "linux" {
		return omarchy.Reader{}
	}
	return omarchy.Reader{ThemeDir: omarchy.ThemeDir(), Rounding: func(ctx context.Context) ([]byte, error) {
		ctx, cancel := context.WithTimeout(ctx, time.Second)
		defer cancel()
		return exec.CommandContext(ctx, "hyprctl", "getoption", "decoration:rounding", "-j").Output()
	}}
}

// DesktopLook is the desktop's accent, mode and window rounding, so the
// interface matches the windows around it. Present is false off Omarchy, or
// when following its theme is turned off in Settings.
func (s *EditorService) DesktopLook() omarchy.Look {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.lookLocked()
}

func (s *EditorService) lookLocked() omarchy.Look {
	if !s.settings.DesktopTheme {
		return omarchy.Look{}
	}
	return s.look
}

// lookChanged repaints the native grounds and hands the look to every window.
func (s *EditorService) lookChanged() {
	s.repaintGrounds()
	if s.app != nil {
		s.app.Event.Emit("desktop-look", s.DesktopLook())
	}
}

// followDesktopLook reads the look before the first window so its colours
// are right from the start, then keeps it current until the app quits.
func (s *EditorService) followDesktopLook(ctx context.Context) {
	reader := lookReader()
	if reader.ThemeDir == "" {
		return
	}
	look := reader.Read(ctx)
	s.mu.Lock()
	s.look = look
	s.mu.Unlock()
	go reader.Watch(ctx, time.Second, look, func(look omarchy.Look) {
		s.mu.Lock()
		appeared := s.look.Present != look.Present
		s.look = look
		s.mu.Unlock()
		s.lookChanged()
		if appeared {
			// Settings offers the switch only while Omarchy is there.
			s.notify()
		}
	})
}

// desktopMode is Omarchy's light or dark mode, which the System theme follows
// there, or "" when the desktop does not say. It colours the native window
// only: the web view gets the mode with the look, and keeps its own media
// query for when following is turned off.
func (s *EditorService) desktopMode() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	if look := s.lookLocked(); look.Present {
		return look.Mode
	}
	return ""
}
