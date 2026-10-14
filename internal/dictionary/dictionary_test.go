package dictionary

import (
	"encoding/json"
	"mousqueau/internal/analysis"
	"mousqueau/internal/subtitle"
	"os"
	"path/filepath"
	"testing"
)

func sample() Dictionary {
	return Dictionary{Version: 1, Entries: []Entry{
		{ID: "p1", Canonical: "佩可拉", Category: CategoryPerson, Variants: []string{"Pekora", "兔田佩可拉"}, Misspellings: []string{"佩克拉", "配可拉"}, Original: []string{"兔田ぺこら"}},
		{ID: "n1", Canonical: "佩可酱", Category: CategoryNickname, PersonID: "p1", Misspellings: []string{"佩克酱"}},
	}}
}

func TestValidateRejectsShortMisspellingAndConflicts(t *testing.T) {
	d := sample()
	d.Entries[0].Misspellings = append(d.Entries[0].Misspellings, "拉")
	if err := Validate(d); err == nil {
		t.Fatal("single-rune misspelling accepted")
	}
	d = sample()
	d.Entries = append(d.Entries, Entry{ID: "x", Canonical: "别的", Category: CategoryTerm, Misspellings: []string{"佩可拉"}})
	if err := Validate(d); err == nil {
		t.Fatal("misspelling colliding with canonical accepted")
	}
}

func TestFindPrefersCorrectFormsOverMisspellings(t *testing.T) {
	d := sample()
	// "可拉" as a misspelling of something else must not fire inside 佩可拉.
	d.Entries = append(d.Entries, Entry{ID: "t1", Canonical: "可拉酱", Category: CategoryTerm, Misspellings: []string{"可拉"}})
	matches := Find(d, "今天佩可拉来了，还有可拉")
	kinds := map[string]string{}
	for _, m := range matches {
		kinds[m.Text] = m.Kind
	}
	if kinds["佩可拉"] != KindCanonical {
		t.Fatalf("canonical not matched: %+v", matches)
	}
	if kinds["可拉"] != KindMisspelled {
		t.Fatalf("standalone misspelling not matched: %+v", matches)
	}
	for _, m := range matches {
		if m.Text == "可拉" && m.Start < 4 {
			t.Fatal("misspelling matched inside canonical")
		}
	}
}

func TestFindCaseAndFullwidth(t *testing.T) {
	d := sample()
	matches := Find(d, "看ＰＥＫＯＲＡ直播")
	if len(matches) != 1 || matches[0].Kind != KindVariant {
		t.Fatalf("fullwidth/case fold: %+v", matches)
	}
}

func TestCheckBuildsDictionarySuggestionOnlyChangingText(t *testing.T) {
	d := sample()
	cues := []subtitle.Cue{{ID: "cue-1", Identifier: "1", Start: 0, End: 1, Text: "佩克拉好强", SpeakerIDs: []string{"A"}, Review: true}}
	result := Check(d, cues)
	if len(result.Suggestions) != 1 {
		t.Fatalf("suggestions: %+v", result.Suggestions)
	}
	s := result.Suggestions[0]
	if s.Source != analysis.SourceDictionary || s.Proposed != "佩可拉好强" || s.Review != true || len(s.SpeakerIDs) != 1 || s.SpeakerIDs[0] != "A" {
		t.Fatalf("bad suggestion: %+v", s)
	}
	// Variants must not produce suggestions.
	cues[0].Text = "Pekora来了"
	if len(Check(d, cues).Suggestions) != 0 {
		t.Fatal("variant flagged for unification")
	}
}

func TestLoadSaveRoundTripAndDamagedReadOnly(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "dictionary.json")
	d := sample()
	if err := Save(path, d, false); err != nil {
		t.Fatal(err)
	}
	got := Load(path)
	if got.ReadOnly || len(got.Dict.Entries) != 2 {
		t.Fatalf("load: %+v", got)
	}
	// Previous backup after second save.
	d.Entries[0].Note = "updated"
	if err := Save(path, d, true); err == nil {
		t.Fatal("readonly save allowed")
	}
	if err := Save(path, d, false); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "dictionary.previous.json")); err != nil {
		t.Fatal("missing previous backup")
	}
	bad := filepath.Join(dir, "bad.json")
	if err := os.WriteFile(bad, []byte("{not json"), 0600); err != nil {
		t.Fatal(err)
	}
	damaged := Load(bad)
	if !damaged.ReadOnly || damaged.Error == "" {
		t.Fatal("damaged file should be read-only")
	}
	if err := Save(bad, Empty(), damaged.ReadOnly); err == nil {
		t.Fatal("overwrite damaged file")
	}
}

func TestImportPreviewAndApply(t *testing.T) {
	current := sample()
	incoming := Dictionary{Version: 1, Entries: []Entry{
		{Canonical: "佩可拉", Category: CategoryPerson, Misspellings: []string{"佩可啦"}},
		{Canonical: "米可", Category: CategoryPerson},
	}}
	preview := PreviewImport(current, incoming)
	if preview.Add != 1 || preview.Merge != 1 {
		t.Fatalf("preview counts: %+v", preview)
	}
	next, err := ApplyImport(current, preview, nil)
	if err != nil {
		t.Fatal(err)
	}
	e, ok := Get(next, "p1")
	if !ok || !contains(e.Misspellings, "佩可啦") || !contains(e.Misspellings, "佩克拉") {
		t.Fatalf("merge failed: %+v", e)
	}
	if _, ok := Get(next, incoming.Entries[1].ID); !ok {
		// New entry gets a new ID during apply when empty; find by canonical.
		found := false
		for _, x := range next.Entries {
			if x.Canonical == "米可" {
				found = true
			}
		}
		if !found {
			t.Fatal("add failed")
		}
	}
}

func TestImportRemapsNicknameOntoExistingPerson(t *testing.T) {
	current := Dictionary{Version: 1, Entries: []Entry{
		{ID: "local-pekora", Canonical: "佩可拉", Category: CategoryPerson},
	}}
	incoming := Dictionary{Version: 1, Entries: []Entry{
		{ID: "remote-pekora", Canonical: "佩可拉", Category: CategoryPerson, Misspellings: []string{"佩克拉"}},
		{ID: "remote-nick", Canonical: "佩可酱", Category: CategoryNickname, PersonID: "remote-pekora"},
	}}
	next, err := ApplyImport(current, PreviewImport(current, incoming), nil)
	if err != nil {
		t.Fatal(err)
	}
	person, ok := Get(next, "local-pekora")
	if !ok || !contains(person.Misspellings, "佩克拉") {
		t.Fatalf("person merge: %+v", person)
	}
	var nick Entry
	for _, e := range next.Entries {
		if e.Canonical == "佩可酱" {
			nick = e
		}
	}
	if nick.PersonID != "local-pekora" {
		t.Fatalf("nickname still points at the imported id: %+v", nick)
	}
}

func TestExportJSONRoundTrip(t *testing.T) {
	data, err := ExportJSON(sample())
	if err != nil {
		t.Fatal(err)
	}
	var d Dictionary
	if err := json.Unmarshal(data, &d); err != nil || Validate(d) != nil {
		t.Fatal(err)
	}
}

func contains(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}
