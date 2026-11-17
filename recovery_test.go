package main

import (
	"os"
	"path/filepath"
	"testing"

	"mousqueau/internal/project"
	"mousqueau/internal/subtitle"
)

func recoveryService(t *testing.T) (*EditorService, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "recovery.json")
	s := &EditorService{recoveryPath: path}
	s.project = project.New([]subtitle.Cue{{ID: "c", Identifier: "1", Start: 0, End: 2, Text: "原文", SpeakerIDs: []string{}}}, "")
	s.mu.Lock()
	s.markCleanLocked()
	s.mu.Unlock()
	s.flushRecovery()
	return s, path
}

func exists(path string) bool { _, err := os.Stat(path); return err == nil }

func TestRecoveryFollowsUnsavedChanges(t *testing.T) {
	s, path := recoveryService(t)
	if exists(path) {
		t.Fatal("an unchanged project wrote a recovery file")
	}
	s.GetSnapshot()
	s.flushRecovery()
	if exists(path) {
		t.Fatal("reading the project wrote a recovery file")
	}
	cue := s.GetSnapshot().Project.State.Cues[0]
	cue.Text = "改過"
	if _, err := s.EditCue(cue); err != nil {
		t.Fatal(err)
	}
	s.flushRecovery()
	p, _, err := project.ReadRecovery(path)
	if err != nil || p == nil || p.State.Cues[0].Text != "改過" || len(p.Undo) != 1 {
		t.Fatalf("recovery after an edit: %+v %v", p, err)
	}
	// Undo brings the text back, but the redo history is unsaved work too.
	if _, err := s.Undo(); err != nil {
		t.Fatal(err)
	}
	s.flushRecovery()
	if p, _, _ := project.ReadRecovery(path); p == nil || len(p.Redo) != 1 {
		t.Fatal("undo dropped the recovery file with its redo history")
	}
	// Saving is what clears it.
	s.mu.Lock()
	s.markCleanLocked()
	s.mu.Unlock()
	s.flushRecovery()
	if exists(path) {
		t.Fatal("a saved project kept its recovery file")
	}
}

func TestRecoveryFromAnEarlierSessionWaitsForAnAnswer(t *testing.T) {
	s, path := recoveryService(t)
	cue := s.GetSnapshot().Project.State.Cues[0]
	cue.Text = "上次的修改"
	if _, err := s.EditCue(cue); err != nil {
		t.Fatal(err)
	}
	if err := s.ServiceShutdown(); err != nil {
		t.Fatal(err)
	}
	if !exists(path) {
		t.Fatal("quitting with unsaved work left no recovery file")
	}

	// The next launch: another project is open before the user answers.
	next := &EditorService{recoveryPath: path, recoveryHeld: true}
	next.project = project.New([]subtitle.Cue{{ID: "n", Identifier: "1", Start: 0, End: 1, Text: "新的", SpeakerIDs: []string{}}}, "")
	edited := next.GetSnapshot().Project.State.Cues[0]
	edited.Text = "新的修改"
	if _, err := next.EditCue(edited); err != nil {
		t.Fatal(err)
	}
	next.flushRecovery()
	if p, _, _ := project.ReadRecovery(path); p == nil || p.State.Cues[0].Text != "上次的修改" {
		t.Fatal("this session overwrote the earlier session's work before an answer")
	}
	if info := next.RecoveryInfo(); !info.Available || info.Cues != 1 || info.SavedAt == "" {
		t.Fatalf("info: %+v", info)
	}
	snapshot, err := next.RestoreRecovery()
	if err != nil || snapshot.Project.State.Cues[0].Text != "上次的修改" || len(snapshot.Project.Undo) != 1 {
		t.Fatalf("restore: %+v %v", snapshot.Project, err)
	}
	next.flushRecovery()
	if !exists(path) {
		t.Fatal("restored work is still unsaved and must stay recoverable")
	}
	if next.RecoveryInfo().Available {
		t.Fatal("the offer is made once")
	}
}

func TestDiscardRecoveryRemovesTheFileAndTracksTheOpenProject(t *testing.T) {
	path := filepath.Join(t.TempDir(), "recovery.json")
	if err := os.WriteFile(path, []byte(`{"version":1,"state":{"cues":[]}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	s := &EditorService{recoveryPath: path, recoveryHeld: true}
	if err := s.DiscardRecovery(); err != nil || exists(path) {
		t.Fatalf("discard: %v", err)
	}
	if _, err := s.RestoreRecovery(); err == nil {
		t.Fatal("restored after discarding")
	}
	// A damaged file is not offered, and no longer blocks this session.
	if err := os.WriteFile(path, []byte("{"), 0o600); err != nil {
		t.Fatal(err)
	}
	damaged := &EditorService{recoveryPath: path, recoveryHeld: true}
	if damaged.RecoveryInfo().Available || damaged.recoveryHeld {
		t.Fatal("a damaged recovery file was offered or kept the session held")
	}
}
