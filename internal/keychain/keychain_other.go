//go:build !darwin && !linux && !windows

package keychain

import (
	"context"
	"mousqueau/internal/i18n"
)

// No credential store is supported here; use the providers' environment
// variables.
func Available() bool { return false }

func Get(context.Context, string) (string, error) { return "", nil }
func Set(context.Context, string, string) error {
	return i18n.Errorf("storing an API key is not supported on this platform; set the provider's environment variable instead")
}
func Delete(context.Context, string) error { return nil }
