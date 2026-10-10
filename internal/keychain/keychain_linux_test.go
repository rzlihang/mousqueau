package keychain

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// fakeSecretTool behaves like secret-tool against a one-item store and logs
// its arguments.
const fakeSecretTool = `#!/bin/sh
echo "$@" >> "$FAKE_DIR/args"
if [ -n "$FAKE_FAIL" ]; then echo "secret-tool: Cannot autolaunch D-Bus" >&2; exit 1; fi
case "$1" in
lookup) [ -f "$FAKE_DIR/item" ] || exit 1; cat "$FAKE_DIR/item" ;;
store) cat > "$FAKE_DIR/item" ;;
clear) [ -f "$FAKE_DIR/item" ] || exit 1; rm "$FAKE_DIR/item" ;;
esac
`

func TestSecretToolStoreReadsAndRemovesTheKey(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "secret-tool"), []byte(fakeSecretTool), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("FAKE_DIR", dir)
	ctx := context.Background()
	if !Available() {
		t.Fatal("secret-tool on PATH not found")
	}
	if key, err := Get(ctx); key != "" || err != nil {
		t.Fatalf("missing item: %q %v", key, err)
	}
	if err := Set(ctx, "sk-test-123"); err != nil {
		t.Fatal(err)
	}
	if key, err := Get(ctx); key != "sk-test-123" || err != nil {
		t.Fatalf("stored item: %q %v", key, err)
	}
	if err := Delete(ctx); err != nil {
		t.Fatal(err)
	}
	if err := Delete(ctx); err != nil {
		t.Fatalf("deleting a missing item: %v", err)
	}
	args, _ := os.ReadFile(filepath.Join(dir, "args"))
	if strings.Contains(string(args), "sk-test") || !strings.Contains(string(args), "service Mousqueau account openai-api-key") {
		t.Fatalf("arguments: %s", args)
	}

	t.Setenv("FAKE_FAIL", "1")
	if _, err := Get(ctx); err == nil {
		t.Fatal("a failing keyring read as empty")
	}
	if err := Set(ctx, "sk-test-123"); err == nil {
		t.Fatal("a failing keyring accepted the key")
	}
	if err := Delete(ctx); err == nil {
		t.Fatal("a failing keyring reported the key removed")
	}
}
