package i18n

import (
	"os"
	"strings"
)

// parseAppleLanguages reads the property list printed by
// `defaults read … AppleLanguages`, for example ("en-US", "zh-Hans-CN").
func parseAppleLanguages(out string) []string {
	var tags []string
	for _, line := range strings.Split(out, "\n") {
		tag := strings.Trim(strings.TrimSpace(line), `(),"`)
		if tag != "" {
			tags = append(tags, tag)
		}
	}
	return tags
}

// envLanguages follows the POSIX precedence: LANGUAGE lists several
// languages, then the first of LC_ALL, LC_MESSAGES and LANG that is set.
func envLanguages() []string {
	var tags []string
	for _, tag := range strings.Split(os.Getenv("LANGUAGE"), ":") {
		tags = appendTag(tags, tag)
	}
	for _, name := range []string{"LC_ALL", "LC_MESSAGES", "LANG"} {
		if value := os.Getenv(name); value != "" {
			return appendTag(tags, value)
		}
	}
	return tags
}

// appendTag drops the encoding and modifier of "zh_CN.UTF-8@pinyin" and
// skips the C locale, which names no language.
func appendTag(tags []string, value string) []string {
	if i := strings.IndexAny(value, ".@"); i >= 0 {
		value = value[:i]
	}
	if value == "" || value == "C" || value == "POSIX" {
		return tags
	}
	return append(tags, value)
}
