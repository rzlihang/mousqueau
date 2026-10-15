package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/wailsapp/wails/v3/pkg/application"
	"mousqueau/internal/analysis"
	"mousqueau/internal/dictionary"
	"mousqueau/internal/i18n"
	"mousqueau/internal/media"
	"mousqueau/internal/project"
	"mousqueau/internal/settings"
	"mousqueau/internal/subtitle"
	"mousqueau/internal/update"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Status struct {
	Busy  bool   `json:"busy"`
	Phase string `json:"phase"`
	// Progress is the running phase's completed fraction, or -1 when it
	// has none.
	Progress      float64 `json:"progress"`
	FFmpeg        bool    `json:"ffmpeg"`
	YTDLP         bool    `json:"ytdlp"`
	APIConfigured bool    `json:"apiConfigured"` // the provider in use can analyze
	Provider      string  `json:"provider"`      // its name; "" when none is added
	// ProviderCaution marks a provider under mainland China's jurisdiction
	// (region "china") or a custom endpoint, so the upload confirmation can
	// advise care.
	ProviderCaution bool   `json:"providerCaution"`
	ProviderRegion  string `json:"providerRegion"`
}
type Snapshot struct {
	Project   *project.Project `json:"project"`
	MediaPath string           `json:"mediaPath"`
	MediaURL  string           `json:"mediaUrl"`
}
type Waveform struct {
	MediaURL       string `json:"mediaUrl"`
	PeaksPerSecond int    `json:"peaksPerSecond"`
	Peaks          []int  `json:"peaks"`
}
type EditorService struct {
	mu             sync.Mutex
	app            *application.App
	project        *project.Project
	mediaPath      string
	mediaRevision  int
	cancel         context.CancelFunc
	phase          string // English; translated when read
	phaseArgs      []any
	fraction       float64 // progress of the running phase; -1 unknown
	waveformCancel context.CancelFunc
	awakeRelease   func() // set while playback holds the display awake

	settings       settings.Settings
	settingsPath   string            // empty in tests: nothing is written
	languages      []string          // the system's preferred languages
	keys           credentialStore   // nil: the system keychain
	keyMu          sync.Mutex        // serializes keychain changes
	storedKeys     map[string]string // by provider, from the keychain; stays in Go
	update         update.Release
	updateEndpoint string
	updateCancel   context.CancelFunc
	pendingAction  string
	closing        bool

	// Darwin keeps a new window hidden until its web view is painted; the
	// map says which of those windows should then be shown. Unused elsewhere.
	groundHook       bool
	showWhenGrounded map[string]bool

	dictionary     dictionary.Dictionary
	dictionaryPath string // empty in tests: nothing is written
	dictionaryRO   bool
	dictionaryErr  string
	importPreview  *dictionary.ImportPreview
}

