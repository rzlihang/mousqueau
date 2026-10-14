package dictionary

import (
	"fmt"
	"mousqueau/internal/analysis"
	"mousqueau/internal/subtitle"
	"sort"
	"strings"
	"unicode"
)

// Match is one glossary hit inside a string, with Unicode code-point offsets.
type Match struct {
	EntryID    string `json:"entryId"`
	Canonical  string `json:"canonical"`
	Category   string `json:"category"`
	Kind       string `json:"kind"` // canonical | variant | misspelled
	Text       string `json:"text"`
	Start      int    `json:"start"`
	End        int    `json:"end"`
	Note       string `json:"note,omitempty"`
	PersonID   string `json:"personId,omitempty"`
	PersonName string `json:"personName,omitempty"`
}

// CueMatches groups hits for one subtitle cue.
type CueMatches struct {
	CueID   string  `json:"cueId"`
	Matches []Match `json:"matches"`
}

type needle struct {
	runes     []rune
	folded    []rune
	entry     Entry
	kind      string
	sensitive bool
}

// Find reports non-overlapping hits. Correct forms (canonical/variants) claim
// spans first; misspellings only match in the remaining gaps. Longer needles win.
func Find(d Dictionary, text string) []Match {
	people := map[string]string{}
	for _, e := range d.Entries {
		if e.Category == CategoryPerson {
			people[e.ID] = e.Canonical
		}
	}
	ok, bad := needles(d)
	src := []rune(text)
	claimed := make([]bool, len(src))
	var matches []Match
	take := func(list []needle) {
		type hit struct {
			n     needle
			start int
			end   int
		}
		var hits []hit
		for _, n := range list {
			if len(n.runes) == 0 {
				continue
			}
			for start := 0; start <= len(src)-len(n.runes); {
				if matchAt(src, start, n) {
					end := start + len(n.runes)
					overlap := false
					for i := start; i < end; i++ {
						if claimed[i] {
							overlap = true
							break
						}
					}
					if !overlap {
						hits = append(hits, hit{n, start, end})
					}
					start = end
					continue
				}
				start++
			}
		}
		sort.SliceStable(hits, func(i, j int) bool {
			li, lj := hits[i].end-hits[i].start, hits[j].end-hits[j].start
			if li != lj {
				return li > lj
			}
			return hits[i].start < hits[j].start
		})
		for _, h := range hits {
			overlap := false
			for i := h.start; i < h.end; i++ {
				if claimed[i] {
					overlap = true
					break
				}
			}
			if overlap {
				continue
			}
			for i := h.start; i < h.end; i++ {
				claimed[i] = true
			}
			e := h.n.entry
			matches = append(matches, Match{
				EntryID:    e.ID,
				Canonical:  e.Canonical,
				Category:   e.Category,
				Kind:       h.n.kind,
				Text:       string(src[h.start:h.end]),
				Start:      h.start,
				End:        h.end,
				Note:       e.Note,
				PersonID:   e.PersonID,
				PersonName: people[e.PersonID],
			})
		}
	}
	take(ok)
	take(bad)
	sort.SliceStable(matches, func(i, j int) bool { return matches[i].Start < matches[j].Start })
	return matches
}

func needles(d Dictionary) (ok, bad []needle) {
	for _, e := range d.Entries {
		if e.Disabled {
			continue
		}
		add := func(s, kind string, into *[]needle) {
			s = strings.TrimSpace(s)
			if s == "" {
				return
			}
			r := []rune(s)
			*into = append(*into, needle{
				runes: r, folded: foldRunes(r, e.CaseSensitive),
				entry: e, kind: kind, sensitive: e.CaseSensitive,
			})
		}
		add(e.Canonical, KindCanonical, &ok)
		for _, v := range e.Variants {
			add(v, KindVariant, &ok)
		}
		for _, m := range e.Misspellings {
			add(m, KindMisspelled, &bad)
		}
	}
	return ok, bad
}

