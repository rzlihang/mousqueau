package project

import (
	"encoding/json"
	"math"
	"mousqueau/internal/analysis"
	"mousqueau/internal/subtitle"
	"slices"
	"strconv"
	"strings"
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
func pair() *Project {
	return New([]subtitle.Cue{
		{ID: "cue-1", Identifier: "1", Start: 1, End: 3, Text: "Hello there", SpeakerIDs: []string{"A"}},
		{ID: "cue-2", Identifier: "2", Start: 3, End: 5, Text: "我們走吧", SpeakerIDs: []string{"B"}, Review: true},
	}, "original.srt")
}
func TestSplitAndMergeAreUndoable(t *testing.T) {
	p := pair()
	if err := p.Split("cue-1", 2.0004, 5); err != nil {
		t.Fatal(err)
	}
	c := p.State.Cues
	if len(c) != 3 || c[0].Text != "Hello" || c[1].Text != "there" || c[0].End != 2 || c[1].Start != 2 || c[1].End != 3 {
		t.Fatalf("split: %+v", c)
	}
	if c[0].ID != "cue-1" || c[1].ID == "cue-1" || c[1].ID == "cue-2" || c[2].Identifier != "3" || c[1].SpeakerIDs[0] != "A" {
		t.Fatalf("split identity: %+v", c)
	}
	if len(p.Original) != 2 || p.Original[0].Text != "Hello there" {
		t.Fatal("original mutated")
	}
	if err := p.Merge(c[1].ID); err != nil {
		t.Fatal(err)
	}
	c = p.State.Cues
	if len(c) != 2 || c[1].Text != "there我們走吧" || c[1].Start != 2 || c[1].End != 5 || !c[1].Review || len(c[1].SpeakerIDs) != 2 || c[1].Identifier != "2" {
		t.Fatalf("merge: %+v", c)
	}
	p.UndoEdit()
	p.UndoEdit()
	if len(p.State.Cues) != 2 || p.State.Cues[0].Text != "Hello there" {
		t.Fatal("undo")
	}
	p.RedoEdit()
	if len(p.State.Cues) != 3 {
		t.Fatal("redo")
	}
}
func TestSplitAndMergeRejectInvalidInput(t *testing.T) {
	p := pair()
	for _, tc := range []struct {
		at     float64
		offset int
	}{{1, 5}, {3, 5}, {1.0004, 5}, {2, 0}, {2, 11}, {2, 99}} {
		if p.Split("cue-1", tc.at, tc.offset) == nil {
			t.Fatalf("split accepted at %v offset %d", tc.at, tc.offset)
		}
	}
	if p.Merge("cue-2") == nil || p.Merge("missing") == nil || len(p.Undo) != 0 {
		t.Fatal("invalid merge accepted")
	}
}
func TestMergeCoversOutOfOrderCues(t *testing.T) {
	p := New([]subtitle.Cue{
		{ID: "cue-1", Identifier: "1", Start: 4, End: 6, Text: "later", SpeakerIDs: []string{}},
		{ID: "cue-2", Identifier: "2", Start: 1, End: 3, Text: "earlier", SpeakerIDs: []string{}},
	}, "")
	if err := p.Merge("cue-1"); err != nil {
		t.Fatal(err)
	}
	if c := p.State.Cues[0]; c.Start != 1 || c.End != 6 {
		t.Fatalf("merged range %v–%v", c.Start, c.End)
	}
}
func TestMergeMovesSuggestionsAndKeepsThemStale(t *testing.T) {
	p := pair()
	p.AddAnalysis(analysis.Align(p.State.Cues, []analysis.Segment{{Speaker: "B", Start: 3, End: 5, Text: "我们走吧"}}, 0, 60))
	if len(p.State.Suggestions) == 0 {
		t.Fatal("no suggestion to move")
	}
	if err := p.Merge("cue-1"); err != nil {
		t.Fatal(err)
	}
	for _, s := range p.State.Suggestions {
		if s.CueID != "cue-1" {
			t.Fatalf("suggestion left on removed cue: %+v", s)
		}
		if p.Decide(s.ID, "accepted") == nil {
			t.Fatal("stale suggestion accepted after merge")
		}
	}
}
func TestAudioAndDictionarySuggestionsCoexist(t *testing.T) {
	p := initial()
	p.AddAnalysis(analysis.Align(p.State.Cues, []analysis.Segment{{Speaker: "A", Start: 1, End: 3, Text: "建議"}}, 0, 60))
	cue := p.State.Cues[0]
	cue.SpeakerIDs = []string{"keep"}
	cue.Review = true
	if err := p.Edit(cue); err != nil {
		t.Fatal(err)
	}
	// Dictionary suggestion for the same cue must not drop the audio one.
	p.AddAnalysis(analysis.Result{Suggestions: []analysis.Suggestion{{
		ID: "suggestion-dictionary-c1", CueID: "c1", Original: "原文", Proposed: "词典修正",
		SpeakerIDs: []string{"ignored"}, Review: false, Status: "pending", Source: analysis.SourceDictionary,
	}}})
	if len(p.State.Suggestions) != 2 {
		t.Fatalf("want both sources, got %+v", p.State.Suggestions)
	}
	var dictID string
	for _, s := range p.State.Suggestions {
		if analysis.SuggestionSource(s) == analysis.SourceDictionary {
			dictID = s.ID
		}
	}
	if err := p.Decide(dictID, "accepted"); err != nil {
		t.Fatal(err)
	}
	c := p.State.Cues[0]
	if c.Text != "词典修正" || !c.Review || len(c.SpeakerIDs) != 1 || c.SpeakerIDs[0] != "keep" {
		t.Fatalf("dictionary accept changed more than text: %+v", c)
	}
	p.UndoEdit()
	if p.State.Cues[0].Text != "原文" {
		t.Fatal("undo after dictionary accept")
	}
}

func crosstalk() *Project {
	return New([]subtitle.Cue{
		{ID: "cue-1", Identifier: "1", Start: 1, End: 3, Text: "这是没钱 要钱了呗 要没钱", SpeakerIDs: []string{"C"}},
		{ID: "cue-2", Identifier: "2", Start: 3, End: 5, Text: "好", SpeakerIDs: []string{}},
	}, "")
}
func TestEditWithLinesKeepsOneCue(t *testing.T) {
	p := crosstalk()
	cue := p.State.Cues[0]
	cue.Lines = []subtitle.Line{{Text: "这是没钱 要没钱", SpeakerIDs: []string{"C"}}, {Text: "要钱了呗", SpeakerIDs: []string{"A"}}}
	if err := p.Edit(cue); err != nil {
		t.Fatal(err)
	}
	c := p.State.Cues[0]
	if len(p.State.Cues) != 2 || c.Text != "- 这是没钱 要没钱\n- 要钱了呗" || len(c.SpeakerIDs) != 2 || len(c.Lines) != 2 {
		t.Fatalf("edit: %+v", c)
	}
	if p.Split("cue-1", 2, 3) == nil {
		t.Fatal("time split of a cue with lines")
	}
	p.UndoEdit()
	if p.State.Cues[0].Lines != nil || p.State.Cues[0].Text != "这是没钱 要钱了呗 要没钱" {
		t.Fatal("undo")
	}
}
func TestSplitLinesMakesOverlappingCues(t *testing.T) {
	p := crosstalk()
	cue := p.State.Cues[0]
	cue.Lines = []subtitle.Line{{Text: "这是没钱", SpeakerIDs: []string{"C"}}, {Text: "要钱了呗", SpeakerIDs: []string{"A"}}, {Text: "要没钱", SpeakerIDs: []string{"B"}}}
	if err := p.Edit(cue); err != nil {
		t.Fatal(err)
	}
	if err := p.SplitLines("cue-1"); err != nil {
		t.Fatal(err)
	}
	c := p.State.Cues
	if len(c) != 4 || c[0].ID != "cue-1" || c[1].ID == c[2].ID || c[2].ID == "cue-2" {
		t.Fatalf("ids: %+v", c)
	}
	for k, want := range []string{"这是没钱", "要钱了呗", "要没钱"} {
		if c[k].Text != want || c[k].Start != 1 || c[k].End != 3 || c[k].Lines != nil || len(c[k].SpeakerIDs) != 1 || c[k].Identifier != strconv.Itoa(k+1) {
			t.Fatalf("part %d: %+v", k, c[k])
		}
	}
	if p.SplitLines("cue-2") == nil {
		t.Fatal("split a single line")
	}
}
func TestMergeKeepsSpeakersOnTheirLines(t *testing.T) {
	p := crosstalk()
	cue := p.State.Cues[0]
	cue.Lines = []subtitle.Line{{Text: "这是没钱", SpeakerIDs: []string{"C"}}, {Text: "要钱了呗", SpeakerIDs: []string{"A"}}}
	if err := p.Edit(cue); err != nil {
		t.Fatal(err)
	}
	if err := p.Merge("cue-1"); err != nil {
		t.Fatal(err)
	}
	c := p.State.Cues[0]
	if len(c.Lines) != 3 || c.Lines[2].Text != "好" || c.Text != "- 这是没钱\n- 要钱了呗\n- 好" {
		t.Fatalf("merge: %+v", c)
	}
}
func TestDecodeDropsLinesThatNoLongerMatchTheText(t *testing.T) {
	p := crosstalk()
	cue := p.State.Cues[0]
	cue.Lines = []subtitle.Line{{Text: "这是没钱", SpeakerIDs: []string{"C"}}, {Text: "要钱了呗", SpeakerIDs: []string{"A"}}}
	if err := p.Edit(cue); err != nil {
		t.Fatal(err)
	}
	p.State.Cues[0].Text = "手改过的文字"
	data, _ := json.Marshal(p)
	if !strings.Contains(string(data), `"$schema":"`+SchemaURL) {
		t.Fatal("no schema reference")
	}
	loaded, err := Decode(data)
	if err != nil {
		t.Fatal(err)
	}
	if c := loaded.State.Cues[0]; c.Lines != nil || c.Text != "手改过的文字" {
		t.Fatalf("stale lines kept: %+v", c)
	}
	if loaded.Undo[len(loaded.Undo)-1].Cues[0].Lines != nil {
		t.Fatal("history changed")
	}
}
func TestAcceptedSuggestionKeepsMatchingLines(t *testing.T) {
	p := crosstalk()
	cue := p.State.Cues[0]
	cue.Lines = []subtitle.Line{{Text: "这是没前", SpeakerIDs: []string{"C"}}, {Text: "要钱了呗", SpeakerIDs: []string{"A"}}}
	if err := p.Edit(cue); err != nil {
		t.Fatal(err)
	}
	p.AddAnalysis(analysis.Result{Suggestions: []analysis.Suggestion{{
		ID: "s1", CueID: "cue-1", Original: "- 这是没前\n- 要钱了呗", Proposed: "- 这是没钱\n- 要钱了呗",
		SpeakerIDs: []string{"X"}, Status: "pending",
	}}})
	if err := p.Decide("s1", "accepted"); err != nil {
		t.Fatal(err)
	}
	c := p.State.Cues[0]
	if len(c.Lines) != 2 || c.Lines[0].Text != "这是没钱" || c.Lines[1].SpeakerIDs[0] != "A" || slices.Contains(c.SpeakerIDs, "X") {
		t.Fatalf("accept: %+v", c)
	}
}
func TestMergeJoinsLinesOfTheSameSpeaker(t *testing.T) {
	p := New([]subtitle.Cue{
		{ID: "cue-1", Identifier: "1", Start: 1, End: 3, Text: "x", SpeakerIDs: []string{}, Lines: []subtitle.Line{
			{Text: "这是没钱", SpeakerIDs: []string{"C"}},
			{Text: "要钱了呗", SpeakerIDs: []string{"A"}},
			{Text: "嗯", SpeakerIDs: []string{}},
		}},
		{ID: "cue-2", Identifier: "2", Start: 3, End: 5, Text: "x", SpeakerIDs: []string{}, Lines: []subtitle.Line{
			{Text: "还要多少", SpeakerIDs: []string{"A"}},
			{Text: "啊", SpeakerIDs: []string{}},
			{Text: "够了", SpeakerIDs: []string{"B"}},
		}},
	}, "")
	for i := range p.State.Cues {
		c, err := subtitle.Normalize(p.State.Cues[i])
		if err != nil {
			t.Fatal(err)
		}
		p.State.Cues[i] = c
	}
	if err := p.Merge("cue-1"); err != nil {
		t.Fatal(err)
	}
	c := p.State.Cues[0]
	want := "- 这是没钱\n- 要钱了呗还要多少\n- 嗯\n- 啊\n- 够了"
	if c.Text != want || len(c.Lines) != 5 {
		t.Fatalf("merge: %q %+v", c.Text, c.Lines)
	}
	if err := p.SplitLines("cue-1"); err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for _, cue := range p.State.Cues {
		for _, s := range cue.SpeakerIDs {
			if seen[s] {
				t.Fatalf("speaker %s split into two cues", s)
			}
			seen[s] = true
		}
	}
}

func TestShiftMovesEveryCueAndIsUndoable(t *testing.T) {
	p := New([]subtitle.Cue{
		{ID: "c1", Identifier: "1", Start: 1, End: 2.5, Text: "一", SpeakerIDs: []string{}},
		{ID: "c2", Identifier: "2", Start: 3.2, End: 4, Text: "二", SpeakerIDs: []string{}},
	}, "original.srt")
	p.State.Segments = []analysis.Segment{{Start: 1, End: 2}}
	if err := p.Shift(-0.7504); err != nil {
		t.Fatal(err)
	}
	got := p.State.Cues
	if got[0].Start != 0.25 || got[0].End != 1.75 || got[1].Start != 2.45 || got[1].End != 3.25 {
		t.Fatalf("shifted cues: %+v", got)
	}
	if p.State.Segments[0].Start != 1 || p.Original[0].Start != 1 {
		t.Fatal("segments or originals moved")
	}
	p.UndoEdit()
	if p.State.Cues[0].Start != 1 || p.State.Cues[1].End != 4 {
		t.Fatal("undo")
	}
}

func TestShiftRejectsInvalidOffsets(t *testing.T) {
	p := initial()
	for _, offset := range []float64{0, 0.0004, -1.001, math.NaN(), math.Inf(1)} {
		if err := p.Shift(offset); err == nil {
			t.Fatalf("offset %v accepted", offset)
		}
	}
	if len(p.Undo) != 0 || p.State.Cues[0].Start != 1 {
		t.Fatal("rejected shift changed the project")
	}
	if err := p.Shift(-1); err != nil || p.State.Cues[0].Start != 0 {
		t.Fatalf("shift to zero: %v", err)
	}
}