func (s *EditorService) ready() error {
	if s.cancel != nil {
		return i18n.Errorf("wait for processing to finish or cancel it")
	}
	return nil
}
func (s *EditorService) requireProject() error {
	if err := s.ready(); err != nil {
		return err
	}
	if s.project == nil {
		return i18n.Errorf("import SRT subtitles first")
	}
	return nil
}
func (s *EditorService) snapshot() Snapshot {
	result := Snapshot{MediaPath: s.mediaPath}
	if s.mediaPath != "" {
		result.MediaURL = fmt.Sprintf("/media/video?v=%d", s.mediaRevision)
	}
	if s.project != nil {
		data, _ := json.Marshal(s.project)
		_ = json.Unmarshal(data, &result.Project)
	}
	return result
}
func (s *EditorService) GetSnapshot() Snapshot { s.mu.Lock(); defer s.mu.Unlock(); return s.snapshot() }
func (s *EditorService) GetStatus() Status {
	s.mu.Lock()
	defer s.mu.Unlock()
	status := Status{Busy: s.cancel != nil, Phase: i18n.T(s.phase, s.phaseArgs...), Progress: s.fraction, FFmpeg: media.Dependency("ffmpeg"), YTDLP: media.Dependency("yt-dlp")}
	if active, ok := s.activeLocked(); ok {
		status.APIConfigured, status.Provider, status.ProviderCaution, status.ProviderRegion = active.ready, active.name, active.info.Caution(), active.info.Region
	}
	return status
}
func (s *EditorService) ImportVideo() (Snapshot, error) {
	path, err := s.app.Dialog.OpenFile().SetTitle(i18n.T("Import local video or audio")).AddFilter(i18n.T("Media"), "*.mp4;*.mov;*.m4v;*.webm;*.mkv;*.m4a;*.mp3;*.wav").PromptForSingleSelection()
	if err != nil {
		return Snapshot{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.ready(); err != nil {
		return Snapshot{}, err
	}
	if path == "" {
		return s.snapshot(), nil
	}
	stat, err := os.Stat(path)
	if err != nil || !stat.Mode().IsRegular() {
		return Snapshot{}, i18n.Errorf("selected media file is unavailable")
	}
	s.mediaPath = path
	s.mediaRevision++
	if s.project != nil {
		s.project.VideoPath = path
	}
	return s.snapshot(), nil
}
func (s *EditorService) ImportSRT() (Snapshot, error) {
	path, err := s.app.Dialog.OpenFile().SetTitle(i18n.T("Import existing SRT")).AddFilter(i18n.T("SubRip subtitles"), "*.srt").PromptForSingleSelection()
	if err != nil {
		return Snapshot{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.ready(); err != nil {
		return Snapshot{}, err
	}
	if path == "" {
		return s.snapshot(), nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return Snapshot{}, err
	}
	cues, err := subtitle.Parse(string(data))
	if err != nil {
		return Snapshot{}, err
	}
	s.project = project.New(cues, path)
	s.project.VideoPath = s.mediaPath
	return s.snapshot(), nil
}
func (s *EditorService) OpenProject() (Snapshot, error) {
	path, err := s.app.Dialog.OpenFile().SetTitle(i18n.T("Open editing project")).AddFilter(i18n.T("Mousqueau project"), "*.json").PromptForSingleSelection()
	if err != nil {
		return Snapshot{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.ready(); err != nil {
		return Snapshot{}, err
	}
	if path == "" {
		return s.snapshot(), nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return Snapshot{}, err
	}
	p, err := project.Decode(data)
	if err != nil {
		return Snapshot{}, err
	}
	s.project = p
	s.mediaPath = p.VideoPath
	s.mediaRevision++
	s.rememberProjectLocked(path)
	return s.snapshot(), nil
}
func (s *EditorService) SaveProject() (string, error) {
	path, err := s.app.Dialog.SaveFile().SetFilename("mousqueau-project.json").AddFilter(i18n.T("Mousqueau project"), "*.json").PromptForSingleSelection()
	if err != nil || path == "" {
		return "", err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.requireProject(); err != nil {
		return "", err
	}
	if !media.HasExtension(path, ".json") {
		path += ".json"
	}
	data, err := json.MarshalIndent(s.project, "", "  ")
	if err != nil {
		return "", err
	}
	if err := media.SafeNewFile(path, data); err != nil {
		return "", err
	}
	s.rememberProjectLocked(path)
	return path, nil
}
func (s *EditorService) ExportSRT() (string, error) {
	path, err := s.app.Dialog.SaveFile().SetFilename("corrected.srt").AddFilter(i18n.T("SubRip subtitles"), "*.srt").PromptForSingleSelection()
	if err != nil || path == "" {
		return "", err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.requireProject(); err != nil {
		return "", err
	}
	if !media.HasExtension(path, ".srt") {
		path += ".srt"
	}
	if media.SamePath(path, s.project.SubtitlePath) || media.SamePath(path, s.mediaPath) {
		return "", i18n.Errorf("choose a new output file to preserve the imported source")
	}
	text, err := subtitle.Render(s.project.State.Cues)
	if err != nil {
		return "", err
	}
	if err := media.SafeNewFile(path, []byte(text)); err != nil {
		return "", err
	}
	return path, nil
}
func (s *EditorService) EditCue(cue subtitle.Cue) (Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.requireProject(); err != nil {
		return Snapshot{}, err
	}
	if err := s.project.Edit(cue); err != nil {
		return Snapshot{}, err
	}
	return s.snapshot(), nil
}

// SplitCue divides a cue at a time and a text offset in Unicode code points.
func (s *EditorService) SplitCue(id string, at float64, offset int) (Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.requireProject(); err != nil {
		return Snapshot{}, err
	}
	if err := s.project.Split(id, at, offset); err != nil {
		return Snapshot{}, err
	}
	return s.snapshot(), nil
}

// MergeCues joins a cue with the one after it.
func (s *EditorService) MergeCues(id string) (Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.requireProject(); err != nil {
		return Snapshot{}, err
	}
	if err := s.project.Merge(id); err != nil {
		return Snapshot{}, err
	}
	return s.snapshot(), nil
}
func (s *EditorService) Undo() (Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.requireProject(); err != nil {
		return Snapshot{}, err
	}
	s.project.UndoEdit()
	return s.snapshot(), nil
}
func (s *EditorService) Redo() (Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.requireProject(); err != nil {
		return Snapshot{}, err
	}
	s.project.RedoEdit()
	return s.snapshot(), nil
}
func (s *EditorService) SetSpeaker(speaker analysis.Speaker) (Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.requireProject(); err != nil {
		return Snapshot{}, err
	}
	if err := s.project.SetSpeaker(speaker); err != nil {
		return Snapshot{}, err
	}
	return s.snapshot(), nil
}
func (s *EditorService) DecideSuggestion(id, decision string) (Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.requireProject(); err != nil {
		return Snapshot{}, err
	}
	if err := s.project.Decide(id, decision); err != nil {
		return Snapshot{}, err
	}
	return s.snapshot(), nil
}
func (s *EditorService) begin(phase string) (context.Context, error) {
	return s.beginFor(phase, 10*time.Minute)
}
func (s *EditorService) beginFor(phase string, timeout time.Duration) (context.Context, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.ready(); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	s.cancel = cancel
	s.phase, s.phaseArgs, s.fraction = phase, nil, -1
	return ctx, nil
}

// progress updates the running phase. A phase with %d shows fraction as a
// percentage; -1 means the amount is unknown.
func (s *EditorService) progress(phase string, fraction float64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancel == nil || s.phase == i18n.N("Cancelling…") {
		return
	}
	s.phase, s.phaseArgs, s.fraction = phase, nil, fraction
	if strings.Contains(phase, "%d") {
		s.phaseArgs = []any{int(max(fraction, 0) * 100)}
	}
}
func (s *EditorService) finish() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancel != nil {
		s.cancel()
	}
	s.cancel = nil
	s.phase, s.phaseArgs, s.fraction = "", nil, -1
}
func (s *EditorService) Cancel() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancel != nil {
		s.cancel()
		s.phase, s.phaseArgs = i18n.N("Cancelling…"), nil
	}
}

// Waveform decodes the selected local media for the timeline. It runs beside
// other work, never uploads anything, and a newer request cancels an older one.
func (s *EditorService) Waveform() (Waveform, error) {
	s.mu.Lock()
	if s.waveformCancel != nil {
		s.waveformCancel()
	}
	path := s.mediaPath
	url := fmt.Sprintf("/media/video?v=%d", s.mediaRevision)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	s.waveformCancel = cancel
	s.mu.Unlock()
	defer cancel()
	if path == "" {
		return Waveform{}, i18n.Errorf("import local media first")
	}
	peaks, err := media.Peaks(ctx, path)
	if err != nil {
		return Waveform{}, friendly(err)
	}
	return Waveform{MediaURL: url, PeaksPerSecond: media.PeaksPerSecond, Peaks: peaks}, nil
}

// ServiceShutdown stops background FFmpeg work when the application quits.
func (s *EditorService) ServiceShutdown() error {
	s.Cancel()
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.waveformCancel != nil {
		s.waveformCancel()
	}
	if s.updateCancel != nil {
		s.updateCancel()
	}
	if s.awakeRelease != nil {
		s.awakeRelease()
		s.awakeRelease = nil
	}
	return nil
}
func (s *EditorService) phaseUpdate(phase string, args ...any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.phase, s.phaseArgs = phase, args
}
func friendly(err error) error {
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return i18n.Errorf("processing cancelled or timed out; subtitles were not changed")
	}
	return err
}
func (s *EditorService) Analyze(start, end float64, uploadAuthorized bool) (Snapshot, error) {
	if !uploadAuthorized {
		return Snapshot{}, i18n.Errorf("confirm audio upload before analysis")
	}
	if err := media.ValidateRange(start, end); err != nil {
		return Snapshot{}, err
	}
	s.mu.Lock()
	active, ok := s.activeLocked()
	s.mu.Unlock()
	if !ok {
		return Snapshot{}, i18n.Errorf("add an analysis provider in Settings; local editing does not require one")
	}
	if !active.ready {
		return Snapshot{}, i18n.Errorf("set up %s in Settings; local editing does not require it", active.name)
	}
	provider, err := analysis.New(active.info.ID, active.config, active.secret, nil)
	if err != nil {
		return Snapshot{}, err
	}
	ctx, err := s.begin(i18n.N("Extracting audio with FFmpeg…"))
	if err != nil {
		return Snapshot{}, err
	}
	defer s.finish()
	s.mu.Lock()
	p := s.project
	path := s.mediaPath
	var cues []subtitle.Cue
	if p != nil {
		cues = append(cues, p.State.Cues...)
	}
	s.mu.Unlock()
	if p == nil || path == "" {
		return Snapshot{}, i18n.Errorf("import media and SRT subtitles before analysis")
	}
	audio, cleanup, err := media.Extract(ctx, path, start, end)
	if err != nil {
		return Snapshot{}, friendly(err)
	}
	defer cleanup()
	s.phaseUpdate(i18n.N("Uploading selected audio to %s and identifying speakers…"), active.name)
	segments, err := provider.Transcribe(ctx, audio)
	if err != nil {
		return Snapshot{}, friendly(err)
	}
	segments, err = analysis.Offset(segments, start, end-start)
	if err != nil {
		return Snapshot{}, err
	}
	// Speaker labels from separate requests are not guaranteed to denote the same person.
	prefix := fmt.Sprintf("run-%d/", time.Now().UnixMilli())
	for i := range segments {
		if segments[i].Speaker != "Unknown" {
			segments[i].Speaker = prefix + segments[i].Speaker
		}
	}
	result := analysis.Align(cues, segments, start, end)
	s.mu.Lock()
	defer s.mu.Unlock()
	if ctx.Err() != nil {
		return Snapshot{}, friendly(ctx.Err())
	}
	s.project.AddAnalysis(result)
	return s.snapshot(), nil
}
func (s *EditorService) LoadDemo() (Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.ready(); err != nil {
		return Snapshot{}, err
	}
	data, err := assets.ReadFile("examples/conversation.srt")
	if err != nil {
		return Snapshot{}, err
	}
	cues, err := subtitle.Parse(string(data))
	if err != nil {
		return Snapshot{}, err
	}
	s.project = project.New(cues, "")
	s.project.VideoPath = s.mediaPath
	data, err = assets.ReadFile("examples/diarization.json")
	if err != nil {
		return Snapshot{}, err
	}
	var response struct {
		Segments []analysis.Segment `json:"segments"`
	}
	if err = json.Unmarshal(data, &response); err != nil {
		return Snapshot{}, err
	}
	s.project.AddAnalysis(analysis.Align(cues, response.Segments, 0, 300))
	return s.snapshot(), nil
}
func (s *EditorService) DiscoverWeb(raw string) (media.WebInfo, error) {
	ctx, err := s.begin(i18n.N("Looking up the video…"))
	if err != nil {
		return media.WebInfo{}, err
	}
	defer s.finish()
	info, err := media.Discover(ctx, raw)
	return info, friendly(err)
}

// WebImport is what the import dialog asks for from one video page.
type WebImport struct {
	Title string `json:"title"`
	// Caption track to import; empty Language skips subtitles.
	Language  string `json:"language"`
	Automatic bool   `json:"automatic"`
	// "", "audio" or "video".
	Media string `json:"media"`
	// The user confirmed they may download this page's media.
	Authorized bool `json:"authorized"`
}

// ImportWeb downloads the chosen media first, asking where to save it, then
// imports the subtitle track as a new project that keeps that media.
// Cancelling the save dialog changes nothing.
func (s *EditorService) ImportWeb(raw string, req WebImport) (Snapshot, error) {
	if req.Language == "" && req.Media == "" {
		return Snapshot{}, i18n.Errorf("choose subtitles, audio or video to import")
	}
	var path string
	if req.Media != "" {
		if !req.Authorized {
			return Snapshot{}, i18n.Errorf("confirm you are authorized to download this video")
		}
		ext, ok := media.MediaExtension(req.Media)
		if !ok {
			return Snapshot{}, i18n.Errorf("choose audio or video")
		}
		filter := i18n.T("MP4 video")
		if req.Media == media.WebAudio {
			filter = i18n.T("M4A audio")
		}
		var err error
		path, err = s.app.Dialog.SaveFile().SetFilename(media.FileName(req.Title, ext)).AddFilter(filter, "*"+ext).PromptForSingleSelection()
		if err != nil || path == "" {
			return s.GetSnapshot(), err
		}
		if !media.HasExtension(path, ext) {
			path += ext
		}
	}
	phase := i18n.N("Downloading video… %d%%")
	if req.Media == media.WebAudio {
		phase = i18n.N("Downloading audio… %d%%")
	}
	if req.Media == "" {
		phase = i18n.N("Downloading selected subtitle track…")
	}
	ctx, err := s.beginFor(phase, time.Hour)
	if err != nil {
		return Snapshot{}, err
	}
	defer s.finish()
	if path != "" {
		s.progress(phase, 0)
		err := media.DownloadMedia(ctx, raw, req.Media, path, func(f float64) { s.progress(phase, f) })
		if err != nil {
			return Snapshot{}, friendly(err)
		}
		s.mu.Lock()
		s.mediaPath = path
		s.mediaRevision++
		if s.project != nil {
			s.project.VideoPath = path
		}
		s.mu.Unlock()
	}
	if req.Language != "" {
		s.progress(i18n.N("Downloading selected subtitle track…"), -1)
		data, err := media.DownloadCaption(ctx, raw, req.Language, req.Automatic)
		if err != nil {
			return Snapshot{}, friendly(err)
		}
		cues, err := subtitle.Parse(string(data))
		if err != nil {
			return Snapshot{}, err
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		if ctx.Err() != nil {
			return Snapshot{}, friendly(ctx.Err())
		}
		s.project = project.New(cues, raw)
		s.project.VideoPath = s.mediaPath
		return s.snapshot(), nil
	}
	return s.GetSnapshot(), nil
}

// Only the explicitly selected media file is accessible, never arbitrary paths.
func (s *EditorService) mediaMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/media/video" {
			next.ServeHTTP(w, r)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		s.mu.Lock()
		path := s.mediaPath
		s.mu.Unlock()
		file, err := os.Open(path)
		if err != nil {
			http.Error(w, "Media unavailable; reimport the local file", http.StatusNotFound)
			return
		}
		defer file.Close()
		stat, err := file.Stat()
		if err != nil || !stat.Mode().IsRegular() {
			http.Error(w, "Invalid media file", http.StatusNotFound)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		http.ServeContent(w, r, filepath.Base(path), stat.ModTime(), file)
	})
}
