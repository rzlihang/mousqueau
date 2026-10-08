package main

import (
	"encoding/json"
	"mousqueau/internal/media"
	"mousqueau/internal/project"
	"mousqueau/internal/settings"
	"mousqueau/internal/subtitle"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSettingsPersistAndNeverExposeTheKey(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")
	s := &EditorService{settings: settings.Default(), settingsPath: path, storedKey: "sk-keychain-secret"}
	t.Setenv("OPENAI_API_KEY", "")
	view := s.GetSettings()
	if view.Theme != "system" || !view.OpenLastProject || !view.AutoUpdate || view.SetupDone || view.KeySource != "keychain" || !view.KeyStored {
		t.Fatalf("defaults: %+v", view)
	}
	if !s.GetStatus().APIConfigured || s.apiKey() != "sk-keychain-secret" {
		t.Fatal("stored key not used")
	}
	t.Setenv("OPENAI_API_KEY", "sk-environment-secret")
	if view = s.GetSettings(); view.KeySource != "env" || s.apiKey() != "sk-environment-secret" {
		t.Fatalf("environment key should win: %+v", view)
	}
	if _, err := s.SetTheme("neon"); err == nil {
		t.Fatal("unknown theme accepted")
	}
	if view, err := s.SetTheme("dark"); err != nil || view.Theme != "dark" {
		t.Fatalf("theme: %+v %v", view, err)
	}
	s.SetOpenLastProject(false)
	s.SetAutoUpdate(false)
	s.SetBeta(true)
	saved, err := settings.Load(path)
	if err != nil || saved.Theme != "dark" || saved.OpenLastProject || saved.AutoUpdate || !saved.Beta {
		t.Fatalf("saved: %+v %v", saved, err)
	}
	data, _ := os.ReadFile(path)
	exposed, _ := json.Marshal(s.GetSettings())
	if strings.Contains(string(data)+string(exposed), "secret") {
		t.Fatal("API key leaked into settings")
	}
}

func TestToolPathFollowsSettings(t *testing.T) {
	dir := t.TempDir()
	tool := filepath.Join(dir, "ffmpeg")
	os.WriteFile(tool, []byte("#!/bin/sh\n"), 0700)
	s := &EditorService{settings: settings.Default(), settingsPath: filepath.Join(dir, "settings.json")}
	t.Cleanup(func() { media.SetToolPath("ffmpeg", "") })
	if _, err := s.SetToolPath("curl", tool); err == nil {
		t.Fatal("unknown tool accepted")
	}
	view, err := s.SetToolPath("ffmpeg", "  "+tool+" ")
	if err != nil || !view.FFmpeg.Custom || view.FFmpeg.Path != tool {
		t.Fatalf("custom location: %+v %v", view.FFmpeg, err)
	}
	view, _ = s.SetToolPath("ffmpeg", filepath.Join(dir, "missing"))
	if view.FFmpeg.Ready || !view.FFmpeg.Custom || s.GetStatus().FFmpeg {
		t.Fatalf("missing location reported ready: %+v", view.FFmpeg)
	}
	if _, err := s.begin("test"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SetToolPath("ffmpeg", ""); err == nil {
		t.Fatal("tool changed while processing")
	}
	s.finish()
	if view, _ = s.SetToolPath("ffmpeg", ""); view.FFmpeg.Custom {
		t.Fatalf("automatic detection not restored: %+v", view.FFmpeg)
	}
}

func TestUpdateCheckSetupActionAndLastProject(t *testing.T) {
	dir := t.TempDir()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`[{"tag_name":"v99.0.0","html_url":"https://github.com/rzlihang/mousqueau/releases/tag/v99.0.0"}]`))
	}))
	defer server.Close()
	path := filepath.Join(dir, "settings.json")
	s := &EditorService{settings: settings.Default(), settingsPath: path, updateEndpoint: server.URL}
	view, err := s.CheckForUpdates()
	if err != nil || view.UpdateVersion != "99.0.0" || view.LastUpdateCheck == "" {
		t.Fatalf("update: %+v %v", view, err)
	}
	s.autoCheck() // setup is not finished, and the last check was just now
	server.Close()
	if _, err := s.CheckForUpdates(); err == nil {
		t.Fatal("unreachable server reported success")
	}

	if err := s.FinishSetup("format-disk"); err == nil {
		t.Fatal("unknown action accepted")
	}
	if err := s.FinishSetup("demo"); err != nil {
		t.Fatal(err)
	}
	if !s.GetSettings().SetupDone || s.TakePendingAction() != "demo" || s.TakePendingAction() != "" {
		t.Fatal("setup action not handed over exactly once")
	}

	// The last project reopens only while the preference is on.
	p := project.New([]subtitle.Cue{{ID: "c", Identifier: "1", Start: 0, End: 2, Text: "原文", SpeakerIDs: []string{}}}, "")
	data, _ := json.Marshal(p)
	projectPath := filepath.Join(dir, "project.json")
	os.WriteFile(projectPath, data, 0600)
	s.mu.Lock()
	s.rememberProjectLocked(projectPath)
	s.mu.Unlock()
	reopen := func() *EditorService {
		t.Setenv("XDG_CONFIG_HOME", dir)
		t.Setenv("HOME", dir)
		saved, _ := settings.Load(path)
		target, err := settings.Path()
		if err != nil {
			t.Fatal(err)
		}
		if err := saved.Save(target); err != nil {
			t.Fatal(err)
		}
		next := &EditorService{}
		next.loadSettings()
		return next
	}
	if next := reopen(); next.GetSnapshot().Project == nil || next.GetSnapshot().Project.State.Cues[0].Text != "原文" {
		t.Fatal("last project not reopened")
	}
	s.SetOpenLastProject(false)
	if next := reopen(); next.GetSnapshot().Project != nil {
		t.Fatal("last project reopened although disabled")
	}
}
