//go:build !darwin

package keychain

import (
	"context"
	"mousqueau/internal/i18n"
)

// Only the macOS keychain is supported; elsewhere use OPENAI_API_KEY.
func Available() bool { return false }

func Get(context.Context) (string, error) { return "", nil }
func Set(context.Context, string) error {
	return i18n.Errorf("storing an API key is only supported on macOS; set OPENAI_API_KEY instead")
}
func Delete(context.Context) error { return nil }
