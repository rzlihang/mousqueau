// Package project owns immutable imports and persistent undo/redo snapshots.
package project

import (
	"encoding/json"
	"fmt"
	"mousqueau/internal/analysis"
	"mousqueau/internal/subtitle"
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
	return fmt.Errorf("subtitle no longer exists")
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
		return fmt.Errorf("invalid suggestion decision")
	}
	next := clone(p.State)
	for i, s := range next.Suggestions {
		if s.ID == id {
			if s.Status != "pending" {
				return fmt.Errorf("suggestion already reviewed")
			}
			if decision == "accepted" {
				for j, c := range next.Cues {
					if c.ID == s.CueID {
						if c.Text != s.Original {
							return fmt.Errorf("subtitle changed since analysis; analyze again or edit manually")
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
	return fmt.Errorf("suggestion not found")
}
func (p *Project) SetSpeaker(speaker analysis.Speaker) error {
	if speaker.ID == "" || speaker.Name == "" {
		return fmt.Errorf("speaker ID and name are required")
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
		return nil, fmt.Errorf("invalid project JSON: %w", err)
	}
	if p.Version != 1 {
		return nil, fmt.Errorf("unsupported project version %d", p.Version)
	}
	if len(p.Original) == 0 || len(p.State.Cues) == 0 {
		return nil, fmt.Errorf("project has no subtitles")
	}
	validate := func(cues []subtitle.Cue) error {
		ids := map[string]bool{}
		for _, c := range cues {
			if c.ID == "" || ids[c.ID] {
				return fmt.Errorf("missing or duplicate cue ID")
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
