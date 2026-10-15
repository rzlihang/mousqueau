package main

import (
	"context"
	"mousqueau/internal/analysis"
	"mousqueau/internal/buildinfo"
	"mousqueau/internal/i18n"
	"mousqueau/internal/keychain"
	"mousqueau/internal/media"
	"mousqueau/internal/project"
	"mousqueau/internal/settings"
	"mousqueau/internal/update"
	"net/url"
	"os"
	"runtime"
	"slices"
	"strings"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// Overridden at release time with -ldflags "-X main.version=…".
var version = "0.1.0"

// Matches CFBundleIdentifier, where macOS keeps a per-application language.
const appID = "com.rzlihang.mousqueau"

const (
	mainWindow       = "main"
	settingsWindow   = "settings"
	welcomeWindow    = "welcome"
	dictionaryWindow = "dictionary"
)

// Elsewhere than macOS the windows have no native frame; the frontend draws
// the window controls at the right of its own title bar, where macOS keeps
// the traffic lights on the left.
var customChrome = runtime.GOOS != "darwin"

// windowURL tells the frontend which window it is, whether to draw the
// window controls, and a theme chosen in Settings to paint before its
// settings arrive. Seed the system appearance too: a new hidden web view's
// media query can lag the native appearance.
func windowURL(name, theme, systemTheme string) string {
	query := url.Values{}
	if name != mainWindow {
		query.Set("window", name)
	}
	if customChrome {
		query.Set("chrome", "custom")
	}
	if theme == "dark" || theme == "light" || theme == "system" {
		query.Set("theme", theme)
	}
	if systemTheme == "dark" || systemTheme == "light" {
		query.Set("systemTheme", systemTheme)
	}
	return "/?" + query.Encode()
}

func (s *EditorService) theme() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.settings.Theme
}

// darkTheme resolves the theme setting, following the system for "system".
func (s *EditorService) darkTheme() bool {
	switch s.theme() {
	case "dark":
		return true
	case "light":
		return false
	}
	return systemDarkTheme(s.app)
}

// repaintGrounds keeps open windows on the theme colour: the native window,
// and on macOS the web view, which is what actually shows before the page
// and while a window resizes.
func (s *EditorService) repaintGrounds() {
	if s.app == nil {
		return
	}
	colour := ground(s.darkTheme())
	for _, name := range []string{mainWindow, settingsWindow, welcomeWindow, dictionaryWindow} {
		if window := s.window(name); window != nil {
			window.SetBackgroundColour(colour)
			paintWebViewGround(window, colour)
		}
	}
}

// deferWindowShow keeps a macOS window hidden until its web view has been
// painted, then shows it when show is true. Other platforms show on their own.
func (s *EditorService) deferWindowShow(name string, show bool) bool {
	if s.app == nil || !deferShowForWebViewGround() {
		return false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.groundHook {
		s.groundHook = true
		// ApplicationStarted is emitted only after Run has created the platform.
		// The OnCreate poll below waits for that before its first InvokeSync.
		s.app.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(*application.ApplicationEvent) {
			startupPlatform.mark()
		})
		s.app.Window.OnCreate(func(w application.Window) {
			s.mu.Lock()
			show, ok := s.showWhenGrounded[w.Name()]
			if ok {
				delete(s.showWhenGrounded, w.Name())
			}
			s.mu.Unlock()
			if ok {
				revealDarwinGround(s, w, show)
			}
		})
	}
	if s.showWhenGrounded == nil {
		s.showWhenGrounded = map[string]bool{}
	}
	s.showWhenGrounded[name] = show
	return true
}

func (s *EditorService) groundColour() application.RGBA {
	return ground(s.darkTheme())
}

// macWindow is the hidden-inset title bar, and on macOS the appearance that
// matches the theme so the web view is not born in the other mode.
// Backdrop stays MacBackdropNormal: the app is not built with
// private_mac_apis, and MacBackdropTransparent would clear this colour.
func macWindow(dark bool) application.MacWindow {
	mac := application.MacWindow{TitleBar: application.MacTitleBarHiddenInset}
	if runtime.GOOS == "darwin" {
		mac.Appearance = application.NSAppearanceNameAqua
		if dark {
			mac.Appearance = application.NSAppearanceNameDarkAqua
		}
	}
	return mac
}

