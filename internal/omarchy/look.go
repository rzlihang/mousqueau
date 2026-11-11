// Package omarchy reads the look of an Omarchy desktop: the theme's accent
// and mode, and the window rounding Hyprland applies. It knows nothing about
// Wails so it can be tested headlessly.
package omarchy

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// Look is what the frontend follows. Present is false away from Omarchy, and
// the frontend then keeps its own colours and corners.
type Look struct {
	Present bool   `json:"present"`
	Accent  string `json:"accent"`
	Mode    string `json:"mode"`
	Radius  int    `json:"radius"`
}

// ThemeDir is where Omarchy links the current theme. A theme switch replaces
// the link, so it is read by path on every check rather than held open.
func ThemeDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".local", "state", "omarchy", "current", "theme")
}

var hexColour = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// ParseColors takes accent and mode from a theme's colors.toml. Only flat
// `key = "value"` lines are read; that is all Omarchy writes there.
func ParseColors(data []byte) (accent, mode string) {
	scanner := bufio.NewScanner(bytes.NewReader(data))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || line[0] == '#' || line[0] == '[' {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if i := strings.Index(value, "#"); i > 0 && value[0] != '"' {
			value = strings.TrimSpace(value[:i])
		}
		if len(value) >= 2 && value[0] == '"' {
			if end := strings.IndexByte(value[1:], '"'); end >= 0 {
				value = value[1 : end+1]
			}
		}
		switch key {
		case "accent":
			if hexColour.MatchString(value) {
				accent = strings.ToLower(value)
			}
		case "mode":
			if value == "dark" || value == "light" {
				mode = value
			}
		}
	}
	return accent, mode
}

// ParseRounding reads `hyprctl getoption decoration:rounding -j`. A value it
// cannot read counts as Omarchy's default of square corners.
func ParseRounding(data []byte) int {
	var option struct {
		Int *int `json:"int"`
	}
	if json.Unmarshal(data, &option) != nil || option.Int == nil || *option.Int < 0 {
		return 0
	}
	return *option.Int
}

// Reader turns the theme directory and Hyprland's answer into a Look.
// Rounding is injected so tests need no compositor.
type Reader struct {
	ThemeDir string
	Rounding func(context.Context) ([]byte, error)
}

// Read reports the current look; without a colors.toml there is no Omarchy.
func (r Reader) Read(ctx context.Context) Look {
	data, err := os.ReadFile(filepath.Join(r.ThemeDir, "colors.toml"))
	if err != nil {
		return Look{}
	}
	accent, mode := ParseColors(data)
	look := Look{Present: true, Accent: accent, Mode: mode}
	if r.Rounding != nil {
		if out, err := r.Rounding(ctx); err == nil {
			look.Radius = ParseRounding(out)
		}
	}
	return look
}

// Watch calls changed with each new look until ctx ends. Polling by path
// follows a theme switch, which swaps files and symlinks, without re-arming
// a file watcher, and also picks up a reloaded Hyprland rounding.
func (r Reader) Watch(ctx context.Context, every time.Duration, last Look, changed func(Look)) {
	ticker := time.NewTicker(every)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if look := r.Read(ctx); look != last {
				last = look
				changed(look)
			}
		}
	}
}
