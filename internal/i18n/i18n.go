// Package i18n localizes the text Go shows: menus, window titles, dialogs,
// progress and errors. English is the source language; a catalog maps each
// English format string to its translation, so a missing entry still reads
// correctly, only in English.
package i18n

import (
	"fmt"
	"strings"
	"sync/atomic"
)

type Locale string

const (
	English     Locale = "en-US"
	Chinese     Locale = "zh-CN" // Simplified, mainland usage
	Traditional Locale = "zh-TW" // Traditional, Taiwan usage
)

var locales = []Locale{English, Chinese, Traditional}

// System is the language choice that follows the operating system.
const System = "system"

var current atomic.Value

// SetCurrent selects the locale every later translation uses.
func SetCurrent(l Locale) { current.Store(l) }

func Current() Locale {
	if l, ok := current.Load().(Locale); ok {
		return l
	}
	return English
}

// ValidChoice accepts "system" or one of the supported locales.
func ValidChoice(choice string) bool {
	return choice == System || supported(choice)
}

func supported(choice string) bool {
	for _, l := range locales {
		if choice == string(l) {
			return true
		}
	}
	return false
}

// Match maps a language tag such as "zh-Hans-CN", "zh_TW.UTF-8" or "en-GB"
// to a supported locale. Traditional script, or a Taiwan, Hong Kong or Macau
// region without a script, means Traditional Chinese; any other Chinese
// means Simplified.
func Match(tag string) (Locale, bool) {
	tag = strings.ToLower(strings.ReplaceAll(strings.TrimSpace(tag), "_", "-"))
	switch {
	case tag == "zh" || strings.HasPrefix(tag, "zh-"):
		parts := strings.Split(tag, "-")[1:]
		for _, part := range parts {
			switch part {
			case "hant":
				return Traditional, true
			case "hans":
				return Chinese, true
			}
		}
		for _, part := range parts {
			if part == "tw" || part == "hk" || part == "mo" {
				return Traditional, true
			}
		}
		return Chinese, true
	case tag == "en" || strings.HasPrefix(tag, "en-"):
		return English, true
	}
	return "", false
}

// Resolve picks the locale for a choice. "system" takes the first preferred
// language that is supported, and English when none is.
func Resolve(choice string, preferred []string) Locale {
	if supported(choice) {
		return Locale(choice)
	}
	for _, tag := range preferred {
		if l, ok := Match(tag); ok {
			return l
		}
	}
	return English
}

// T translates format into the current locale and formats it with args.
// Without args the translation is returned as is.
func T(format string, args ...any) string { return In(Current(), format, args...) }

// N marks a string for translation where it is stored, as in a table of
// labels that T translates later.
func N(s string) string { return s }

func In(l Locale, format string, args ...any) string {
	if translated, ok := catalogs[l][format]; ok {
		format = translated
	}
	if len(args) == 0 {
		return format
	}
	return fmt.Sprintf(strings.ReplaceAll(format, "%w", "%v"), args...)
}

// Error is an error whose message is translated when it is read, so it
// follows the language in use when it reaches the user.
type Error struct {
	format string
	args   []any
}

// Errorf is fmt.Errorf with a translatable format; %w wraps as usual.
func Errorf(format string, args ...any) error { return &Error{format: format, args: args} }

func (e *Error) Error() string { return T(e.format, e.args...) }

func (e *Error) Unwrap() []error {
	if !strings.Contains(e.format, "%w") {
		return nil
	}
	var wrapped []error
	for _, arg := range e.args {
		if err, ok := arg.(error); ok {
			wrapped = append(wrapped, err)
		}
	}
	return wrapped
}

var catalogs = map[Locale]map[string]string{Chinese: zhCN, Traditional: zhTW}