type ToolStatus struct {
	Path   string `json:"path"`
	Custom bool   `json:"custom"`
	Ready  bool   `json:"ready"`
}

// ProviderView is an analysis provider as Settings shows it. It never
// contains credentials, only where they come from.
type ProviderView struct {
	ID            string   `json:"id"`
	Name          string   `json:"name"`
	Region        string   `json:"region"`  // "international", "china" or "custom"
	Caution       bool     `json:"caution"` // warn before sensitive uploads
	Credentials   []string `json:"credentials"`
	EnvVars       []string `json:"envVars"`
	DefaultModel  string   `json:"defaultModel"`
	Models        []string `json:"models"`
	NeedsEndpoint bool     `json:"needsEndpoint"`
	KeyOptional   bool     `json:"keyOptional"`
	Diarization   bool     `json:"diarization"`
	Added         bool     `json:"added"`
	Model         string   `json:"model"`
	Endpoint      string   `json:"endpoint"`
	KeySource     string   `json:"keySource"` // "env", "keychain" or ""
	KeyStored     bool     `json:"keyStored"`
	Ready         bool     `json:"ready"`
}

// SettingsView is what the settings and welcome windows show. It never
// contains an API key, only where one comes from.
type SettingsView struct {
	Theme             string         `json:"theme"`
	Language          string         `json:"language"` // "system", "zh-CN", "zh-TW" or "en-US"
	Locale            string         `json:"locale"`   // the language in use
	SubtitleFont      string         `json:"subtitleFont"`
	OpenLastProject   bool           `json:"openLastProject"`
	SetupDone         bool           `json:"setupDone"`
	FFmpeg            ToolStatus     `json:"ffmpeg"`
	YTDLP             ToolStatus     `json:"ytdlp"`
	Provider          string         `json:"provider"` // in use; "" when none is added
	Providers         []ProviderView `json:"providers"`
	KeychainAvailable bool           `json:"keychainAvailable"`
	AutoUpdate        bool           `json:"autoUpdate"`
	Beta              bool           `json:"beta"`
	Version           string         `json:"version"`
	LastUpdateCheck   string         `json:"lastUpdateCheck"`
	UpdateVersion     string         `json:"updateVersion"`
	// Developer is true for wails3 dev and other builds without -tags production.
	// Sample-import controls are shown only then.
	Developer bool `json:"developer"`
}

// credentialStore is the keychain, or a stand-in under test.
// Each provider's credential is one item, named by keychain.Account.
type credentialStore interface {
	Available() bool
	Get(ctx context.Context, account string) (string, error)
	Set(ctx context.Context, account, key string) error
	Delete(ctx context.Context, account string) error
}
type systemKeychain struct{}

func (systemKeychain) Available() bool { return keychain.Available() }
func (systemKeychain) Get(ctx context.Context, account string) (string, error) {
	return keychain.Get(ctx, account)
}
func (systemKeychain) Set(ctx context.Context, account, key string) error {
	return keychain.Set(ctx, account, key)
}
func (systemKeychain) Delete(ctx context.Context, account string) error {
	return keychain.Delete(ctx, account)
}

func (s *EditorService) keyStore() credentialStore {
	if s.keys != nil {
		return s.keys
	}
	return systemKeychain{}
}

func toolStatus(name, custom string) ToolStatus {
	path, ready := media.Tool(name)
	return ToolStatus{Path: path, Custom: custom != "", Ready: ready}
}

// secretLocked returns a provider's credential parts and where they come
// from: the environment when all of its variables are set, then the keychain.
// Several parts are stored joined by colons.
func (s *EditorService) secretLocked(info analysis.Info) ([]string, string) {
	if len(info.EnvVars) > 0 {
		parts := make([]string, len(info.EnvVars))
		for i, name := range info.EnvVars {
			parts[i] = os.Getenv(name)
		}
		if !slices.Contains(parts, "") {
			return parts, "env"
		}
	}
	if stored := s.storedKeys[info.ID]; stored != "" {
		return strings.SplitN(stored, ":", len(info.Credentials)), "keychain"
	}
	return nil, ""
}

