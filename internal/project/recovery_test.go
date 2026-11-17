package project

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"mousqueau/internal/subtitle"
)

func TestRecoveryRoundTripKeepsHistory(t *testing.T) {
	path := filepath.Join(t.TempDir(), "Mousqueau", "recovery.json")
	if p, _, err := ReadRecovery(path); p != nil || err != nil {
		t.Fatalf("missing file: %v %v", p, err)
	}
	p := New([]subtitle.Cue{{ID: "c1", Identifier: "1", Start: 1, End: 2, Text: "一", SpeakerIDs: []string{}}}, "original.srt")
	if _, err := p.Replace("一", "二", true); err != nil {
		t.Fatal(err)
	}
	data, _ := json.Marshal(p)
	if err := WriteRecovery(path, data); err != nil {
		t.Fatal(err)
	}
	got, when, err := ReadRecovery(path)
	if err != nil || when.IsZero() {
		t.Fatalf("read: %v %v", when, err)
	}
	if got.State.Cues[0].Text != "二" || len(got.Undo) != 1 || got.Original[0].Text != "一" {
		t.Fatalf("recovered: %+v", got)
	}
	// A second write replaces the first and leaves no temporary file behind.
	if err := WriteRecovery(path, []byte(`{"version":1}`)); err != nil {
		t.Fatal(err)
	}
	entries, _ := os.ReadDir(filepath.Dir(path))
	if len(entries) != 1 || entries[0].Name() != "recovery.json" {
		t.Fatalf("directory: %v", entries)
	}
	if stat, _ := os.Stat(path); stat.Mode().Perm() != 0o600 {
		t.Fatalf("mode %v", stat.Mode())
	}
}

func TestReadRecoveryReportsDamage(t *testing.T) {
	path := filepath.Join(t.TempDir(), "recovery.json")
	if err := os.WriteFile(path, []byte("{"), 0o600); err != nil {
		t.Fatal(err)
	}
	if p, _, err := ReadRecovery(path); p != nil || err == nil {
		t.Fatalf("damaged file: %v %v", p, err)
	}
}
