//go:build linux && !server

package main

import "github.com/godbus/dbus/v5"

// The settings portal relays GNOME's button layout, which GTK apps follow on
// other desktops too.
func readButtonLayout() string {
	conn, err := dbus.ConnectSessionBus()
	if err != nil {
		return ""
	}
	defer conn.Close()
	portal := conn.Object("org.freedesktop.portal.Desktop", "/org/freedesktop/portal/desktop")
	var value dbus.Variant
	if err := portal.Call("org.freedesktop.portal.Settings.ReadOne", 0, "org.gnome.desktop.wm.preferences", "button-layout").Store(&value); err != nil {
		return ""
	}
	layout, _ := value.Value().(string)
	return layout
}
