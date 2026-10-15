package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"mousqueau/internal/buildinfo"
	"mousqueau/internal/i18n"
	"mousqueau/internal/media"
	"mousqueau/internal/project"
	"mousqueau/internal/settings"
	"mousqueau/internal/subtitle"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
)

// memoryKeys stands in for the keychain so tests never touch the real one.
type memoryKeys struct {
	mu    sync.Mutex
	items map[string]string
	fail  bool
	calls int
}

func (m *memoryKeys) Available() bool { return true }
func (m *memoryKeys) Get(_ context.Context, account string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.items[account], nil
}
func (m *memoryKeys) Set(_ context.Context, account, key string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.calls++
	if m.fail {
		return errors.New("keychain locked")
	}
	if m.items == nil {
		m.items = map[string]string{}
	}
	m.items[account] = key
	return nil
}
func (m *memoryKeys) Delete(_ context.Context, account string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.calls++
	if m.fail {
		return errors.New("keychain locked")
	}
	delete(m.items, account)
	return nil
}
func (m *memoryKeys) get(account string) string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.items[account]
}

// secret returns the credential an analysis with the provider in use would get.
func (s *EditorService) secret() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	active, _ := s.activeLocked()
	return strings.Join(active.secret, ":")
}
func provider(view SettingsView, id string) ProviderView {
	for _, p := range view.Providers {
		if p.ID == id {
			return p
		}
	}
	return ProviderView{}
}

func TestCredentialChangesStayConsistentWithTheStore(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "")
	keys := &memoryKeys{}
	s := &EditorService{settings: settings.Default(), keys: keys}
	view, err := s.SaveProviderKey("openai", []string{"  sk-first  "})
	if err != nil || provider(view, "openai").KeySource != "keychain" || keys.get("openai-api-key") != "sk-first" || s.secret() != "sk-first" {
		t.Fatalf("save: %+v %v", view, err)
	}
	keys.fail = true
	if _, err := s.SaveProviderKey("openai", []string{"sk-second"}); err == nil || s.secret() != "sk-first" {
		t.Fatal("failed save changed the key in use")
	}
	if view, err := s.RemoveProviderKey("openai"); err == nil || !provider(view, "openai").KeyStored || s.secret() != "sk-first" {
		t.Fatal("failed removal dropped the key in use")
	}
	keys.fail = false
	var wg sync.WaitGroup
	for i := 0; i < 40; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if i%2 == 0 {
				s.SaveProviderKey("openai", []string{fmt.Sprintf("sk-%d", i)})
			} else {
				s.RemoveProviderKey("openai")
			}
		}(i)
	}
	wg.Wait()
	stored := keys.get("openai-api-key")
	if s.secret() != stored || provider(s.GetSettings(), "openai").KeyStored != (stored != "") {
		t.Fatalf("cached key %q differs from stored key %q", s.secret(), stored)
	}
}

