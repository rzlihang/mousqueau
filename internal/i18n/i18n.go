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
	English Locale = "en-US"
	Chinese Locale = "zh-CN"
)

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
	return choice == System || choice == string(English) || choice == string(Chinese)
}

// Match maps a language tag such as "zh-Hans-CN", "zh_TW.UTF-8" or "en-GB"
// to a supported locale. Every Chinese variant uses Simplified Chinese, the
// only Chinese translation.
func Match(tag string) (Locale, bool) {
	tag = strings.ToLower(strings.ReplaceAll(strings.TrimSpace(tag), "_", "-"))
	switch {
	case tag == "zh" || strings.HasPrefix(tag, "zh-"):
		return Chinese, true
	case tag == "en" || strings.HasPrefix(tag, "en-"):
		return English, true
	}
	return "", false
}

// Resolve picks the locale for a choice. "system" takes the first preferred
// language that is supported, and English when none is.
func Resolve(choice string, preferred []string) Locale {
	if choice == string(English) || choice == string(Chinese) {
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

var catalogs = map[Locale]map[string]string{Chinese: zhCN}
