//go:build !darwin && !windows

package i18n

import "context"

// SystemLanguages lists the user's preferred languages, most preferred first.
func SystemLanguages(context.Context, string) []string { return envLanguages() }
