//go:build !darwin && !linux && !windows

package keychain

import (
	"context"
	"mousqueau/internal/i18n"
)

// No credential store is supported here; use OPENAI_API_KEY.
func Available() bool { return false }

func Get(context.Context) (string, error) { return "", nil }
func Set(context.Context, string) error {
	return i18n.Errorf("storing an API key is not supported on this platform; set OPENAI_API_KEY instead")
}
func Delete(context.Context) error { return nil }
