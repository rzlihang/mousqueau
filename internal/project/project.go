// Package project owns immutable imports and persistent undo/redo snapshots.
package project

import (
	"encoding/json"
	"fmt"
	"math"
	"mousqueau/internal/analysis"
	"mousqueau/internal/i18n"
	"mousqueau/internal/subtitle"
	"slices"
	"strconv"
	"strings"
	"unicode"
)

type State struct {
	Cues        []subtitle.Cue        `json:"cues"`
	Speakers    []analysis.Speaker    `json:"speakers"`
	Segments    []analysis.Segment    `json:"segments"`
	Suggestions []analysis.Suggestion `json:"suggestions"`
}
type Project struct {
	Version      int            `json:"version"`
	VideoPath    string         `json:"videoPath"`
	SubtitlePath string         `json:"subtitlePath"`
	Original     []subtitle.Cue `json:"original"`
	State        State          `json:"state"`
	Undo         []State        `json:"undo"`
	Redo         []State        `json:"redo"`
}

func clone[T any](v T) T { b, _ := json.Marshal(v); var out T; _ = json.Unmarshal(b, &out); return out }
func New(cues []subtitle.Cue, source string) *Project {
	return &Project{Version: 1, SubtitlePath: source, Original: clone(cues), State: State{Cues: clone(cues), Speakers: []analysis.Speaker{}, Segments: []analysis.Segment{}, Suggestions: []analysis.Suggestion{}}, Undo: []State{}, Redo: []State{}}
}
func (p *Project) commit(next State) {
	p.Undo = append(p.Undo, clone(p.State))
	if len(p.Undo) > 100 {
		p.Undo = p.Undo[1:]
	}
	p.Redo = []State{}
	p.State = clone(next)
}
func (p *Project) Edit(cue subtitle.Cue) error {
	if err := subtitle.Validate(cue); err != nil {
		return err
	}
	if _, err := subtitle.Render([]subtitle.Cue{cue}); err != nil {
		return err
	}
	next := clone(p.State)
	for i, c := range next.Cues {
		if c.ID == cue.ID {
			cue.Identifier = c.Identifier
			next.Cues[i] = cue
			p.commit(next)
			return nil
		}
	}
	return i18n.Errorf("subtitle no longer exists")
}

// Split divides a cue at a time and a text offset counted in Unicode code
// points. The first part keeps the cue's ID, and with it any suggestions.
func (p *Project) Split(id string, at float64, offset int) error {
	next := clone(p.State)
	i := slices.IndexFunc(next.Cues, func(c subtitle.Cue) bool { return c.ID == id })
	if i < 0 {
		return i18n.Errorf("subtitle no longer exists")
	}
	first := next.Cues[i]
	ms := func(t float64) int64 { return int64(math.Round(t * 1000)) }
	if math.IsNaN(at) || ms(at) <= ms(first.Start) || ms(at) >= ms(first.End) {
		return i18n.Errorf("the split time must fall inside the subtitle")
	}
	text := []rune(first.Text)
	if offset <= 0 || offset >= len(text) {
		return i18n.Errorf("the split must leave text on both sides")
	}
	second := first
	second.ID = p.newCueID()
	second.SpeakerIDs = slices.Clone(first.SpeakerIDs)
	first.Text = strings.TrimRightFunc(string(text[:offset]), unicode.IsSpace)
	second.Text = strings.TrimLeftFunc(string(text[offset:]), unicode.IsSpace)
	if first.Text == "" || second.Text == "" {
		return i18n.Errorf("the split must leave text on both sides")
	}
	first.End = float64(ms(at)) / 1000
	second.Start = first.End
	next.Cues = slices.Insert(next.Cues, i+1, second)
	next.Cues[i] = first
	return p.commitStructure(next)
}

// Merge joins a cue with the one after it. The merged cue keeps the first
// ID; suggestions for the second move to it and, since the text no longer
// matches what was analyzed, can only be rejected.
func (p *Project) Merge(id string) error {
	next := clone(p.State)
	i := slices.IndexFunc(next.Cues, func(c subtitle.Cue) bool { return c.ID == id })
	if i < 0 {
		return i18n.Errorf("subtitle no longer exists")
	}
	if i+1 >= len(next.Cues) {
		return i18n.Errorf("there is no following subtitle to merge with")
	}
	a, b := next.Cues[i], next.Cues[i+1]
	a.End = math.Max(a.End, b.End)
	a.Text = joinText(a.Text, b.Text)
	for _, s := range b.SpeakerIDs {
		if !slices.Contains(a.SpeakerIDs, s) {
			a.SpeakerIDs = append(a.SpeakerIDs, s)
		}
	}
	if a.SpeakerIDs == nil {
		a.SpeakerIDs = []string{}
	}
	a.Review = a.Review || b.Review
	next.Cues[i] = a
	next.Cues = slices.Delete(next.Cues, i+1, i+2)
	for k, s := range next.Suggestions {
		if s.CueID == b.ID {
			next.Suggestions[k].CueID = a.ID
		}
	}
	return p.commitStructure(next)
}

