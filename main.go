package main

import (
	"embed"
	"github.com/wailsapp/wails/v3/pkg/application"
	"log"
	"mousqueau/internal/i18n"
)

// Bootstrapped using the official Wails v3 React/TypeScript template (beta.28).
//
//go:embed all:frontend/dist examples/*
var assets embed.FS

func main() {
	service := &EditorService{}
	// Settings come first so the language is known before any native text.
	service.loadSettings()
	if first, _ := i18n.Match(firstOf(service.languages)); first != i18n.Current() {
		preferLanguage(appleLanguage[i18n.Current()], service.languages)
	}
	app := application.New(application.Options{
		Name: "Mousqueau", Description: i18n.T("Correct existing subtitles and identify speakers"),
		Services: []application.Service{application.NewService(service)},
		Assets:   application.AssetOptions{Handler: application.AssetFileServerFS(assets), Middleware: service.mediaMiddleware},
		Mac:      application.MacOptions{ApplicationShouldTerminateAfterLastWindowClosed: true},
	})
	service.app = app
	service.openWindows()
	defer service.Cancel()
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
