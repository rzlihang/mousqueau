//go:build production

package buildinfo

import "testing"

func TestDeveloper(t *testing.T) {
	if Developer {
		t.Fatal("builds with -tags production are not developer builds")
	}
}
