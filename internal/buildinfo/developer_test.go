//go:build !production

package buildinfo

import "testing"

func TestDeveloper(t *testing.T) {
	if !Developer {
		t.Fatal("builds without -tags production are developer builds")
	}
}
