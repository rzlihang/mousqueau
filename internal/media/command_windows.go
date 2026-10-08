package media

import (
	"context"
	"os"
	"os/exec"
	"strconv"
	"time"
)

func command(ctx context.Context, name string, args ...string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Cancel = func() error {
		if cmd.Process == nil {
			return os.ErrProcessDone
		}
		// taskkill's /T terminates descendant FFmpeg processes as well.
		if err := exec.Command("taskkill", "/T", "/F", "/PID", strconv.Itoa(cmd.Process.Pid)).Run(); err != nil {
			return cmd.Process.Kill()
		}
		return nil
	}
	cmd.WaitDelay = 2 * time.Second
	return cmd
}
