package keychain

import (
	"bytes"
	"context"
	"errors"
	"mousqueau/internal/i18n"
	"os/exec"
	"strings"
)

// Linux keeps the key in the Secret Service (GNOME Keyring, KWallet) through
// libsecret's secret-tool, so no D-Bus code is linked into the application.
func attributes(account string) []string { return []string{"service", service, "account", account} }

func tool() (string, bool) {
	path, err := exec.LookPath("secret-tool")
	return path, err == nil
}

func Available() bool { _, ok := tool(); return ok }

// run reports whether the item existed. secret-tool exits 1 both when nothing
// matches and on failure; only a failure writes to stderr.
func run(ctx context.Context, account, stdin string, args ...string) (string, bool, error) {
	if err := validAccount(account); err != nil {
		return "", false, err
	}
	path, ok := tool()
	if !ok {
		return "", false, i18n.Errorf("secret-tool is not installed")
	}
	cmd := exec.CommandContext(ctx, path, append(args, attributes(account)...)...)
	var stdout, stderr bytes.Buffer
	cmd.Stdin, cmd.Stdout, cmd.Stderr = strings.NewReader(stdin), &stdout, &stderr
	err := cmd.Run()
	var exit *exec.ExitError
	if errors.As(err, &exit) && exit.ExitCode() == 1 && strings.TrimSpace(stderr.String()) == "" {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return stdout.String(), true, nil
}

// Get returns "" when no key has been stored.
func Get(ctx context.Context, account string) (string, error) {
	out, _, err := run(ctx, account, "", "lookup")
	if err != nil {
		return "", i18n.Errorf("cannot read the system keyring")
	}
	return strings.TrimRight(out, "\r\n"), nil
}

// Set stores or replaces the key. It goes through stdin so it never appears
// in the process list.
func Set(ctx context.Context, account, key string) error {
	if err := Validate(key); err != nil {
		return err
	}
	if _, stored, err := run(ctx, account, key, "store", "--label=Mousqueau "+account); err != nil || !stored {
		return i18n.Errorf("cannot save to the system keyring")
	}
	if stored, err := Get(ctx, account); err != nil || stored != key {
		return i18n.Errorf("cannot save to the system keyring")
	}
	return nil
}

func Delete(ctx context.Context, account string) error {
	if _, _, err := run(ctx, account, "", "clear"); err != nil {
		return i18n.Errorf("cannot remove the key from the system keyring")
	}
	return nil
}
