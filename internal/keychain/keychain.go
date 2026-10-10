// Package keychain keeps the OpenAI API key in the operating system's
// credential store, so it never reaches project or settings files.
package keychain

import (
	"mousqueau/internal/i18n"
	"strings"
)

const (
	service = "Mousqueau"
	account = "openai-api-key"
)

// Validate accepts the printable, unquoted form API keys take. Rejecting
// everything else also keeps the value safe to hand to the keychain tool.
func Validate(key string) error {
	if key == "" {
		return i18n.Errorf("enter an API key")
	}
	if len(key) > 512 {
		return i18n.Errorf("API key is too long")
	}
	for _, r := range key {
		if r < 0x21 || r > 0x7e || strings.ContainsRune(`'"\`, r) {
			return i18n.Errorf("API key contains spaces, quotes, or non-ASCII characters")
		}
	}
	return nil
}