func matchAt(src []rune, start int, n needle) bool {
	if start+len(n.runes) > len(src) {
		return false
	}
	for i, want := range n.folded {
		got := foldRune(src[start+i], n.sensitive)
		if got != want {
			return false
		}
	}
	return true
}

func foldRunes(r []rune, sensitive bool) []rune {
	out := make([]rune, len(r))
	for i, c := range r {
		out[i] = foldRune(c, sensitive)
	}
	return out
}

// foldKey normalizes a spelling for conflict detection.
func foldKey(s string, sensitive bool) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	return string(foldRunes([]rune(s), sensitive))
}

func foldRune(r rune, sensitive bool) rune {
	// Fullwidth ASCII letters/digits → halfwidth.
	if r >= 0xff01 && r <= 0xff5e {
		r = r - 0xfee0
	}
	if !sensitive && unicode.IsLetter(r) {
		r = unicode.ToLower(r)
	}
	return r
}

// Check builds one pending dictionary suggestion per cue that has misspellings.
// SpeakerIDs and Review are copied from the cue so accepting only changes text.
func Check(d Dictionary, cues []subtitle.Cue) analysis.Result {
	result := analysis.Result{Suggestions: []analysis.Suggestion{}}
	for _, c := range cues {
		matches := Find(d, c.Text)
		var bad []Match
		for _, m := range matches {
			if m.Kind == KindMisspelled {
				bad = append(bad, m)
			}
		}
		if len(bad) == 0 {
			continue
		}
		proposed, reason := rewrite(c.Text, bad)
		if proposed == c.Text {
			continue
		}
		speakers := append([]string{}, c.SpeakerIDs...)
		if speakers == nil {
			speakers = []string{}
		}
		result.Suggestions = append(result.Suggestions, analysis.Suggestion{
			ID:         "suggestion-dictionary-" + c.ID,
			CueID:      c.ID,
			Original:   c.Text,
			Proposed:   proposed,
			SpeakerIDs: speakers,
			Review:     c.Review,
			Reason:     reason,
			Status:     "pending",
			Source:     analysis.SourceDictionary,
		})
	}
	return result
}

func rewrite(text string, bad []Match) (string, string) {
	src := []rune(text)
	sort.SliceStable(bad, func(i, j int) bool { return bad[i].Start < bad[j].Start })
	var out []rune
	var parts []string
	cursor := 0
	for _, m := range bad {
		if m.Start < cursor || m.End > len(src) {
			continue
		}
		out = append(out, src[cursor:m.Start]...)
		out = append(out, []rune(m.Canonical)...)
		parts = append(parts, fmt.Sprintf("“%s” → “%s”", m.Text, m.Canonical))
		cursor = m.End
	}
	out = append(out, src[cursor:]...)
	reason := "Dictionary: " + strings.Join(parts, "; ")
	return string(out), reason
}

// MatchCues runs Find for every cue (for list highlighting).
func MatchCues(d Dictionary, cues []subtitle.Cue) []CueMatches {
	out := make([]CueMatches, 0, len(cues))
	for _, c := range cues {
		m := Find(d, c.Text)
		if len(m) == 0 {
			continue
		}
		out = append(out, CueMatches{CueID: c.ID, Matches: m})
	}
	return out
}

// Search filters entries by substring against canonical, variants, misspellings and originals.
func Search(d Dictionary, query, category string) []Entry {
	q := strings.TrimSpace(strings.ToLower(query))
	out := []Entry{}
	for _, e := range d.Entries {
		if category != "" && category != "all" && e.Category != category {
			continue
		}
		if q == "" {
			out = append(out, e)
			continue
		}
		hay := []string{e.Canonical, e.Note}
		hay = append(hay, e.Variants...)
		hay = append(hay, e.Misspellings...)
		hay = append(hay, e.Original...)
		for _, h := range hay {
			if strings.Contains(strings.ToLower(h), q) {
				out = append(out, e)
				break
			}
		}
	}
	return out
}
