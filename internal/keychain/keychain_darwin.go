package keychain

import (
	"context"
	"errors"
	"fmt"
	"mousqueau/internal/i18n"
	"os/exec"
	"strings"
)

const tool = "/usr/bin/security"

// errSecItemNotFound, as reported by the security tool's exit status.
const notFound = 44

func Available() bool { return true }

// Get returns "" when no key has been stored.
func Get(ctx context.Context) (string, error) {
	out, err := exec.CommandContext(ctx, tool, "find-generic-password", "-s", service, "-a", account, "-w").Output()
	if err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) && exit.ExitCode() == notFound {
			return "", nil
		}
		return "", i18n.Errorf("cannot read the macOS keychain")
	}
	return strings.TrimRight(string(out), "\r\n"), nil
}

// Set stores or replaces the key. The command goes through stdin so the key
// never appears in the process list.
func Set(ctx context.Context, key string) error {
	if err := Validate(key); err != nil {
		return err
	}
	cmd := exec.CommandContext(ctx, tool, "-i")
	cmd.Stdin = strings.NewReader(fmt.Sprintf("add-generic-password -U -s %s -a %s -w '%s'\n", service, account, key))
	if err := cmd.Run(); err != nil {
		return i18n.Errorf("cannot save to the macOS keychain")
	}
	// The interactive tool exits 0 even when a command fails, so confirm.
	stored, err := Get(ctx)
	if err != nil || stored != key {
		return i18n.Errorf("cannot save to the macOS keychain")
	}
	return nil
}

func Delete(ctx context.Context) error {
	err := exec.CommandContext(ctx, tool, "delete-generic-password", "-s", service, "-a", account).Run()
	var exit *exec.ExitError
	if err != nil && !(errors.As(err, &exit) && exit.ExitCode() == notFound) {
		return i18n.Errorf("cannot remove the key from the macOS keychain")
	}
	return nil
}
