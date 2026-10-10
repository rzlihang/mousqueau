// Package settings stores application preferences in one small JSON file.
// Credentials are never written here.
package settings

import (
	"encoding/json"
	"errors"
	"io/fs"
	"mousqueau/internal/i18n"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

type Settings struct {
	Theme           string    `json:"theme"`
	Language        string    `json:"language"`               // "system" or an i18n locale
	SubtitleFont    string    `json:"subtitleFont,omitempty"` // a font family; empty is the interface font
	OpenLastProject bool      `json:"openLastProject"`
	LastProject     string    `json:"lastProject,omitempty"`
	SetupDone       bool      `json:"setupDone"`
	FFmpegPath      string    `json:"ffmpegPath,omitempty"`
	YTDLPPath       string    `json:"ytdlpPath,omitempty"`
	AutoUpdate      bool      `json:"autoUpdate"`
	Beta            bool      `json:"beta"`
	LastUpdateCheck time.Time `json:"lastUpdateCheck,omitzero"`
}

func Default() Settings {
	return Settings{Theme: "system", Language: i18n.System, OpenLastProject: true, AutoUpdate: true}
}

func ValidTheme(theme string) bool {
	return theme == "system" || theme == "light" || theme == "dark"
}

// ValidateFont accepts an empty name or a font family name that can be
// quoted in CSS as it is.
func ValidateFont(name string) error {
	if utf8.RuneCountInString(name) > 100 {
		return i18n.Errorf("font name is too long")
	}
	if strings.ContainsAny(name, `"'\;{}<>`) || strings.IndexFunc(name, unicode.IsControl) >= 0 {
		return i18n.Errorf("font names cannot contain quotes, backslashes, semicolons, braces or angle brackets")
	}
	return nil
}

// Path is the settings file inside the user's configuration directory.
func Path() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "Mousqueau", "settings.json"), nil
}

// Load returns the defaults when the file does not exist yet. Unknown or
// damaged content also falls back to the defaults, with the error reported.
func Load(path string) (Settings, error) {
	result := Default()
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return result, nil
	}
	if err != nil {
		return result, err
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return Default(), err
	}
	if !ValidTheme(result.Theme) {
		result.Theme = "system"
	}
	if !i18n.ValidChoice(result.Language) {
		result.Language = i18n.System
	}
	if ValidateFont(result.SubtitleFont) != nil {
		result.SubtitleFont = ""
	}
	return result, nil
}

// Save replaces the file atomically so a crash cannot leave it half-written.
func (s Settings) Save(path string) error {
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), "settings-*.json")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}