// readyLocked reports whether an added provider can be used for analysis.
func (s *EditorService) readyLocked(id string) bool {
	info, ok := analysis.Lookup(id)
	i := s.settings.Find(id)
	if !ok || i < 0 {
		return false
	}
	if cfg := s.settings.Providers[i]; info.Endpoint && (cfg.Endpoint == "" || cfg.Model == "") {
		return false
	}
	_, source := s.secretLocked(info)
	return source != "" || info.KeyOptional
}

// activeProvider is what an analysis needs of the provider in use.
type activeProvider struct {
	info   analysis.Info
	name   string
	config analysis.Config
	secret []string
	ready  bool
}

func (s *EditorService) activeLocked() (activeProvider, bool) {
	info, ok := analysis.Lookup(s.settings.Provider)
	i := s.settings.Find(info.ID)
	if !ok || i < 0 {
		return activeProvider{}, false
	}
	cfg := s.settings.Providers[i]
	secret, _ := s.secretLocked(info)
	return activeProvider{info: info, name: i18n.T(info.Name), config: analysis.Config{Model: cfg.Model, Endpoint: cfg.Endpoint}, secret: secret, ready: s.readyLocked(info.ID)}, true
}

func (s *EditorService) providerViews() []ProviderView {
	views := []ProviderView{}
	for _, info := range analysis.Providers() {
		v := ProviderView{
			ID: info.ID, Name: i18n.T(info.Name), Region: info.Region, Caution: info.Caution(),
			Credentials: info.Credentials, EnvVars: info.EnvVars, DefaultModel: info.DefaultModel, Models: info.Models,
			NeedsEndpoint: info.Endpoint, KeyOptional: info.KeyOptional, Diarization: info.Diarization,
			KeyStored: s.storedKeys[info.ID] != "", Ready: s.readyLocked(info.ID),
		}
		_, v.KeySource = s.secretLocked(info)
		if i := s.settings.Find(info.ID); i >= 0 {
			v.Added, v.Model, v.Endpoint = true, s.settings.Providers[i].Model, s.settings.Providers[i].Endpoint
		}
		views = append(views, v)
	}
	return views
}

func (s *EditorService) settingsView() SettingsView {
	view := SettingsView{
		Theme: s.settings.Theme, Language: s.settings.Language, Locale: string(i18n.Current()), SubtitleFont: s.settings.SubtitleFont, OpenLastProject: s.settings.OpenLastProject, SetupDone: s.settings.SetupDone,
		FFmpeg: toolStatus("ffmpeg", s.settings.FFmpegPath), YTDLP: toolStatus("yt-dlp", s.settings.YTDLPPath),
		Provider: s.settings.Provider, Providers: s.providerViews(), KeychainAvailable: s.keyStore().Available(),
		AutoUpdate: s.settings.AutoUpdate, Beta: s.settings.Beta,
		Version: version, UpdateVersion: s.update.Version, Developer: buildinfo.Developer,
	}
	if !s.settings.LastUpdateCheck.IsZero() {
		view.LastUpdateCheck = s.settings.LastUpdateCheck.Format(time.RFC3339)
	}
	return view
}

// loadSettings runs once before the windows open.
func (s *EditorService) loadSettings() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.settings = settings.Default()
	if path, err := settings.Path(); err == nil {
		s.settingsPath = path
		s.settings, _ = settings.Load(path)
	}
	media.SetToolPath("ffmpeg", s.settings.FFmpegPath)
	media.SetToolPath("yt-dlp", s.settings.YTDLPPath)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	// Read once: like other Mac apps, a new system language applies on relaunch.
	s.languages = i18n.SystemLanguages(ctx, appID)
	i18n.SetCurrent(i18n.Resolve(s.settings.Language, s.languages))
	s.storedKeys = map[string]string{}
	for _, p := range s.settings.Providers {
		s.storedKeys[p.ID], _ = s.keyStore().Get(ctx, keychain.Account(p.ID))
	}
	s.loadDictionary()
	if !s.settings.OpenLastProject || !s.settings.SetupDone || s.settings.LastProject == "" {
		return
	}
	// A moved or damaged project simply starts the editor empty.
	if data, err := os.ReadFile(s.settings.LastProject); err == nil {
		if p, err := project.Decode(data); err == nil {
			s.project = p
			s.mediaPath = p.VideoPath
			s.mediaRevision++
		}
	}
}
func (s *EditorService) persistLocked(next settings.Settings) error {
	if s.settingsPath != "" {
		if err := next.Save(s.settingsPath); err != nil {
			return i18n.Errorf("cannot save settings: %w", err)
		}
	}
	s.settings = next
	return nil
}
func (s *EditorService) rememberProjectLocked(path string) {
	next := s.settings
	next.LastProject = path
	_ = s.persistLocked(next)
}

