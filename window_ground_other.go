//go:build !darwin || server || !cgo

package main

import "github.com/wailsapp/wails/v3/pkg/application"

func deferShowForWebViewGround() bool { return false }

func paintWebViewGround(application.Window, application.RGBA) {}

func revealDarwinGround(*EditorService, application.Window, bool) {}
