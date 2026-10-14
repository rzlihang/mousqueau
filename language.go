package main

import (
	"mousqueau/internal/i18n"
	"strings"
)

// appleLanguage is the macOS language tag for an app locale.
var appleLanguage = map[i18n.Locale]string{
	i18n.English:     "en",
	i18n.Chinese:     "zh-Hans",
	i18n.Traditional: "zh-Hant",
}

// preferredOrder puts tag first and keeps the rest of the user's languages
// after it, without repeating it.
func preferredOrder(tag string, system []string) []string {
	order := []string{tag}
	for _, l := range system {
		if l != tag && !strings.HasPrefix(l, tag+"-") {
			order = append(order, l)
		}
	}
	return order
}

func firstOf(languages []string) string {
	if len(languages) == 0 {
		return ""
	}
	return languages[0]
}