// notify tells every window to reload the settings it shows.
func (s *EditorService) notify() {
	if s.app != nil {
		s.app.Event.Emit("settings")
	}
}

// change edits the settings and saves them; applied runs only once they are
// saved, so a failed save leaves the running application as it was.
func (s *EditorService) change(apply func(*settings.Settings) error, applied ...func()) (SettingsView, error) {
	s.mu.Lock()
	next := s.settings
	err := apply(&next)
	if err == nil {
		err = s.persistLocked(next)
	}
	if err == nil {
		for _, f := range applied {
			f()
		}
	}
	view := s.settingsView()
	s.mu.Unlock()
	if err != nil {
		return view, err
	}
	s.notify()
	return view, nil
}

func (s *EditorService) GetSettings() SettingsView {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.settingsView()
}
func (s *EditorService) SetTheme(theme string) (SettingsView, error) {
	view, err := s.change(func(next *settings.Settings) error {
		if !settings.ValidTheme(theme) {
			return i18n.Errorf("unknown theme")
		}
		next.Theme = theme
		return nil
	})
	if err == nil {
		s.repaintGrounds()
	}
	return view, err
}

// SetLanguage switches every window, the menu and Go's messages at once.
// choice is "system", "zh-CN", "zh-TW" or "en-US".
func (s *EditorService) SetLanguage(choice string) (SettingsView, error) {
	view, err := s.change(func(next *settings.Settings) error {
		if !i18n.ValidChoice(choice) {
			return i18n.Errorf("unknown language")
		}
		next.Language = choice
		return nil
	}, func() { i18n.SetCurrent(i18n.Resolve(choice, s.languages)) })
	if err == nil {
		s.relabel()
	}
	return view, err
}

// SetSubtitleFont sets the font family subtitle text is shown in; an empty
// name returns to the interface font. Exports are unaffected.
func (s *EditorService) SetSubtitleFont(name string) (SettingsView, error) {
	name = strings.TrimSpace(name)
	return s.change(func(next *settings.Settings) error {
		if err := settings.ValidateFont(name); err != nil {
			return err
		}
		next.SubtitleFont = name
		return nil
	})
}
func (s *EditorService) SetOpenLastProject(enabled bool) (SettingsView, error) {
	return s.change(func(next *settings.Settings) error { next.OpenLastProject = enabled; return nil })
}
func (s *EditorService) SetAutoUpdate(enabled bool) (SettingsView, error) {
	return s.change(func(next *settings.Settings) error { next.AutoUpdate = enabled; return nil })
}
func (s *EditorService) SetBeta(enabled bool) (SettingsView, error) {
	return s.change(func(next *settings.Settings) error { next.Beta = enabled; return nil })
}

// SetToolPath pins FFmpeg or yt-dlp to a location; an empty path returns to
// automatic detection. The tool is not run until an import or analysis needs it.
func (s *EditorService) SetToolPath(name, path string) (SettingsView, error) {
	path = strings.TrimSpace(path)
	return s.change(func(next *settings.Settings) error {
		if err := s.ready(); err != nil {
			return err
		}
		switch name {
		case "ffmpeg":
			next.FFmpegPath = path
		case "yt-dlp":
			next.YTDLPPath = path
		default:
			return i18n.Errorf("unknown external tool")
		}
		return nil
	}, func() { media.SetToolPath(name, path) })
}
func (s *EditorService) ChooseToolPath(name string) (SettingsView, error) {
	dialog := s.app.Dialog.OpenFile().SetTitle(i18n.T("Choose the %s executable", name))
	for _, dir := range []string{"/opt/homebrew/bin", "/usr/local/bin"} {
		if stat, err := os.Stat(dir); err == nil && stat.IsDir() {
			dialog.SetDirectory(dir)
			break
		}
	}
	path, err := dialog.PromptForSingleSelection()
	if err != nil || path == "" {
		return s.GetSettings(), err
	}
	return s.SetToolPath(name, path)
}

