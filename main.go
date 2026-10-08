package main

import (
	"embed"
	"github.com/wailsapp/wails/v3/pkg/application"
	"log"
)

// Bootstrapped using the official Wails v3 React/TypeScript template (beta.28).
//
//go:embed all:frontend/dist examples/*
var assets embed.FS

func main() {
	service := &EditorService{}
	app := application.New(application.Options{
		Name: "Mousqueau", Description: "Correct existing subtitles and identify speakers",
		Services: []application.Service{application.NewService(service)},
		Assets:   application.AssetOptions{Handler: application.AssetFileServerFS(assets), Middleware: service.mediaMiddleware},
		Mac:      application.MacOptions{ApplicationShouldTerminateAfterLastWindowClosed: true},
	})
	service.app = app
	app.Window.NewWithOptions(application.WebviewWindowOptions{Title: "Mousqueau", Width: 1440, Height: 920, MinWidth: 1000, MinHeight: 700, URL: "/"})
	defer service.Cancel()
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
