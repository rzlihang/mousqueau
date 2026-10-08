package i18n

import (
	"context"
	"os/exec"
)

// SystemLanguages lists the user's preferred languages, most preferred first.
// A language chosen for this application in System Settings comes before the
// system-wide list.
func SystemLanguages(ctx context.Context, appID string) []string {
	for _, args := range [][]string{{"read", appID, "AppleLanguages"}, {"read", "-g", "AppleLanguages"}} {
		if out, err := exec.CommandContext(ctx, "/usr/bin/defaults", args...).Output(); err == nil {
			if tags := parseAppleLanguages(string(out)); len(tags) > 0 {
				return tags
			}
		}
	}
	return envLanguages()
}