// AddProvider makes a provider available for analysis, picking up a
// credential the keychain still holds for it. The first provider added
// becomes the one in use.
func (s *EditorService) AddProvider(id string) (SettingsView, error) {
	if _, ok := analysis.Lookup(id); !ok {
		return s.GetSettings(), i18n.Errorf("unknown analysis provider")
	}
	s.keyMu.Lock()
	defer s.keyMu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	stored, _ := s.keyStore().Get(ctx, keychain.Account(id))
	return s.change(func(next *settings.Settings) error {
		addProvider(next, id)
		return nil
	}, func() { s.setStoredKeyLocked(id, stored) })
}
func addProvider(next *settings.Settings, id string) {
	if next.Find(id) < 0 {
		next.Providers = append(slices.Clone(next.Providers), settings.ProviderConfig{ID: id})
	}
	if next.Provider == "" {
		next.Provider = id
	}
}
func (s *EditorService) setStoredKeyLocked(id, key string) {
	if s.storedKeys == nil {
		s.storedKeys = map[string]string{}
	}
	s.storedKeys[id] = key
}

// RemoveProvider removes a provider together with its stored credential.
func (s *EditorService) RemoveProvider(id string) (SettingsView, error) {
	s.keyMu.Lock()
	defer s.keyMu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := s.keyStore().Delete(ctx, keychain.Account(id)); err != nil {
		return s.GetSettings(), err
	}
	return s.change(func(next *settings.Settings) error {
		i := next.Find(id)
		if i < 0 {
			return nil
		}
		next.Providers = slices.Delete(slices.Clone(next.Providers), i, i+1)
		if next.Provider == id {
			next.Provider = ""
			if len(next.Providers) > 0 {
				next.Provider = next.Providers[0].ID
			}
		}
		return nil
	}, func() { s.setStoredKeyLocked(id, "") })
}

// SetProvider chooses which added provider analyses use.
func (s *EditorService) SetProvider(id string) (SettingsView, error) {
	return s.change(func(next *settings.Settings) error {
		if next.Find(id) < 0 {
			return i18n.Errorf("unknown analysis provider")
		}
		next.Provider = id
		return nil
	})
}

// SetProviderOptions sets an added provider's model, empty for its default,
// and the service URL of a custom provider.
func (s *EditorService) SetProviderOptions(id, model, endpoint string) (SettingsView, error) {
	model, endpoint = strings.TrimSpace(model), strings.TrimSpace(endpoint)
	return s.change(func(next *settings.Settings) error {
		info, _ := analysis.Lookup(id)
		i := next.Find(id)
		if i < 0 {
			return i18n.Errorf("unknown analysis provider")
		}
		if err := analysis.ValidateModel(model); err != nil {
			return err
		}
		if !info.Endpoint {
			endpoint = ""
		} else if err := analysis.ValidateEndpoint(endpoint); err != nil {
			return err
		}
		next.Providers = slices.Clone(next.Providers)
		next.Providers[i] = settings.ProviderConfig{ID: id, Model: model, Endpoint: endpoint}
		return nil
	})
}

