package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/wailsapp/wails/v3/pkg/application"
	"mousqueau/internal/analysis"
	"mousqueau/internal/media"
	"mousqueau/internal/project"
	"mousqueau/internal/settings"
	"mousqueau/internal/subtitle"
	"mousqueau/internal/update"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type Status struct {
	Busy          bool   `json:"busy"`
	Phase         string `json:"phase"`
	FFmpeg        bool   `json:"ffmpeg"`
	YTDLP         bool   `json:"ytdlp"`
	APIConfigured bool   `json:"apiConfigured"`
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
	phase          string
	waveformCancel context.CancelFunc

	settings       settings.Settings
	settingsPath   string          // empty in tests: nothing is written
	keys           credentialStore // nil: the system keychain
	keyMu          sync.Mutex      // serializes keychain changes
	storedKey      string          // from the keychain; stays in Go
	update         update.Release
	updateEndpoint string
	updateCancel   context.CancelFunc
	pendingAction  string
	closing        bool
}

func (s *EditorService) ready() error {
	if s.cancel != nil {
		return fmt.Errorf("wait for processing to finish or cancel it")
	}
	return nil
}
func (s *EditorService) requireProject() error {
	if err := s.ready(); err != nil {
		return err
	}
	if s.project == nil {
		return fmt.Errorf("import SRT subtitles first")
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
	return Status{Busy: s.cancel != nil, Phase: s.phase, FFmpeg: media.Dependency("ffmpeg"), YTDLP: media.Dependency("yt-dlp"), APIConfigured: s.apiKeyLocked() != ""}
}
func (s *EditorService) ImportVideo() (Snapshot, error) {
	path, err := s.app.Dialog.OpenFile().SetTitle("Import local video or audio").AddFilter("Media", "*.mp4;*.mov;*.m4v;*.webm;*.mkv;*.m4a;*.mp3;*.wav").PromptForSingleSelection()
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
		return Snapshot{}, fmt.Errorf("selected media file is unavailable")
	}
	s.mediaPath = path
	s.mediaRevision++
	if s.project != nil {
		s.project.VideoPath = path
	}
	return s.snapshot(), nil
}
func (s *EditorService) ImportSRT() (Snapshot, error) {
	path, err := s.app.Dialog.OpenFile().SetTitle("Import existing SRT").AddFilter("SubRip subtitles", "*.srt").PromptForSingleSelection()
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
	path, err := s.app.Dialog.OpenFile().SetTitle("Open editing project").AddFilter("Mousqueau project", "*.json").PromptForSingleSelection()
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
	path, err := s.app.Dialog.SaveFile().SetFilename("mousqueau-project.json").AddFilter("Mousqueau project", "*.json").PromptForSingleSelection()
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
	path, err := s.app.Dialog.SaveFile().SetFilename("corrected.srt").AddFilter("SubRip subtitles", "*.srt").PromptForSingleSelection()
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
		return "", fmt.Errorf("choose a new output file to preserve the imported source")
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
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.ready(); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	s.cancel = cancel
	s.phase = phase
	return ctx, nil
}
func (s *EditorService) finish() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancel != nil {
		s.cancel()
	}
	s.cancel = nil
	s.phase = ""
}
func (s *EditorService) Cancel() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancel != nil {
		s.cancel()
		s.phase = "Cancelling…"
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
		return Waveform{}, fmt.Errorf("import local media first")
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
	return nil
}
func (s *EditorService) phaseUpdate(phase string) { s.mu.Lock(); defer s.mu.Unlock(); s.phase = phase }
func friendly(err error) error {
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return fmt.Errorf("processing cancelled or timed out; subtitles were not changed")
	}
	return err
}
func (s *EditorService) Analyze(start, end float64, uploadAuthorized bool) (Snapshot, error) {
	if !uploadAuthorized {
		return Snapshot{}, fmt.Errorf("confirm audio upload before analysis")
	}
	if err := media.ValidateRange(start, end); err != nil {
		return Snapshot{}, err
	}
	key := s.apiKey()
	if key == "" {
		return Snapshot{}, fmt.Errorf("add an OpenAI API key in Settings or set OPENAI_API_KEY; local editing does not require one")
	}
	ctx, err := s.begin("Extracting audio with FFmpeg…")
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
		return Snapshot{}, fmt.Errorf("import media and SRT subtitles before analysis")
	}
	audio, cleanup, err := media.Extract(ctx, path, start, end)
	if err != nil {
		return Snapshot{}, friendly(err)
	}
	defer cleanup()
	s.phaseUpdate("Uploading selected audio to OpenAI and identifying speakers…")
	var provider analysis.Provider = analysis.OpenAI{Key: key}
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
func (s *EditorService) DiscoverYouTube(raw string) (media.YouTubeInfo, error) {
	ctx, err := s.begin("Discovering YouTube subtitles…")
	if err != nil {
		return media.YouTubeInfo{}, err
	}
	defer s.finish()
	info, err := media.Discover(ctx, raw)
	return info, friendly(err)
}
func (s *EditorService) ImportYouTubeCaption(raw, language string, automatic bool) (Snapshot, error) {
	ctx, err := s.begin("Downloading selected subtitle track…")
	if err != nil {
		return Snapshot{}, err
	}
	defer s.finish()
	data, err := media.DownloadCaption(ctx, raw, language, automatic)
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
func (s *EditorService) DownloadYouTubeAudio(raw string, authorized bool) (Snapshot, error) {
	if !authorized {
		return Snapshot{}, fmt.Errorf("confirm you are authorized to download this audio")
	}
	path, err := s.app.Dialog.SaveFile().SetFilename("youtube-audio.m4a").AddFilter("M4A audio", "*.m4a").PromptForSingleSelection()
	if err != nil || path == "" {
		return s.GetSnapshot(), err
	}
	if !media.HasExtension(path, ".m4a") {
		path += ".m4a"
	}
	ctx, err := s.begin("Downloading authorized YouTube audio…")
	if err != nil {
		return Snapshot{}, err
	}
	defer s.finish()
	if err := media.DownloadAudio(ctx, raw, path); err != nil {
		return Snapshot{}, friendly(err)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.mediaPath = path
	s.mediaRevision++
	if s.project != nil {
		s.project.VideoPath = path
	}
	return s.snapshot(), nil
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
