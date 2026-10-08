// Package analysis keeps diarization independent of providers and editing.
package analysis

import (
	"fmt"
	"math"
	"mousqueau/internal/i18n"
	"mousqueau/internal/subtitle"
	"sort"
	"strings"
)

type Segment struct {
	ID      string  `json:"id"`
	Speaker string  `json:"speaker"`
	Start   float64 `json:"start"`
	End     float64 `json:"end"`
	Text    string  `json:"text"`
}
type Speaker struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
}
type Suggestion struct {
	ID         string   `json:"id"`
	CueID      string   `json:"cueId"`
	Original   string   `json:"original"`
	Proposed   string   `json:"proposed"`
	SpeakerIDs []string `json:"speakerIds"`
	Review     bool     `json:"review"`
	Reason     string   `json:"reason"`
	Status     string   `json:"status"`
}
type Result struct {
	Segments    []Segment    `json:"segments"`
	Suggestions []Suggestion `json:"suggestions"`
	Speakers    []Speaker    `json:"speakers"`
}

func Offset(segments []Segment, offset, duration float64) ([]Segment, error) {
	result := make([]Segment, len(segments))
	copy(result, segments)
	for i := range result {
		s := &result[i]
		if math.IsNaN(s.Start) || math.IsNaN(s.End) || math.IsInf(s.Start, 0) || math.IsInf(s.End, 0) || s.Start < 0 || s.End <= s.Start || s.End > duration+1 {
			return nil, i18n.Errorf("invalid diarization segment %d", i)
		}
		s.Start += offset
		s.End += offset
		if s.ID == "" {
			s.ID = fmt.Sprintf("segment-%d", i+1)
		}
		if s.Speaker == "" {
			s.Speaker = "Unknown"
		}
	}
	return result, nil
}

// Align never assumes that a subtitle contains a single speaker. Boundary-crossing
// transcripts are review-only: their full text cannot safely replace one cue.
func Align(cues []subtitle.Cue, segments []Segment, rangeStart, rangeEnd float64) Result {
	result := Result{Segments: segments, Suggestions: []Suggestion{}, Speakers: []Speaker{}}
	seen := map[string]bool{}
	palette := []string{"#1677ff", "#52c41a", "#d46b08", "#722ed1"}
	sorted := append([]Segment{}, segments...)
	sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].Start < sorted[j].Start })
	for _, s := range sorted {
		if !seen[s.Speaker] {
			seen[s.Speaker] = true
			result.Speakers = append(result.Speakers, Speaker{ID: s.Speaker, Name: s.Speaker, Color: palette[(len(result.Speakers))%len(palette)]})
		}
	}
	for _, c := range cues {
		if c.End <= rangeStart || c.Start >= rangeEnd {
			continue
		}
		ids := []string{}
		texts := []string{}
		matches := []Segment{}
		review := c.Start < rangeStart || c.End > rangeEnd
		for _, s := range sorted {
			overlap := math.Min(c.End, s.End) - math.Max(c.Start, s.Start)
			if overlap <= 0 {
				continue
			}
			matches = append(matches, s)
			if !contains(ids, s.Speaker) {
				ids = append(ids, s.Speaker)
			}
			if strings.TrimSpace(s.Text) != "" {
				texts = append(texts, strings.TrimSpace(s.Text))
			}
			if s.Start < c.Start-0.05 || s.End > c.End+0.05 || s.Speaker == "Unknown" {
				review = true
			}
		}
		if len(matches) == 0 {
			continue
		}
		if len(ids) > 1 {
			review = true
		}
		for i, s := range matches {
			for _, other := range matches[i+1:] {
				if math.Min(s.End, other.End) > math.Max(s.Start, other.Start) {
					review = true
				}
			}
		}
		proposed := strings.Join(texts, " ")
		reason := "Based on overlapping audio transcript; verify wording before accepting."
		if review {
			reason = "Multiple speakers, overlap, or a segment crosses a cue/range boundary. Review text and timing manually."
		}
		result.Suggestions = append(result.Suggestions, Suggestion{ID: "suggestion-" + c.ID, CueID: c.ID, Original: c.Text, Proposed: proposed, SpeakerIDs: ids, Review: review, Reason: reason, Status: "pending"})
	}
	return result
}
func contains(values []string, v string) bool {
	for _, s := range values {
		if s == v {
			return true
		}
	}
	return false
}