// SaveProviderKey stores a provider's credential, one value per part, in the
// system credential store, adding the provider if needed. It is kept in Go
// from here on; no method returns it to the frontend.
func (s *EditorService) SaveProviderKey(id string, parts []string) (SettingsView, error) {
	info, ok := analysis.Lookup(id)
	if !ok {
		return s.GetSettings(), i18n.Errorf("unknown analysis provider")
	}
	if len(parts) != len(info.Credentials) {
		return s.GetSettings(), i18n.Errorf("enter an API key")
	}
	for i := range parts {
		parts[i] = strings.TrimSpace(parts[i])
		if err := keychain.Validate(parts[i]); err != nil {
			return s.GetSettings(), err
		}
		if len(parts) > 1 && strings.Contains(parts[i], ":") {
			return s.GetSettings(), i18n.Errorf("credentials cannot contain colons")
		}
	}
	key := strings.Join(parts, ":")
	// One credential change at a time, so the cached key always matches the
	// keychain even when two windows act at once.
	s.keyMu.Lock()
	defer s.keyMu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := s.keyStore().Set(ctx, keychain.Account(id), key); err != nil {
		return s.GetSettings(), err
	}
	view, err := s.change(func(next *settings.Settings) error {
		addProvider(next, id)
		return nil
	})
	s.mu.Lock()
	s.setStoredKeyLocked(id, key)
	view = s.settingsView()
	s.mu.Unlock()
	s.notify()
	return view, err
}
func (s *EditorService) RemoveProviderKey(id string) (SettingsView, error) {
	s.keyMu.Lock()
	defer s.keyMu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := s.keyStore().Delete(ctx, keychain.Account(id)); err != nil {
		return s.GetSettings(), err
	}
	s.mu.Lock()
	s.setStoredKeyLocked(id, "")
	view := s.settingsView()
	s.mu.Unlock()
	s.notify()
	return view, nil
}

// CheckForUpdates asks GitHub for the release list. Nothing is downloaded.
func (s *EditorService) CheckForUpdates() (SettingsView, error) {
	s.mu.Lock()
	if s.updateCancel != nil {
		defer s.mu.Unlock()
		return s.settingsView(), i18n.Errorf("already checking for updates")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	s.updateCancel = cancel
	beta, endpoint := s.settings.Beta, s.updateEndpoint
	s.mu.Unlock()
	release, err := update.Latest(ctx, nil, endpoint, beta)
	cancel()
	s.mu.Lock()
	s.updateCancel = nil
	if err == nil {
		s.update = update.Release{}
		if update.Newer(version, release.Version) {
			s.update = release
		}
		next := s.settings
		next.LastUpdateCheck = time.Now()
		err = s.persistLocked(next)
	}
	view := s.settingsView()
	s.mu.Unlock()
	if err != nil {
		return view, friendly(err)
	}
	s.notify()
	return view, nil
}

// autoCheck runs at most once a day, and never before the initial setup.
func (s *EditorService) autoCheck() {
	s.mu.Lock()
	due := s.settings.AutoUpdate && s.settings.SetupDone && time.Since(s.settings.LastUpdateCheck) >= 24*time.Hour
	s.mu.Unlock()
	if !due {
		return
	}
	if view, err := s.CheckForUpdates(); err == nil && view.UpdateVersion != "" && s.app != nil {
		s.app.Event.Emit("update-available", view.UpdateVersion)
	}
}

// OpenReleasePage shows the release in the browser; installing stays manual.
func (s *EditorService) OpenReleasePage() error {
	s.mu.Lock()
	url := s.update.URL
	s.mu.Unlock()
	if url == "" {
		url = update.ReleasesPage
	}
	return s.app.Browser.OpenURL(url)
}

func (s *EditorService) window(name string) application.Window {
	if s.app == nil {
		return nil
	}
	window, ok := s.app.Window.GetByName(name)
	if !ok {
		return nil
	}
	return window
}

// openPanel shows one of the fixed-size secondary windows, creating it on demand.
func (s *EditorService) openPanel(name, title string, width, height int, minimise application.ButtonState) {
	if window := s.window(name); window != nil {
		paintWebViewGround(window, s.groundColour())
		window.Show().Focus()
		return
	}
	dark := s.darkTheme()
	window := s.app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name: name, Title: title, Width: width, Height: height, URL: windowURL(name, s.theme(), windowSystemTheme(s.app)),
		BackgroundColour: ground(dark), Hidden: s.deferWindowShow(name, true),
		DisableResize: true, Frameless: customChrome, MinimiseButtonState: minimise,
		MaximiseButtonState: application.ButtonDisabled, FullscreenButtonState: application.ButtonDisabled,
		Mac: macWindow(dark),
	})
	if name == welcomeWindow {
		// A hook runs before the window goes away, so the editor is on screen
		// before macOS could see the last window close.
		window.RegisterHook(events.Common.WindowClosing, func(*application.WindowEvent) { s.setupFinished() })
	}
}
func (s *EditorService) OpenSettings() {
	s.openPanel(settingsWindow, i18n.T(panelTitles[settingsWindow]), 760, 540, application.ButtonEnabled)
}

