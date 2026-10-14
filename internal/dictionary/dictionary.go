// Package dictionary stores a global user glossary for subtitle proofreading.
// It does not depend on Wails and never mutates subtitle cues directly.
package dictionary

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"mousqueau/internal/i18n"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	Version             = 1
	MinMisspellingRunes = 2

	CategoryPerson      = "person"
	CategoryNickname    = "nickname"
	CategoryTerm        = "term"
	CategoryCatchphrase = "catchphrase"
	CategoryOther       = "other"

	KindCanonical  = "canonical"
	KindVariant    = "variant"
	KindMisspelled = "misspelled"
)

var categories = []string{
	CategoryPerson, CategoryNickname, CategoryTerm, CategoryCatchphrase, CategoryOther,
}

// Entry is one glossary item. Nicknames may point at a person via PersonID.
type Entry struct {
	ID            string    `json:"id"`
	Canonical     string    `json:"canonical"`
	Category      string    `json:"category"`
	Variants      []string  `json:"variants"`
	Misspellings  []string  `json:"misspellings"`
	Original      []string  `json:"original"`
	PersonID      string    `json:"personId,omitempty"`
	Note          string    `json:"note,omitempty"`
	CaseSensitive bool      `json:"caseSensitive,omitempty"`
	Disabled      bool      `json:"disabled,omitempty"`
	UpdatedAt     time.Time `json:"updatedAt,omitzero"`
}

// Dictionary is the on-disk document.
type Dictionary struct {
	Version int     `json:"version"`
	Entries []Entry `json:"entries"`
}

// LoadResult reports whether the file may be overwritten.
type LoadResult struct {
	Dict     Dictionary
	ReadOnly bool
	Path     string
	Error    string // non-empty when ReadOnly because of damage or unsupported version
}

// Path is the dictionary file beside settings.json.
func Path() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "Mousqueau", "dictionary.json"), nil
}

// Empty returns a writable empty dictionary.
func Empty() Dictionary {
	return Dictionary{Version: Version, Entries: []Entry{}}
}

// Load returns an empty dictionary when the file is missing. Damaged or
// unsupported content is returned read-only so Save will refuse to overwrite it.
func Load(path string) LoadResult {
	result := LoadResult{Dict: Empty(), Path: path}
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return result
	}
	if err != nil {
		result.ReadOnly = true
		result.Error = err.Error()
		return result
	}
	var d Dictionary
	if err := json.Unmarshal(data, &d); err != nil {
		result.ReadOnly = true
		result.Error = i18n.T("dictionary file is damaged and cannot be overwritten")
		return result
	}
	if d.Version != Version {
		result.ReadOnly = true
		result.Error = i18n.T("unsupported dictionary version %d", d.Version)
		result.Dict = d
		return result
	}
	if d.Entries == nil {
		d.Entries = []Entry{}
	}
	if err := Validate(d); err != nil {
		result.ReadOnly = true
		result.Error = err.Error()
		result.Dict = d
		return result
	}
	result.Dict = d
	return result
}

