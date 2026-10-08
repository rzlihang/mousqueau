package keychain

import (
	"strings"
	"testing"
)

func TestValidateRejectsValuesUnsafeForTheKeychainTool(t *testing.T) {
	for _, key := range []string{"sk-proj-Abc_123-xyz", "sk-0123456789abcdef.+/="} {
		if err := Validate(key); err != nil {
			t.Fatalf("%q rejected: %v", key, err)
		}
	}
	for _, key := range []string{"", "sk abc", "sk-'x'", `sk-"x"`, `sk-\x`, "sk-x\n", "sk-密钥", strings.Repeat("a", 513)} {
		if err := Validate(key); err == nil {
			t.Fatalf("%q accepted", key)
		}
	}
}