func (s *EditorService) OpenDictionary() {
	s.openPanel(dictionaryWindow, i18n.T(panelTitles[dictionaryWindow]), 880, 600, application.ButtonEnabled)
}

// OpenWelcome runs the initial setup again from the settings window.
func (s *EditorService) OpenWelcome() {
	s.openPanel(welcomeWindow, i18n.T(panelTitles[welcomeWindow]), 760, 520, application.ButtonDisabled)
}

var panelTitles = map[string]string{
	settingsWindow:   i18n.N("Mousqueau Settings"),
	welcomeWindow:    i18n.N("Welcome to Mousqueau"),
	dictionaryWindow: i18n.N("Mousqueau Dictionary"),
}

// relabel brings the native text the frontend does not draw into the
// current language.
func (s *EditorService) relabel() {
	if s.app == nil {
		return
	}
	for name, title := range panelTitles {
		if window := s.window(name); window != nil {
			window.SetTitle(i18n.T(title))
		}
	}
	if runtime.GOOS == "darwin" {
		s.app.Menu.SetApplicationMenu(s.menu())
	}
}

// FinishSetup closes the welcome window and hands an optional first action
// ("demo" or "srt") to the editor window.
func (s *EditorService) FinishSetup(action string) error {
	if action != "" && action != "demo" && action != "srt" {
		return i18n.Errorf("unknown action")
	}
	s.mu.Lock()
	s.pendingAction = action
	s.mu.Unlock()
	if window := s.window(welcomeWindow); window != nil {
		window.Close()
	} else {
		s.setupFinished()
	}
	return nil
}

// setupFinished runs however the welcome window closes; leaving it early
// counts as skipping, and the setup can be run again from Settings.
func (s *EditorService) setupFinished() {
	s.mu.Lock()
	next := s.settings
	next.SetupDone = true
	_ = s.persistLocked(next)
	closing := s.closing
	s.mu.Unlock()
	if closing {
		return
	}
	if window := s.window(mainWindow); window != nil {
		paintWebViewGround(window, s.groundColour())
		window.Show().Focus()
	}
	s.notify()
	if s.app != nil {
		s.app.Event.Emit("pending-action")
	}
}

// TakePendingAction returns the action chosen at the end of setup, once.
func (s *EditorService) TakePendingAction() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	action := s.pendingAction
	s.pendingAction = ""
	return action
}

// openWindows creates the editor, and on first launch the welcome window in
// front of it while the editor stays hidden.
func (s *EditorService) openWindows() {
	s.mu.Lock()
	setupDone := s.settings.SetupDone
	s.mu.Unlock()
	dark := s.darkTheme()
	// On macOS the window stays hidden until the web view is the theme colour;
	// Wails would otherwise show it on the web view's own white. Evaluate the
	// deferral on its own: || would skip it on first launch, when the editor
	// is already hidden, and the web view would stay white until it is shown.
	deferShow := s.deferWindowShow(mainWindow, setupDone)
	editor := s.app.Window.NewWithOptions(application.WebviewWindowOptions{Name: mainWindow, Title: "Mousqueau", Width: 1440, Height: 920, MinWidth: 1100, MinHeight: 720,
		URL: windowURL(mainWindow, s.theme(), windowSystemTheme(s.app)), BackgroundColour: ground(dark),
		Hidden: !setupDone || deferShow,
		// The frontend draws the toolbar under the traffic lights, or with its
		// own window controls elsewhere, and marks it draggable.
		Frameless: customChrome, Mac: macWindow(dark)})
	// Closing the editor ends the session, so the secondary windows go with it.
	editor.RegisterHook(events.Common.WindowClosing, func(*application.WindowEvent) {
		s.mu.Lock()
		s.closing = true
		s.mu.Unlock()
		for _, name := range []string{settingsWindow, welcomeWindow, dictionaryWindow} {
			if window := s.window(name); window != nil {
				window.Close()
			}
		}
	})
	if !setupDone {
		s.OpenWelcome()
	}
	if runtime.GOOS == "darwin" {
		s.app.Menu.SetApplicationMenu(s.menu())
	}
	s.app.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(*application.ApplicationEvent) { go s.autoCheck() })
	s.app.Event.OnApplicationEvent(events.Common.ThemeChanged, func(*application.ApplicationEvent) { s.repaintGrounds() })
}

