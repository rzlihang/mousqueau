package project

import (
	"encoding/json"
	"mousqueau/internal/analysis"
	"mousqueau/internal/subtitle"
	"testing"
)

func initial() *Project {
	return New([]subtitle.Cue{{ID: "c1", Identifier: "9", Start: 1, End: 3, Text: "原文", SpeakerIDs: []string{}}}, "original.srt")
}
func TestEditUndoRedoPersistence(t *testing.T) {
	p := initial()
	cue := p.State.Cues[0]
	cue.Text = "修正"
	cue.SpeakerIDs = []string{"A"}
	if err := p.Edit(cue); err != nil {
		t.Fatal(err)
	}
	if p.Original[0].Text != "原文" || len(p.Original[0].SpeakerIDs) != 0 {
		t.Fatal("original mutated")
	}
	p.UndoEdit()
	if p.State.Cues[0].Text != "原文" {
		t.Fatal("undo")
	}
	data, _ := json.Marshal(p)
	loaded, err := Decode(data)
	if err != nil {
		t.Fatal(err)
	}
	loaded.RedoEdit()
	if loaded.State.Cues[0].Text != "修正" || loaded.State.Cues[0].SpeakerIDs[0] != "A" {
		t.Fatal("redo after reopen")
	}
	loaded.UndoEdit()
	cue = loaded.State.Cues[0]
	cue.Text = "新分支"
	loaded.Edit(cue)
	if len(loaded.Redo) != 0 {
		t.Fatal("redo not invalidated")
	}
}
func TestSuggestionsNeverAutoReplace(t *testing.T) {
	p := initial()
	p.AddAnalysis(analysis.Align(p.State.Cues, []analysis.Segment{{Speaker: "A", Start: 1, End: 3, Text: "建議"}}, 0, 60))
	if p.State.Cues[0].Text != "原文" {
		t.Fatal("silent correction")
	}
	id := p.State.Suggestions[0].ID
	p.Decide(id, "rejected")
	if p.State.Cues[0].Text != "原文" {
		t.Fatal("reject changed text")
	}
	p.UndoEdit()
	if err := p.Decide(id, "accepted"); err != nil {
		t.Fatal(err)
	}
	if p.State.Cues[0].Text != "建議" {
		t.Fatal("accept failed")
	}
	p.UndoEdit()
	if p.State.Cues[0].Text != "原文" || p.State.Suggestions[0].Status != "pending" {
		t.Fatal("history not preserved")
	}
	cue := p.State.Cues[0]
	cue.Text = "手動修改"
	p.Edit(cue)
	if err := p.Decide(id, "accepted"); err == nil {
		t.Fatal("stale proposal accepted")
	}
}
func TestInvalidProjectAndEdit(t *testing.T) {
	p := initial()
	c := p.State.Cues[0]
	c.End = c.Start
	if p.Edit(c) == nil {
		t.Fatal("invalid timing accepted")
	}
	for _, s := range []string{`{"version":2}`, `{"version":1,"original":[],"state":{"cues":[]}}`} {
		if _, err := Decode([]byte(s)); err == nil {
			t.Fatal("invalid project accepted")
		}
	}
}
