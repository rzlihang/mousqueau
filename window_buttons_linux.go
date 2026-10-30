//go:build linux && !server

package main

import (
	"context"
	"time"

	"github.com/godbus/dbus/v5"
)

// The settings portal relays GNOME's button layout, which GTK apps follow on
// other desktops too. It is read before the first window opens, so a portal
// that does not answer promptly leaves the default controls.
func readButtonLayout() string {
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	conn, err := dbus.ConnectSessionBus(dbus.WithContext(ctx))
	if err != nil {
		return ""
	}
	defer conn.Close()
	portal := conn.Object("org.freedesktop.portal.Desktop", "/org/freedesktop/portal/desktop")
	var value dbus.Variant
	if err := portal.CallWithContext(ctx, "org.freedesktop.portal.Settings.ReadOne", 0, "org.gnome.desktop.wm.preferences", "button-layout").Store(&value); err != nil {
		return ""
	}
	layout, _ := value.Value().(string)
	return layout
}