// menu is the default macOS menu, without Help, plus the conventional
// Settings item.
func (s *EditorService) menu() *application.Menu {
	menu := application.NewMenu()
	app := menu.AddSubmenu("Mousqueau")
	app.AddRole(application.About)
	app.AddSeparator()
	app.Add(i18n.T("Settings…")).SetAccelerator("CmdOrCtrl+,").OnClick(func(*application.Context) { s.OpenSettings() })
	app.Add(i18n.T("Dictionary…")).OnClick(func(*application.Context) { s.OpenDictionary() })
	app.AddSeparator()
	app.AddRole(application.ServicesMenu)
	app.AddSeparator()
	app.AddRole(application.Hide)
	app.AddRole(application.HideOthers)
	app.AddRole(application.UnHide)
	app.AddSeparator()
	app.AddRole(application.Quit)
	menu.AddRole(application.FileMenu)
	menu.AddRole(application.EditMenu)
	menu.AddRole(application.ViewMenu)
	menu.AddRole(application.WindowMenu)
	// No Help menu: Wails' only item there opens wails.io in the editor window.
	// Wails labels its standard items in English only.
	for _, item := range roleLabels {
		if found := menu.FindByRole(item.role); found != nil {
			found.SetLabel(roleLabel(item.label))
		}
	}
	return menu
}

// roleLabel translates a standard menu label, filling in the application
// name only where the label has a place for it: passing the name to a label
// without one would make fmt append %!(EXTRA string=Mousqueau).
func roleLabel(label string) string {
	if strings.Contains(label, "%[1]s") {
		return i18n.T(label, "Mousqueau")
	}
	return i18n.T(label)
}

// roleLabels repeats the English labels Wails gives these items; %[1]s is
// the application name.
var roleLabels = []struct {
	role  application.Role
	label string
}{
	{application.About, i18n.N("About %[1]s")},
	{application.ServicesMenu, i18n.N("Services")},
	{application.Hide, i18n.N("Hide %[1]s")},
	{application.HideOthers, i18n.N("Hide Others")},
	{application.UnHide, i18n.N("Show All")},
	{application.Quit, i18n.N("Quit %[1]s")},
	{application.FileMenu, i18n.N("File")},
	{application.CloseWindow, i18n.N("Close")},
	{application.EditMenu, i18n.N("Edit")},
	{application.Undo, i18n.N("Undo")},
	{application.Redo, i18n.N("Redo")},
	{application.Cut, i18n.N("Cut")},
	{application.Copy, i18n.N("Copy")},
	{application.Paste, i18n.N("Paste")},
	{application.PasteAndMatchStyle, i18n.N("Paste and Match Style")},
	{application.Delete, i18n.N("Delete")},
	{application.SelectAll, i18n.N("Select All")},
	{application.SpeechMenu, i18n.N("Speech")},
	{application.StartSpeaking, i18n.N("Start Speaking")},
	{application.StopSpeaking, i18n.N("Stop Speaking")},
	{application.ViewMenu, i18n.N("View")},
	{application.Reload, i18n.N("Reload")},
	{application.ForceReload, i18n.N("Force Reload")},
	{application.OpenDevTools, i18n.N("Open Developer Tools")},
	{application.ResetZoom, i18n.N("Actual Size")},
	{application.ZoomIn, i18n.N("Zoom In")},
	{application.ZoomOut, i18n.N("Zoom Out")},
	{application.ToggleFullscreen, i18n.N("Toggle Full Screen")},
	{application.WindowMenu, i18n.N("Window")},
	{application.Minimise, i18n.N("Minimize")},
	{application.Zoom, i18n.N("Zoom")},
	{application.Front, i18n.N("Bring All to Front")},
}
