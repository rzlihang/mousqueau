//go:build !windows

package media

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCancelActiveProcess(t *testing.T) {
	path := filepath.Join(t.TempDir(), "started")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cmd := command(ctx, "sh", "-c", `printf started > "$1"; sleep 30 & wait`, "test", path)
	done := make(chan error, 1)
	go func() { done <- cmd.Run() }()
	deadline := time.Now().Add(3 * time.Second)
	for {
		if _, err := os.Stat(path); err == nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("test subprocess did not start")
		}
		time.Sleep(10 * time.Millisecond)
	}
	cancel()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("active command completed without cancellation")
		}
		if !errors.Is(ctx.Err(), context.Canceled) {
			t.Fatal("missing cancellation")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("cancel did not stop process group promptly")
	}
}
