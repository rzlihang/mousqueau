package dictionary

import (
	"encoding/json"
	"mousqueau/internal/i18n"
	"slices"
	"strings"
)

// ImportAction describes what will happen to one incoming entry.
type ImportAction struct {
	Action        string `json:"action"` // add | merge | conflict | skip
	Incoming      Entry  `json:"incoming"`
	ExistingID    string `json:"existingId,omitempty"`
	Existing      *Entry `json:"existing,omitempty"`
	Merged        *Entry `json:"merged,omitempty"`
	ConflictReason string `json:"conflictReason,omitempty"`
}

// ImportPreview summarizes a JSON import before it is applied.
type ImportPreview struct {
	Actions []ImportAction `json:"actions"`
	Add     int            `json:"add"`
	Merge   int            `json:"merge"`
	Conflict int           `json:"conflict"`
	Skip    int            `json:"skip"`
}

// ParseImport decodes a dictionary JSON document.
func ParseImport(data []byte) (Dictionary, error) {
	var d Dictionary
	if err := json.Unmarshal(data, &d); err != nil {
		return Dictionary{}, i18n.Errorf("invalid dictionary JSON: %w", err)
	}
	if d.Version != 0 && d.Version != Version {
		return Dictionary{}, i18n.Errorf("unsupported dictionary version %d", d.Version)
	}
	if d.Entries == nil {
		d.Entries = []Entry{}
	}
	for i := range d.Entries {
		d.Entries[i] = Normalize(d.Entries[i])
		if d.Entries[i].ID == "" {
			d.Entries[i].ID = NewID()
		}
	}
	if err := Validate(d); err != nil {
		return Dictionary{}, err
	}
	return d, nil
}

func keyOf(e Entry) string {
	return e.Category + "\x00" + strings.TrimSpace(e.Canonical)
}

// PreviewImport matches incoming entries to the current dictionary.
func PreviewImport(current, incoming Dictionary) ImportPreview {
	byKey := map[string]Entry{}
	for _, e := range current.Entries {
		byKey[keyOf(e)] = e
	}
	preview := ImportPreview{Actions: []ImportAction{}}
	for _, in := range incoming.Entries {
		in = Normalize(in)
		existing, ok := byKey[keyOf(in)]
		if !ok {
			preview.Actions = append(preview.Actions, ImportAction{Action: "add", Incoming: in})
			preview.Add++
			continue
		}
		merged := mergeEntries(existing, in)
		trial := current
		trial.Entries = slices.Clone(current.Entries)
		for i, e := range trial.Entries {
			if e.ID == existing.ID {
				trial.Entries[i] = merged
				break
			}
		}
		if err := Validate(trial); err != nil {
			ex := existing
			preview.Actions = append(preview.Actions, ImportAction{
				Action: "conflict", Incoming: in, ExistingID: existing.ID, Existing: &ex,
				ConflictReason: err.Error(),
			})
			preview.Conflict++
			continue
		}
		if sameContent(existing, merged) {
			ex := existing
			preview.Actions = append(preview.Actions, ImportAction{
				Action: "skip", Incoming: in, ExistingID: existing.ID, Existing: &ex,
			})
			preview.Skip++
			continue
		}
		ex, m := existing, merged
		preview.Actions = append(preview.Actions, ImportAction{
			Action: "merge", Incoming: in, ExistingID: existing.ID, Existing: &ex, Merged: &m,
		})
		preview.Merge++
	}
	return preview
}

// ApplyImport applies non-conflict actions. Conflicts are skipped unless
// replaceConflicts lists the existing entry IDs to overwrite with incoming.
func ApplyImport(current Dictionary, preview ImportPreview, replaceConflicts []string) (Dictionary, error) {
	replace := map[string]bool{}
	for _, id := range replaceConflicts {
		replace[id] = true
	}
	next := current
	next.Entries = slices.Clone(current.Entries)
	for _, a := range preview.Actions {
		switch a.Action {
		case "add":
			e := a.Incoming
			if e.ID == "" || idTaken(next, e.ID) {
				e.ID = NewID()
			}
			e = Normalize(e)
			next.Entries = append(next.Entries, e)
		case "merge":
			if a.Merged == nil {
				continue
			}
			for i, e := range next.Entries {
				if e.ID == a.ExistingID {
					next.Entries[i] = Normalize(*a.Merged)
					break
				}
			}
		case "conflict":
			if a.ExistingID == "" || !replace[a.ExistingID] {
				continue
			}
			for i, e := range next.Entries {
				if e.ID == a.ExistingID {
					in := Normalize(a.Incoming)
					in.ID = e.ID
					next.Entries[i] = in
					break
				}
			}
		}
	}
	if err := Validate(next); err != nil {
		return current, err
	}
	return next, nil
}

func idTaken(d Dictionary, id string) bool {
	for _, e := range d.Entries {
		if e.ID == id {
			return true
		}
	}
	return false
}

func mergeEntries(existing, incoming Entry) Entry {
	out := existing
	out.Variants = union(existing.Variants, incoming.Variants)
	out.Misspellings = union(existing.Misspellings, incoming.Misspellings)
	out.Original = union(existing.Original, incoming.Original)
	if out.Note == "" {
		out.Note = incoming.Note
	}
	if out.PersonID == "" {
		out.PersonID = incoming.PersonID
	}
	if incoming.Disabled {
		out.Disabled = true
	}
	return Normalize(out)
}

func union(a, b []string) []string {
	return cleanList(append(slices.Clone(a), b...))
}

func sameContent(a, b Entry) bool {
	return a.Canonical == b.Canonical &&
		a.Category == b.Category &&
		a.PersonID == b.PersonID &&
		a.Note == b.Note &&
		a.Disabled == b.Disabled &&
		a.CaseSensitive == b.CaseSensitive &&
		slices.Equal(a.Variants, b.Variants) &&
		slices.Equal(a.Misspellings, b.Misspellings) &&
		slices.Equal(a.Original, b.Original)
}

// ExportJSON renders the dictionary for download.
func ExportJSON(d Dictionary) ([]byte, error) {
	d.Version = Version
	if d.Entries == nil {
		d.Entries = []Entry{}
	}
	return json.MarshalIndent(d, "", "  ")
}
