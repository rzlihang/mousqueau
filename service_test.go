package main

import (
	"mousqueau/internal/media"
	"mousqueau/internal/project"
	"mousqueau/internal/subtitle"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestServiceSnapshotAndExplicitUpload(t *testing.T) {
	s := &EditorService{project: project.New([]subtitle.Cue{{ID: "c", Identifier: "1", Start: 0, End: 2, Text: "原文", SpeakerIDs: []string{}}}, "")}
	snapshot := s.GetSnapshot()
	snapshot.Project.State.Cues[0].Text = "outside mutation"
	if s.GetSnapshot().Project.State.Cues[0].Text != "原文" {
		t.Fatal("snapshot aliases state")
	}
	if _, err := s.Analyze(0, 60, false); err == nil {
		t.Fatal("upload did not require authorization")
	}
	ctx, err := s.begin("test")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.EditCue(snapshot.Project.State.Cues[0]); err == nil {
		t.Fatal("editing allowed while processing")
	}
	s.Cancel()
	if ctx.Err() == nil {
		t.Fatal("cancel context still active")
	}
	s.finish()
	if s.GetStatus().Busy {
		t.Fatal("busy did not clear")
	}
}
func TestSelectedMediaRangeAndNoArbitraryPaths(t *testing.T) {
	path := filepath.Join(t.TempDir(), "audio.m4a")
	os.WriteFile(path, []byte("0123456789"), 0600)
	s := &EditorService{mediaPath: path}
	handler := s.mediaMiddleware(http.NotFoundHandler())
	req := httptest.NewRequest("GET", "/media/video", nil)
	req.Header.Set("Range", "bytes=2-4")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != 206 || rec.Body.String() != "234" {
		t.Fatalf("range response: %d %s", rec.Code, rec.Body.String())
	}
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest("GET", "/media/../../etc/passwd", nil))
	if rec.Code != 404 {
		t.Fatal("arbitrary media route exposed")
	}
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest("POST", "/media/video", nil))
	if rec.Code != 405 {
		t.Fatal("allowed media mutation")
	}
}

func TestDemoHasReviewableSuggestions(t *testing.T) {
	s := &EditorService{}
	snapshot, err := s.LoadDemo()
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Project.Original) != 7 || len(snapshot.Project.State.Suggestions) != 7 {
		t.Fatalf("demo fixture: %d cues, %d suggestions", len(snapshot.Project.Original), len(snapshot.Project.State.Suggestions))
	}
	if snapshot.Project.State.Cues[0].Text != snapshot.Project.Original[0].Text {
		t.Fatal("demo changed text automatically")
	}
	if !snapshot.Project.State.Suggestions[4].Review || len(snapshot.Project.State.Suggestions[4].SpeakerIDs) != 2 {
		t.Fatal("overlapping demo speakers not marked")
	}
}
func TestWaveformUsesSelectedMediaOnly(t *testing.T) {
	s := &EditorService{}
	if _, err := s.Waveform(); err == nil {
		t.Fatal("waveform without media")
	}
	if !media.Dependency("ffmpeg") {
		t.Skip("FFmpeg missing")
	}
	path := filepath.Join(t.TempDir(), "tone.wav")
	if err := exec.Command("ffmpeg", "-nostdin", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-y", path).Run(); err != nil {
		t.Fatal(err)
	}
	s = &EditorService{mediaPath: path, mediaRevision: 3}
	w, err := s.Waveform()
	if err != nil {
		t.Fatal(err)
	}
	if w.MediaURL != s.GetSnapshot().MediaURL || w.PeaksPerSecond != media.PeaksPerSecond || len(w.Peaks) == 0 {
		t.Fatalf("unexpected waveform %s %d %d", w.MediaURL, w.PeaksPerSecond, len(w.Peaks))
	}
	if s.GetStatus().Busy {
		t.Fatal("waveform must not block other work")
	}
}
