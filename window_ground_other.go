//go:build !darwin || server || !cgo

package main

import "github.com/wailsapp/wails/v3/pkg/application"

func deferShowForWebViewGround() bool { return false }

func systemDarkTheme(app *application.App) bool {
	return app != nil && app.Env.IsDarkMode()
}

// Other platforms keep using the webview media query for the first paint.
func windowSystemTheme(*application.App) string { return "" }

func paintWebViewGround(application.Window, application.RGBA) {}

func revealDarwinGround(*EditorService, application.Window, bool) {}