// joinText joins two subtitle texts with a space, or with nothing where
// either side of the join is CJK, which is written without spaces.
func joinText(a, b string) string {
	a = strings.TrimRightFunc(a, unicode.IsSpace)
	b = strings.TrimLeftFunc(b, unicode.IsSpace)
	if a == "" || b == "" {
		return a + b
	}
	ra, rb := []rune(a), []rune(b)
	if unbroken(ra[len(ra)-1]) || unbroken(rb[0]) {
		return a + b
	}
	return a + " " + b
}
func unbroken(r rune) bool {
	return unicode.In(r, unicode.Han, unicode.Hiragana, unicode.Katakana, unicode.Hangul) ||
		(r >= 0x3000 && r <= 0x303f) || (r >= 0xff00 && r <= 0xffef)
}

// commitStructure renumbers SRT identifiers after cues were added or removed,
// so the exported file stays sequential, then validates and commits.
func (p *Project) commitStructure(next State) error {
	for i := range next.Cues {
		next.Cues[i].Identifier = strconv.Itoa(i + 1)
	}
	if _, err := subtitle.Render(next.Cues); err != nil {
		return err
	}
	p.commit(next)
	return nil
}

// newCueID returns an ID that no cue in the project, its originals or its
// history has used.
func (p *Project) newCueID() string {
	used := map[string]bool{}
	for _, cues := range [][]subtitle.Cue{p.Original, p.State.Cues} {
		for _, c := range cues {
			used[c.ID] = true
		}
	}
	for _, s := range append(slices.Clone(p.Undo), p.Redo...) {
		for _, c := range s.Cues {
			used[c.ID] = true
		}
	}
	for n := len(used) + 1; ; n++ {
		if id := fmt.Sprintf("cue-%d", n); !used[id] {
			return id
		}
	}
}
func (p *Project) UndoEdit() {
	if len(p.Undo) == 0 {
		return
	}
	p.Redo = append(p.Redo, clone(p.State))
	p.State = p.Undo[len(p.Undo)-1]
	p.Undo = p.Undo[:len(p.Undo)-1]
}
func (p *Project) RedoEdit() {
	if len(p.Redo) == 0 {
		return
	}
	p.Undo = append(p.Undo, clone(p.State))
	p.State = p.Redo[len(p.Redo)-1]
	p.Redo = p.Redo[:len(p.Redo)-1]
}
func (p *Project) AddAnalysis(result analysis.Result) {
	next := clone(p.State)
	next.Segments = append(next.Segments, result.Segments...)
	for _, speaker := range result.Speakers {
		found := false
		for _, s := range next.Speakers {
			if s.ID == speaker.ID {
				found = true
			}
		}
		if !found {
			next.Speakers = append(next.Speakers, speaker)
		}
	}
	for _, suggestion := range result.Suggestions {
		filtered := []analysis.Suggestion{}
		for _, s := range next.Suggestions {
			if s.CueID != suggestion.CueID {
				filtered = append(filtered, s)
			}
		}
		next.Suggestions = append(filtered, suggestion)
	}
	p.commit(next)
}
func (p *Project) Decide(id, decision string) error {
	if decision != "accepted" && decision != "rejected" {
		return i18n.Errorf("invalid suggestion decision")
	}
	next := clone(p.State)
	for i, s := range next.Suggestions {
		if s.ID == id {
			if s.Status != "pending" {
				return i18n.Errorf("suggestion already reviewed")
			}
			if decision == "accepted" {
				if !slices.ContainsFunc(next.Cues, func(c subtitle.Cue) bool { return c.ID == s.CueID }) {
					return i18n.Errorf("subtitle no longer exists")
				}
				for j, c := range next.Cues {
					if c.ID == s.CueID {
						if c.Text != s.Original {
							return i18n.Errorf("subtitle changed since analysis; analyze again or edit manually")
						}
						c.Text = s.Proposed
						c.SpeakerIDs = s.SpeakerIDs
						c.Review = s.Review
						if _, err := subtitle.Render([]subtitle.Cue{c}); err != nil {
							return err
						}
						next.Cues[j] = c
					}
				}
			}
			next.Suggestions[i].Status = decision
			p.commit(next)
			return nil
		}
	}
	return i18n.Errorf("suggestion not found")
}
func (p *Project) SetSpeaker(speaker analysis.Speaker) error {
	if speaker.ID == "" || speaker.Name == "" {
		return i18n.Errorf("speaker ID and name are required")
	}
	next := clone(p.State)
	found := false
	for i, s := range next.Speakers {
		if s.ID == speaker.ID {
			next.Speakers[i] = speaker
			found = true
		}
	}
	if !found {
		next.Speakers = append(next.Speakers, speaker)
	}
	p.commit(next)
	return nil
}
func Decode(data []byte) (*Project, error) {
	var p Project
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, i18n.Errorf("invalid project JSON: %w", err)
	}
	if p.Version != 1 {
		return nil, i18n.Errorf("unsupported project version %d", p.Version)
	}
	if len(p.Original) == 0 || len(p.State.Cues) == 0 {
		return nil, i18n.Errorf("project has no subtitles")
	}
	validate := func(cues []subtitle.Cue) error {
		ids := map[string]bool{}
		for _, c := range cues {
			if c.ID == "" || ids[c.ID] {
				return i18n.Errorf("missing or duplicate cue ID")
			}
			ids[c.ID] = true
		}
		_, err := subtitle.Render(cues)
		return err
	}
	if err := validate(p.Original); err != nil {
		return nil, err
	}
	if err := validate(p.State.Cues); err != nil {
		return nil, err
	}
	for _, state := range append(append([]State{}, p.Undo...), p.Redo...) {
		if err := validate(state.Cues); err != nil {
			return nil, err
		}
	}
	return &p, nil
}
