package media

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestToolPrefersConfiguredLocationAndFallsBackToKnownFolders(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("executable bits and fallback folders are Unix-only")
	}
	dir := t.TempDir()
	fallback := filepath.Join(dir, "fallback")
	os.Mkdir(fallback, 0700)
	found := filepath.Join(fallback, "mousqueau-test-tool")
	os.WriteFile(found, []byte("#!/bin/sh\n"), 0700)
	plain := filepath.Join(dir, "not-executable")
	os.WriteFile(plain, []byte("data"), 0600)
	saved := toolFolders
	toolFolders = []string{filepath.Join(dir, "missing"), fallback}
	t.Cleanup(func() { toolFolders = saved; SetToolPath("mousqueau-test-tool", "") })
	t.Setenv("PATH", filepath.Join(dir, "empty"))

	if path, ok := Tool("mousqueau-test-tool"); !ok || path != found {
		t.Fatalf("fallback folder: %q %v", path, ok)
	}
	if Dependency("mousqueau-absent-tool") {
		t.Fatal("absent tool reported ready")
	}
	// A configured location is authoritative, even when detection would succeed.
	for _, bad := range []string{plain, filepath.Join(dir, "gone"), "relative/tool", fallback} {
		SetToolPath("mousqueau-test-tool", bad)
		if path, ok := Tool("mousqueau-test-tool"); ok || path != bad {
			t.Fatalf("invalid location %q accepted: %q %v", bad, path, ok)
		}
	}
	SetToolPath("mousqueau-test-tool", found)
	if path, ok := Tool("mousqueau-test-tool"); !ok || path != found {
		t.Fatalf("configured location: %q %v", path, ok)
	}
	SetToolPath("mousqueau-test-tool", "")
	t.Setenv("PATH", fallback)
	if path, ok := Tool("mousqueau-test-tool"); !ok || path != found {
		t.Fatalf("PATH lookup: %q %v", path, ok)
	}
}