// Save writes atomically after copying the previous file aside. It refuses
// when readOnly is set so a damaged file is never replaced with empty data.
func Save(path string, d Dictionary, readOnly bool) error {
	if readOnly {
		return i18n.Errorf("dictionary is read-only because the file could not be loaded safely")
	}
	if err := Validate(d); err != nil {
		return err
	}
	d.Version = Version
	if d.Entries == nil {
		d.Entries = []Entry{}
	}
	data, err := json.MarshalIndent(d, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	// Finish the replacement before touching the live file, so a crash or a
	// failed write cannot leave dictionary.json missing.
	tmp, err := os.CreateTemp(filepath.Dir(path), "dictionary-*.json")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if old, err := os.ReadFile(path); err == nil {
		prev := filepath.Join(filepath.Dir(path), "dictionary.previous.json")
		_ = os.WriteFile(prev, old, 0600)
	}
	return os.Rename(tmp.Name(), path)
}

// Validate checks categories, lengths, person links and spelling conflicts.
func Validate(d Dictionary) error {
	if d.Version != 0 && d.Version != Version {
		return i18n.Errorf("unsupported dictionary version %d", d.Version)
	}
	ids := map[string]bool{}
	people := map[string]bool{}
	for i, e := range d.Entries {
		if e.ID == "" {
			return i18n.Errorf("dictionary entry %d: missing ID", i+1)
		}
		if ids[e.ID] {
			return i18n.Errorf("duplicate dictionary entry ID %q", e.ID)
		}
		ids[e.ID] = true
		if !slices.Contains(categories, e.Category) {
			return i18n.Errorf("dictionary entry %q: invalid category", e.Canonical)
		}
		if strings.TrimSpace(e.Canonical) == "" {
			return i18n.Errorf("dictionary entry %q: canonical form is required", e.ID)
		}
		if utf8.RuneCountInString(strings.TrimSpace(e.Canonical)) < 1 {
			return i18n.Errorf("dictionary entry %q: canonical form is required", e.ID)
		}
		for _, m := range e.Misspellings {
			if utf8.RuneCountInString(strings.TrimSpace(m)) < MinMisspellingRunes {
				return i18n.Errorf("misspellings must be at least %d characters", MinMisspellingRunes)
			}
		}
		if e.Category == CategoryPerson {
			people[e.ID] = true
		}
	}
	for _, e := range d.Entries {
		if e.PersonID == "" {
			continue
		}
		if e.Category != CategoryNickname {
			return i18n.Errorf("only nickname entries may link to a person")
		}
		if !people[e.PersonID] {
			return i18n.Errorf("nickname %q links to an unknown person", e.Canonical)
		}
	}
	return conflictError(d)
}

func conflictError(d Dictionary) error {
	type owner struct {
		id, role string
	}
	owned := map[string]owner{}
	claim := func(raw, id, role string, sensitive bool) error {
		key := foldKey(raw, sensitive)
		if key == "" {
			return nil
		}
		if prev, ok := owned[key]; ok && prev.id != id {
			if (prev.role == KindMisspelled) != (role == KindMisspelled) {
				return i18n.Errorf("spelling %q conflicts between dictionary entries", strings.TrimSpace(raw))
			}
		}
		if role != KindMisspelled {
			owned[key] = owner{id, role}
		} else if _, ok := owned[key]; !ok {
			owned[key] = owner{id, role}
		} else if owned[key].role != KindMisspelled && owned[key].id != id {
			return i18n.Errorf("spelling %q conflicts between dictionary entries", strings.TrimSpace(raw))
		}
		return nil
	}
	// First pass: all correct forms; second: misspellings must not collide with them.
	for _, e := range d.Entries {
		if e.Disabled {
			continue
		}
		if err := claim(e.Canonical, e.ID, KindCanonical, e.CaseSensitive); err != nil {
			return err
		}
		for _, v := range e.Variants {
			if err := claim(v, e.ID, KindVariant, e.CaseSensitive); err != nil {
				return err
			}
		}
	}
	for _, e := range d.Entries {
		if e.Disabled {
			continue
		}
		for _, m := range e.Misspellings {
			key := foldKey(m, e.CaseSensitive)
			if key == "" {
				continue
			}
			if prev, ok := owned[key]; ok && prev.role != KindMisspelled {
				return i18n.Errorf("spelling %q conflicts between dictionary entries", strings.TrimSpace(m))
			}
			owned[key] = owner{e.ID, KindMisspelled}
		}
	}
	return nil
}

// Normalize trims, drops empties and duplicates inside one entry.
func Normalize(e Entry) Entry {
	e.Canonical = strings.TrimSpace(e.Canonical)
	e.Category = strings.TrimSpace(e.Category)
	e.PersonID = strings.TrimSpace(e.PersonID)
	e.Note = strings.TrimSpace(e.Note)
	e.Variants = cleanList(e.Variants)
	e.Misspellings = cleanList(e.Misspellings)
	e.Original = cleanList(e.Original)
	e.UpdatedAt = time.Now().UTC()
	return e
}

func cleanList(values []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, v := range values {
		v = strings.TrimSpace(v)
		if v == "" || seen[v] {
			continue
		}
		seen[v] = true
		out = append(out, v)
	}
	return out
}

// NewID returns a stable-looking unique ID.
func NewID() string {
	return fmt.Sprintf("e-%d", time.Now().UnixNano())
}

// Upsert inserts or replaces an entry by ID after normalizing and validating.
func Upsert(d Dictionary, e Entry) (Dictionary, error) {
	e = Normalize(e)
	if e.ID == "" {
		e.ID = NewID()
	}
	next := d
	next.Entries = slices.Clone(d.Entries)
	found := false
	for i, existing := range next.Entries {
		if existing.ID == e.ID {
			next.Entries[i] = e
			found = true
			break
		}
	}
	if !found {
		next.Entries = append(next.Entries, e)
	}
	if err := Validate(next); err != nil {
		return d, err
	}
	return next, nil
}

// Delete removes an entry and clears nickname links that pointed at it.
func Delete(d Dictionary, id string) (Dictionary, error) {
	next := d
	next.Entries = []Entry{}
	for _, e := range d.Entries {
		if e.ID == id {
			continue
		}
		if e.PersonID == id {
			e.PersonID = ""
		}
		next.Entries = append(next.Entries, e)
	}
	if len(next.Entries) == len(d.Entries) {
		return d, i18n.Errorf("dictionary entry not found")
	}
	return next, nil
}

// Get returns an entry by ID.
func Get(d Dictionary, id string) (Entry, bool) {
	for _, e := range d.Entries {
		if e.ID == id {
			return e, true
		}
	}
	return Entry{}, false
}