func TestSettingsPersistAndNeverExposeTheKey(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")
	s := &EditorService{settings: settings.Default(), settingsPath: path, storedKeys: map[string]string{"openai": "sk-keychain-PRIVATE"}}
	t.Setenv("OPENAI_API_KEY", "")
	view := s.GetSettings()
	if view.Theme != "system" || !view.OpenLastProject || !view.AutoUpdate || view.SetupDone || provider(view, "openai").KeySource != "keychain" || !provider(view, "openai").KeyStored {
		t.Fatalf("defaults: %+v", view)
	}
	if st := s.GetStatus(); !st.APIConfigured || st.Provider != "OpenAI" || st.ProviderCaution || s.secret() != "sk-keychain-PRIVATE" {
		t.Fatal("stored key not used")
	}
	t.Setenv("OPENAI_API_KEY", "sk-environment-PRIVATE")
	if view = s.GetSettings(); provider(view, "openai").KeySource != "env" || s.secret() != "sk-environment-PRIVATE" {
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
	if strings.Contains(string(data)+string(exposed), "PRIVATE") {
		t.Fatal("API key leaked into settings")
	}
}

func TestProvidersCanBeAddedConfiguredAndRemoved(t *testing.T) {
	for _, name := range []string{"OPENAI_API_KEY", "TENCENTCLOUD_SECRET_ID", "TENCENTCLOUD_SECRET_KEY"} {
		t.Setenv(name, "")
	}
	path := filepath.Join(t.TempDir(), "settings.json")
	keys := &memoryKeys{items: map[string]string{"deepgram-api-key": "left-over"}}
	s := &EditorService{settings: settings.Default(), settingsPath: path, keys: keys}
	if _, err := s.AddProvider("nope"); err == nil {
		t.Fatal("unknown provider added")
	}
	if _, err := s.SetProvider("tencent"); err == nil {
		t.Fatal("provider in use before it was added")
	}
	// A credential left in the keychain is picked up again.
	view, err := s.AddProvider("deepgram")
	if err != nil || !provider(view, "deepgram").Added || provider(view, "deepgram").KeySource != "keychain" || view.Provider != "openai" {
		t.Fatalf("add: %+v %v", view, err)
	}
	// Saving a credential adds the provider; two-part secrets are joined.
	if _, err := s.SaveProviderKey("tencent", []string{"AKID"}); err == nil {
		t.Fatal("missing SecretKey accepted")
	}
	if _, err := s.SaveProviderKey("tencent", []string{"AK:ID", "key"}); err == nil {
		t.Fatal("colon accepted in a two-part credential")
	}
	if view, err = s.SaveProviderKey("tencent", []string{"AKID", " sk "}); err != nil || !provider(view, "tencent").Added || keys.get("tencent-api-key") != "AKID:sk" {
		t.Fatalf("tencent: %+v %v", view, err)
	}
	if view, err = s.SetProvider("tencent"); err != nil || view.Provider != "tencent" {
		t.Fatalf("set: %+v %v", view, err)
	}
	if st := s.GetStatus(); !st.APIConfigured || !st.ProviderCaution || st.Provider == "" || s.secret() != "AKID:sk" {
		t.Fatalf("status: %+v", st)
	}
	t.Setenv("TENCENTCLOUD_SECRET_ID", "env-id")
	if s.secret() != "AKID:sk" {
		t.Fatal("one of two environment variables replaced the stored credential")
	}
	t.Setenv("TENCENTCLOUD_SECRET_KEY", "env-key")
	if s.secret() != "env-id:env-key" || provider(s.GetSettings(), "tencent").KeySource != "env" {
		t.Fatal("environment credential should win")
	}

	// A custom endpoint needs a URL and model, not a key.
	s.AddProvider("custom")
	if _, err := s.SetProviderOptions("custom", "whisper-1", "http://example.com/v1"); err == nil {
		t.Fatal("plain HTTP to another computer accepted")
	}
	if _, err := s.SetProviderOptions("custom", "bad model", ""); err == nil {
		t.Fatal("invalid model accepted")
	}
	if provider(s.GetSettings(), "custom").Ready {
		t.Fatal("custom provider ready without a URL")
	}
	if view, err = s.SetProviderOptions("custom", "whisper-1", "http://localhost:8000/v1"); err != nil || !provider(view, "custom").Ready || !provider(view, "custom").Caution {
		t.Fatalf("custom: %+v %v", provider(view, "custom"), err)
	}
	if view, _ = s.SetProviderOptions("deepgram", "nova-3", "https://ignored"); provider(view, "deepgram").Endpoint != "" || provider(view, "deepgram").Model != "nova-3" {
		t.Fatal("endpoint kept for a built-in provider")
	}

	// Removing the provider in use falls back to the first one left and
	// removes its credential.
	if view, err = s.RemoveProvider("tencent"); err != nil || view.Provider != "openai" || provider(view, "tencent").Added || keys.get("tencent-api-key") != "" {
		t.Fatalf("remove: %+v %v", view, err)
	}
	for _, id := range []string{"openai", "deepgram", "custom"} {
		s.RemoveProvider(id)
	}
	if st := s.GetStatus(); st.APIConfigured || st.Provider != "" {
		t.Fatalf("status without providers: %+v", st)
	}
	if _, err := s.Analyze(0, 60, true); err == nil || !strings.Contains(err.Error(), "provider") {
		t.Fatalf("analysis without a provider: %v", err)
	}
	saved, _ := settings.Load(path)
	if saved.Provider != "" || len(saved.Providers) != 0 {
		t.Fatalf("saved: %+v", saved)
	}
}

func TestLanguageFollowsTheSystemUntilChosen(t *testing.T) {
	defer i18n.SetCurrent(i18n.Current())
	path := filepath.Join(t.TempDir(), "settings.json")
	s := &EditorService{settings: settings.Default(), settingsPath: path, languages: []string{"zh-Hans-CN", "en-US"}}
	if _, err := s.SetLanguage("fr-FR"); err == nil {
		t.Fatal("unsupported language accepted")
	}
	view, err := s.SetLanguage("system")
	if err != nil || view.Language != "system" || view.Locale != "zh-CN" {
		t.Fatalf("system: %+v %v", view, err)
	}
	if _, err := s.EditCue(subtitle.Cue{}); err == nil || err.Error() != "请先导入 SRT 字幕" {
		t.Fatalf("error not in Chinese: %v", err)
	}
	if s.begin(i18n.N("Looking up the video…")); s.GetStatus().Phase != "正在查找视频…" {
		t.Fatalf("phase not in Chinese: %q", s.GetStatus().Phase)
	}
	s.finish()
	s.languages = []string{"zh-Hant-TW"}
	if view, err = s.SetLanguage("system"); err != nil || view.Locale != "zh-TW" {
		t.Fatalf("Taiwan: %+v %v", view, err)
	}
	if _, err := s.EditCue(subtitle.Cue{}); err == nil || err.Error() != "請先匯入 SRT 字幕" {
		t.Fatalf("error not in Traditional Chinese: %v", err)
	}
	s.languages = []string{"zh-Hant-HK"}
	if view, err = s.SetLanguage("system"); err != nil || view.Locale != "zh-HK" {
		t.Fatalf("Hong Kong system: %+v %v", view, err)
	}
	if _, err := s.EditCue(subtitle.Cue{}); err == nil || err.Error() != "請先匯入 SRT 字幕" {
		t.Fatalf("Hong Kong error: %v", err)
	}
	view, err = s.SetLanguage("zh-HK")
	if err != nil || view.Language != "zh-HK" || view.Locale != "zh-HK" {
		t.Fatalf("Hong Kong: %+v %v", view, err)
	}
	if saved, _ := settings.Load(path); saved.Language != "zh-HK" {
		t.Fatalf("Hong Kong not saved: %+v", saved)
	}
	view, err = s.SetLanguage("en-US")
	if err != nil || view.Language != "en-US" || view.Locale != "en-US" {
		t.Fatalf("English: %+v %v", view, err)
	}
	if _, err := s.EditCue(subtitle.Cue{}); err == nil || err.Error() != "import SRT subtitles first" {
		t.Fatalf("error not in English: %v", err)
	}
	if saved, _ := settings.Load(path); saved.Language != "en-US" {
		t.Fatalf("language not saved: %+v", saved)
	}
}

func TestMenuLabelsNameTheAppOnlyWhereTheyHaveRoom(t *testing.T) {
	defer i18n.SetCurrent(i18n.Current())
	for _, l := range []i18n.Locale{i18n.English, i18n.Chinese, i18n.Traditional, i18n.HongKong} {
		i18n.SetCurrent(l)
		for _, item := range roleLabels {
			label := roleLabel(item.label)
			if strings.Contains(label, "%!") {
				t.Errorf("%s: %q formats as %q", l, item.label, label)
			}
			if strings.Contains(item.label, "%[1]s") && !strings.Contains(label, "Mousqueau") {
				t.Errorf("%s: %q lost the app name: %q", l, item.label, label)
			}
		}
	}
}

func TestSubtitleFont(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")
	s := &EditorService{settings: settings.Default(), settingsPath: path}
	view, err := s.SetSubtitleFont("  PingFang TC ")
	if err != nil || view.SubtitleFont != "PingFang TC" {
		t.Fatalf("font: %+v %v", view, err)
	}
	if _, err := s.SetSubtitleFont(`x"; color: red`); err == nil || s.GetSettings().SubtitleFont != "PingFang TC" {
		t.Fatal("unsafe font name accepted")
	}
	if saved, _ := settings.Load(path); saved.SubtitleFont != "PingFang TC" {
		t.Fatalf("font not saved: %+v", saved)
	}
	if view, _ := s.SetSubtitleFont(""); view.SubtitleFont != "" {
		t.Fatal("font not reset")
	}
}

func TestToolPathFollowsSettings(t *testing.T) {
	dir := t.TempDir()
	// Windows only runs files with an executable extension.
	exe := ""
	if runtime.GOOS == "windows" {
		exe = ".exe"
	}
	tool := filepath.Join(dir, "ffmpeg"+exe)
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

	// A location that could not be saved must not take effect either.
	s.SetToolPath("ffmpeg", tool)
	blocker := filepath.Join(dir, "blocker")
	os.WriteFile(blocker, nil, 0600)
	s.settingsPath = filepath.Join(blocker, "settings.json")
	other := filepath.Join(dir, "other-ffmpeg"+exe)
	os.WriteFile(other, []byte("#!/bin/sh\n"), 0700)
	view, err = s.SetToolPath("ffmpeg", other)
	if path, _ := media.Tool("ffmpeg"); err == nil || path != tool || view.FFmpeg.Path != tool {
		t.Fatalf("unsaved location in use: %q %+v %v", path, view.FFmpeg, err)
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
		next := &EditorService{keys: &memoryKeys{}}
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

func TestGroundMatchesStartupColours(t *testing.T) {
	dark := ground(true)
	light := ground(false)
	if dark.Red != 0x0f || dark.Green != 0x0f || dark.Blue != 0x0f || dark.Alpha != 255 {
		t.Fatalf("dark ground %+v", dark)
	}
	if light.Red != 0xf2 || light.Green != 0xf4 || light.Blue != 0xf7 || light.Alpha != 255 {
		t.Fatalf("light ground %+v", light)
	}
	for _, path := range []string{"frontend/index.html", "frontend/src/colors.generated.css"} {
		body, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		for _, needle := range []string{"#0f0f0f", "#f2f4f7", "color-scheme"} {
			if !bytes.Contains(body, []byte(needle)) {
				t.Fatalf("%s missing %s", path, needle)
			}
		}
	}
}

func TestSettingsReportTheDeveloperBuild(t *testing.T) {
	s := &EditorService{settings: settings.Default()}
	if s.GetSettings().Developer != buildinfo.Developer {
		t.Fatal("settings did not report whether this is a developer build")
	}
}

func TestWindowURLNamesTheWindowAndItsChrome(t *testing.T) {
	saved := customChrome
	defer func() { customChrome = saved }()
	customChrome = false
	if got := windowURL(mainWindow, "system", "dark"); got != "/?systemTheme=dark&theme=system" {
		t.Fatalf("main window URL %q", got)
	}
	if got := windowURL(settingsWindow, "dark", "light"); got != "/?systemTheme=light&theme=dark&window=settings" {
		t.Fatalf("settings window URL %q", got)
	}
	customChrome = true
	if got := windowURL(mainWindow, "system", "light"); got != "/?chrome=custom&systemTheme=light&theme=system" {
		t.Fatalf("frameless main window URL %q", got)
	}
	if got := windowURL(welcomeWindow, "light", "dark"); got != "/?chrome=custom&systemTheme=dark&theme=light&window=welcome" {
		t.Fatalf("frameless welcome window URL %q", got)
	}
	if got := windowURL(mainWindow, "system", ""); got != "/?chrome=custom&theme=system" {
		t.Fatalf("window without native system appearance URL %q", got)
	}
}
