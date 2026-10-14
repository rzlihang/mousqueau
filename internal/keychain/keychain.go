// Package keychain keeps provider credentials in the operating system's
// credential store, so they never reach project or settings files. Each
// provider has its own item, named by Account.
package keychain

import (
	"mousqueau/internal/i18n"
	"strings"
)

const service = "Mousqueau"

// Account names a provider's item; OpenAI's keeps the name it always had.
func Account(provider string) string { return provider + "-api-key" }

// validAccount keeps item names to the lowercase letters, digits and hyphens
// Account produces, which the keychain tools take as they are.
func validAccount(account string) error {
	if account == "" || len(account) > 64 {
		return i18n.Errorf("invalid credential name")
	}
	for _, r := range account {
		if !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '-') {
			return i18n.Errorf("invalid credential name")
		}
	}
	return nil
}

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
