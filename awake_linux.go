//go:build linux && !server

package main

import "github.com/godbus/dbus/v5"

// The freedesktop screen saver interface, which GNOME, KDE and most
// desktops implement, holds the screen saver and display blanking off.
func platformHoldAwake(reason string) (func(), error) {
	conn, err := dbus.ConnectSessionBus()
	if err != nil {
		return nil, err
	}
	saver := conn.Object("org.freedesktop.ScreenSaver", "/org/freedesktop/ScreenSaver")
	var cookie uint32
	if err := saver.Call("org.freedesktop.ScreenSaver.Inhibit", 0, "Mousqueau", reason).Store(&cookie); err != nil {
		conn.Close()
		return nil, err
	}
	return func() {
		saver.Call("org.freedesktop.ScreenSaver.UnInhibit", 0, cookie)
		conn.Close()
	}, nil
}
