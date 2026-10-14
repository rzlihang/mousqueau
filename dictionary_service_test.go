package main

import (
	"mousqueau/internal/dictionary"
	"mousqueau/internal/project"
	"mousqueau/internal/subtitle"
	"path/filepath"
	"testing"
)

func TestDictionaryCheckAndFixAreUndoable(t *testing.T) {
	dir := t.TempDir()
	s := &EditorService{
		project: project.New([]subtitle.Cue{
			{ID: "c1", Identifier: "1", Start: 0, End: 1, Text: "佩克拉来了", SpeakerIDs: []string{"A"}, Review: true},
		}, ""),
		dictionary: dictionary.Dictionary{Version: 1, Entries: []dictionary.Entry{
			{ID: "p1", Canonical: "佩可拉", Category: dictionary.CategoryPerson, Misspellings: []string{"佩克拉"}},
		}},
		dictionaryPath: filepath.Join(dir, "dictionary.json"),
	}
	snap, err := s.CheckDictionary()
	if err != nil {
		t.Fatal(err)
	}
	if len(snap.Project.State.Suggestions) != 1 || snap.Project.State.Suggestions[0].Source != "dictionary" {
		t.Fatalf("suggestions: %+v", snap.Project.State.Suggestions)
	}
	if snap.Project.State.Cues[0].Text != "佩克拉来了" {
		t.Fatal("check mutated text")
	}
	snap, err = s.FixCueFromDictionary("c1")
	if err != nil {
		t.Fatal(err)
	}
	c := snap.Project.State.Cues[0]
	if c.Text != "佩可拉来了" || !c.Review || len(c.SpeakerIDs) != 1 || c.SpeakerIDs[0] != "A" {
		t.Fatalf("fix changed more than text: %+v", c)
	}
	snap, err = s.Undo()
	if err != nil {
		t.Fatal(err)
	}
	if snap.Project.State.Cues[0].Text != "佩克拉来了" {
		t.Fatal("undo failed")
	}
}

func TestDictionaryUpsertPersists(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "dictionary.json")
	s := &EditorService{dictionary: dictionary.Empty(), dictionaryPath: path}
	view, err := s.UpsertDictionaryEntry(dictionary.Entry{
		Canonical: "米可", Category: dictionary.CategoryPerson, Misspellings: []string{"咪可"},
	})
	if err != nil || len(view.Entries) != 1 {
		t.Fatalf("upsert: %+v %v", view, err)
	}
	loaded := dictionary.Load(path)
	if loaded.ReadOnly || len(loaded.Dict.Entries) != 1 || loaded.Dict.Entries[0].Canonical != "米可" {
		t.Fatalf("persist: %+v", loaded)
	}
	matches, err := s.MatchText("咪可你好")
	if err != nil || len(matches) != 1 || matches[0].Kind != dictionary.KindMisspelled {
		t.Fatalf("match: %+v %v", matches, err)
	}
}
