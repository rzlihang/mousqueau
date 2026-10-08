// Package subtitle parses and renders SRT without mixing speaker metadata into text.
package subtitle

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
)

type Cue struct {
	ID         string   `json:"id"`
	Identifier string   `json:"identifier"`
	Start      float64  `json:"start"`
	End        float64  `json:"end"`
	Text       string   `json:"text"`
	SpeakerIDs []string `json:"speakerIds"`
	Review     bool     `json:"review"`
}

var rangeSeparator = regexp.MustCompile(`\s*-->\s*`)

var timestamp = regexp.MustCompile(`^(\d{2,}):(\d{2}):(\d{2})[,\.](\d{3})$`)

func ParseTime(value string) (float64, error) {
	m := timestamp.FindStringSubmatch(strings.TrimSpace(value))
	if m == nil {
		return 0, fmt.Errorf("invalid timestamp %q; use HH:MM:SS,mmm", value)
	}
	n := make([]int, 4)
	for i := range n {
		var err error
		n[i], err = strconv.Atoi(m[i+1])
		if err != nil {
			return 0, err
		}
	}
	if n[1] > 59 || n[2] > 59 {
		return 0, fmt.Errorf("minutes and seconds must be 00–59")
	}
	return float64(n[0])*3600 + float64(n[1])*60 + float64(n[2]) + float64(n[3])/1000, nil
}
func FormatTime(seconds float64) string {
	ms := int64(math.Round(seconds * 1000))
	if ms < 0 {
		ms = 0
	}
	return fmt.Sprintf("%02d:%02d:%02d,%03d", ms/3600000, (ms/60000)%60, (ms/1000)%60, ms%1000)
}
func Validate(c Cue) error {
	if math.IsNaN(c.Start) || math.IsNaN(c.End) || math.IsInf(c.Start, 0) || math.IsInf(c.End, 0) || c.Start < 0 || c.End <= c.Start {
		return fmt.Errorf("cue %s: end must be greater than nonnegative start", c.Identifier)
	}
	return nil
}
func Parse(input string) ([]Cue, error) {
	input = strings.TrimPrefix(input, "\ufeff")
	input = strings.ReplaceAll(input, "\r\n", "\n")
	input = strings.ReplaceAll(input, "\r", "\n")
	lines := strings.Split(strings.TrimSpace(input), "\n")
	var cues []Cue
	for i := 0; i < len(lines); {
		if strings.TrimSpace(lines[i]) == "" {
			i++
			continue
		}
		id := strings.TrimSpace(lines[i])
		i++
		if _, err := strconv.ParseUint(id, 10, 64); err != nil {
			return nil, fmt.Errorf("line %d: invalid SRT identifier %q", i, id)
		}
		if i >= len(lines) {
			return nil, fmt.Errorf("cue %s: missing timestamp", id)
		}
		parts := rangeSeparator.Split(strings.TrimSpace(lines[i]), -1)
		i++
		if len(parts) != 2 {
			return nil, fmt.Errorf("cue %s: invalid time range", id)
		}
		start, err := ParseTime(parts[0])
		if err != nil {
			return nil, err
		}
		end, err := ParseTime(parts[1])
		if err != nil {
			return nil, err
		}
		var body []string
		for i < len(lines) && strings.TrimSpace(lines[i]) != "" {
			body = append(body, lines[i])
			i++
		}
		c := Cue{ID: fmt.Sprintf("cue-%d", len(cues)+1), Identifier: id, Start: start, End: end, Text: strings.Join(body, "\n"), SpeakerIDs: []string{}}
		if err := Validate(c); err != nil {
			return nil, err
		}
		if len(body) == 0 {
			return nil, fmt.Errorf("cue %s: missing subtitle text", id)
		}
		cues = append(cues, c)
	}
	if len(cues) == 0 {
		return nil, fmt.Errorf("no SRT cues found")
	}
	return cues, nil
}
func Render(cues []Cue) (string, error) {
	var out strings.Builder
	for _, c := range cues {
		if err := Validate(c); err != nil {
			return "", err
		}
		if _, err := strconv.ParseUint(c.Identifier, 10, 64); err != nil {
			return "", fmt.Errorf("invalid SRT identifier")
		}
		text := strings.ReplaceAll(strings.ReplaceAll(c.Text, "\r\n", "\n"), "\r", "\n")
		for _, line := range strings.Split(text, "\n") {
			if strings.TrimSpace(line) == "" {
				return "", fmt.Errorf("cue %s: text must not be empty or contain blank lines", c.Identifier)
			}
		}
		fmt.Fprintf(&out, "%s\n%s --> %s\n%s\n\n", c.Identifier, FormatTime(c.Start), FormatTime(c.End), text)
	}
	return out.String(), nil
}
