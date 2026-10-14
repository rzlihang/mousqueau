package main

import (
	"mousqueau/internal/dictionary"
	"mousqueau/internal/i18n"
	"mousqueau/internal/media"
	"mousqueau/internal/subtitle"
	"os"
)

// DictionaryView is what the dictionary window and inspector show.
type DictionaryView struct {
	Entries  []dictionary.Entry `json:"entries"`
	ReadOnly bool               `json:"readOnly"`
	Error    string             `json:"error,omitempty"`
	Path     string             `json:"path,omitempty"`
}

func (s *EditorService) loadDictionary() {
	s.dictionary = dictionary.Empty()
	s.dictionaryRO = false
	s.dictionaryErr = ""
	path, err := dictionary.Path()
	if err != nil {
		s.dictionaryRO = true
		s.dictionaryErr = err.Error()
		return
	}
	s.dictionaryPath = path
	loaded := dictionary.Load(path)
	s.dictionary = loaded.Dict
	s.dictionaryRO = loaded.ReadOnly
	s.dictionaryErr = loaded.Error
}

func (s *EditorService) dictionaryViewLocked() DictionaryView {
	entries := append([]dictionary.Entry{}, s.dictionary.Entries...)
	return DictionaryView{
		Entries: entries, ReadOnly: s.dictionaryRO, Error: s.dictionaryErr, Path: s.dictionaryPath,
	}
}

// commitDictionaryLocked writes next first and only then replaces the live
// dictionary, so a failed save leaves matching and later saves unchanged.
func (s *EditorService) commitDictionaryLocked(next dictionary.Dictionary) error {
	if s.dictionaryPath != "" {
		if err := dictionary.Save(s.dictionaryPath, next, s.dictionaryRO); err != nil {
			return err
		}
		s.dictionaryErr = ""
	}
	s.dictionary = next
	return nil
}

func (s *EditorService) notifyDictionary() {
	if s.app != nil {
		s.app.Event.Emit("dictionary")
	}
}

func (s *EditorService) GetDictionary() DictionaryView {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.dictionaryViewLocked()
}

func (s *EditorService) SearchDictionary(query, category string) ([]dictionary.Entry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return dictionary.Search(s.dictionary, query, category), nil
}

func (s *EditorService) UpsertDictionaryEntry(entry dictionary.Entry) (DictionaryView, error) {
	s.mu.Lock()
	next, err := dictionary.Upsert(s.dictionary, entry)
	if err != nil {
		view := s.dictionaryViewLocked()
		s.mu.Unlock()
		return view, err
	}
	err = s.commitDictionaryLocked(next)
	view := s.dictionaryViewLocked()
	s.mu.Unlock()
	if err != nil {
		return view, err
	}
	s.notifyDictionary()
	return view, nil
}

func (s *EditorService) DeleteDictionaryEntry(id string) (DictionaryView, error) {
	s.mu.Lock()
	next, err := dictionary.Delete(s.dictionary, id)
	if err != nil {
		view := s.dictionaryViewLocked()
		s.mu.Unlock()
		return view, err
	}
	err = s.commitDictionaryLocked(next)
	view := s.dictionaryViewLocked()
	s.mu.Unlock()
	if err != nil {
		return view, err
	}
	s.notifyDictionary()
	return view, nil
}

func (s *EditorService) MatchText(text string) ([]dictionary.Match, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return dictionary.Find(s.dictionary, text), nil
}

func (s *EditorService) MatchProjectCues() ([]dictionary.CueMatches, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.project == nil {
		return nil, i18n.Errorf("import SRT subtitles first")
	}
	return dictionary.MatchCues(s.dictionary, s.project.State.Cues), nil
}

// CheckDictionary adds undoable dictionary suggestions for the open project.
func (s *EditorService) CheckDictionary() (Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.requireProject(); err != nil {
		return Snapshot{}, err
	}
	result := dictionary.Check(s.dictionary, s.project.State.Cues)
	if len(result.Suggestions) > 0 {
		s.project.AddAnalysis(result)
	}
	return s.snapshot(), nil
}

// FixCueFromDictionary builds and accepts a dictionary suggestion for one cue.
func (s *EditorService) FixCueFromDictionary(cueID string) (Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.requireProject(); err != nil {
		return Snapshot{}, err
	}
	var cues []subtitle.Cue
	for _, c := range s.project.State.Cues {
		if c.ID == cueID {
			cues = []subtitle.Cue{c}
			break
		}
	}
	if len(cues) == 0 {
		return Snapshot{}, i18n.Errorf("subtitle no longer exists")
	}
	result := dictionary.Check(s.dictionary, cues)
	if len(result.Suggestions) == 0 {
		return s.snapshot(), nil
	}
	s.project.AddAnalysis(result)
	if err := s.project.Decide(result.Suggestions[0].ID, "accepted"); err != nil {
		return Snapshot{}, err
	}
	return s.snapshot(), nil
}

func (s *EditorService) PreviewDictionaryImport() (dictionary.ImportPreview, error) {
	path, err := s.app.Dialog.OpenFile().SetTitle(i18n.T("User dictionary")).AddFilter(i18n.T("User dictionary"), "*.json").PromptForSingleSelection()
	if err != nil || path == "" {
		return dictionary.ImportPreview{}, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return dictionary.ImportPreview{}, err
	}
	incoming, err := dictionary.ParseImport(data)
	if err != nil {
		return dictionary.ImportPreview{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	preview := dictionary.PreviewImport(s.dictionary, incoming)
	s.importPreview = &preview
	return preview, nil
}

func (s *EditorService) ApplyDictionaryImport(replaceConflicts []string) (DictionaryView, error) {
	s.mu.Lock()
	if s.importPreview == nil {
		view := s.dictionaryViewLocked()
		s.mu.Unlock()
		return view, i18n.Errorf("preview a dictionary import first")
	}
	next, err := dictionary.ApplyImport(s.dictionary, *s.importPreview, replaceConflicts)
	if err != nil {
		view := s.dictionaryViewLocked()
		s.mu.Unlock()
		return view, err
	}
	if err = s.commitDictionaryLocked(next); err != nil {
		view := s.dictionaryViewLocked()
		s.mu.Unlock()
		return view, err
	}
	s.importPreview = nil
	view := s.dictionaryViewLocked()
	s.mu.Unlock()
	s.notifyDictionary()
	return view, nil
}

func (s *EditorService) ExportDictionary() (string, error) {
	path, err := s.app.Dialog.SaveFile().SetFilename("mousqueau-dictionary.json").AddFilter(i18n.T("User dictionary"), "*.json").PromptForSingleSelection()
	if err != nil || path == "" {
		return "", err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if !media.HasExtension(path, ".json") {
		path += ".json"
	}
	data, err := dictionary.ExportJSON(s.dictionary)
	if err != nil {
		return "", err
	}
	if err := media.SafeNewFile(path, data); err != nil {
		return "", err
	}
	return path, nil
}
