package subtitle

import (
	"mousqueau/internal/i18n"
	"regexp"
	"slices"
	"strings"
	"unicode"
)

// Line is one speaker's part of a cue where several people talk at once.
// A cue with lines shows them together, each after a dialogue dash.
type Line struct {
	Text       string   `json:"text"`
	SpeakerIDs []string `json:"speakerIds"`
}

// dialogueDash matches the dash, and the space after it, that starts a
// line of overlapping speech in an SRT file.
var dialogueDash = regexp.MustCompile(`^[-‐‑–—]\s*`)

// RenderLines writes lines the way SRT shows overlapping speech.
func RenderLines(lines []Line) string {
	out := make([]string, len(lines))
	for i, l := range lines {
		out[i] = "- " + l.Text
	}
	return strings.Join(out, "\n")
}

// SplitDialogue reads a cue body whose every line starts with a dialogue
// dash. It returns nil for anything else, including a single line.
func SplitDialogue(text string) []Line {
	rows := strings.Split(text, "\n")
	if len(rows) < 2 {
		return nil
	}
	lines := make([]Line, 0, len(rows))
	for _, row := range rows {
		row = strings.TrimSpace(row)
		if !dialogueDash.MatchString(row) {
			return nil
		}
		row = strings.TrimSpace(dialogueDash.ReplaceAllString(row, ""))
		if row == "" {
			return nil
		}
		lines = append(lines, Line{Text: row, SpeakerIDs: []string{}})
	}
	return lines
}

// Normalize makes a cue's text and speakers follow its lines. One line is
// an ordinary cue; two or more give the dashed text and every line's
// speakers.
func Normalize(c Cue) (Cue, error) {
	if len(c.Lines) == 0 {
		c.Lines = nil
		return c, nil
	}
	speakers := []string{}
	for i, l := range c.Lines {
		l.Text = strings.TrimSpace(l.Text)
		if l.Text == "" || strings.ContainsAny(l.Text, "\r\n") {
			return c, i18n.Errorf("cue %s: each speaker's line must be one line of text", c.Identifier)
		}
		if l.SpeakerIDs == nil {
			l.SpeakerIDs = []string{}
		}
		for _, s := range l.SpeakerIDs {
			if !slices.Contains(speakers, s) {
				speakers = append(speakers, s)
			}
		}
		c.Lines[i] = l
	}
	if len(c.Lines) == 1 {
		c.Text, c.SpeakerIDs, c.Lines = c.Lines[0].Text, c.Lines[0].SpeakerIDs, nil
		return c, nil
	}
	c.Text, c.SpeakerIDs = RenderLines(c.Lines), speakers
	return c, nil
}

// Retext keeps a cue's lines when new text still has one dashed line for
// each of them, carrying the speakers over; otherwise the lines are gone.
func Retext(lines []Line, text string) []Line {
	next := SplitDialogue(text)
	if len(next) != len(lines) {
		return nil
	}
	for i := range next {
		next[i].SpeakerIDs = slices.Clone(lines[i].SpeakerIDs)
	}
	return next
}

// AsLines gives a cue's lines, treating an ordinary cue as one line whose
// line breaks were only wrapping.
func AsLines(c Cue) []Line {
	if len(c.Lines) > 0 {
		return slices.Clone(c.Lines)
	}
	text := ""
	for _, row := range strings.Split(c.Text, "\n") {
		text = JoinText(text, row)
	}
	return []Line{{Text: strings.TrimSpace(text), SpeakerIDs: slices.Clone(c.SpeakerIDs)}}
}

// JoinText joins two subtitle texts with a space, or with nothing where
// either side of the join is CJK, which is written without spaces.
func JoinText(a, b string) string {
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
