package main

import (
	"crypto/sha256"
	"encoding/json"
	"mousqueau/internal/i18n"
	"mousqueau/internal/project"
	"os"
	"time"
)

// Unsaved work is kept in a recovery file beside the settings: the project
// as it stands, history included, written a moment after each change and
// removed once the project is saved. After a crash, or a quit without saving,
// the next launch offers it back.

// recoveryDelay gathers a burst of edits into one write.
const recoveryDelay = 1500 * time.Millisecond

// Recovery describes the recovery file left by an earlier session.
type Recovery struct {
	Available bool   `json:"available"`
	SavedAt   string `json:"savedAt"` // RFC 3339
	Cues      int    `json:"cues"`
}

// trackRecoveryLocked takes the encoded project after anything that may have
// changed it. A project equal to the last one opened or saved needs no
// recovery file.
func (s *EditorService) trackRecoveryLocked(data []byte) {
	if s.recoveryPath == "" || s.recoveryHeld {
		return
	}
	sum := sha256.Sum256(data)
	if s.cleanSet && sum == s.cleanSum {
		data, sum = nil, [sha256.Size]byte{}
	}
	if s.recoverySet && sum == s.recoverySum {
		return
	}
	s.recoverySet, s.recoverySum, s.recoveryPending, s.recoveryDue = true, sum, data, true
	if s.recoveryTimer == nil {
		s.recoveryTimer = time.AfterFunc(recoveryDelay, s.flushRecovery)
	}
}

// markCleanLocked records the project as opened or saved: until it changes
// again there is nothing to recover.
func (s *EditorService) markCleanLocked() {
	if s.project == nil {
		return
	}
	data, err := json.Marshal(s.project)
	if err != nil {
		return
	}
	s.cleanSet, s.cleanSum = true, sha256.Sum256(data)
	s.trackRecoveryLocked(data)
}

// flushRecovery writes or removes the recovery file. recoveryMu is taken
// first so that writes reach the disk in the order they were asked for.
func (s *EditorService) flushRecovery() {
	s.recoveryMu.Lock()
	defer s.recoveryMu.Unlock()
	s.mu.Lock()
	data, due, path := s.recoveryPending, s.recoveryDue, s.recoveryPath
	s.recoveryPending, s.recoveryDue = nil, false
	if s.recoveryTimer != nil {
		s.recoveryTimer.Stop()
		s.recoveryTimer = nil
	}
	s.mu.Unlock()
	if !due {
		return
	}
	if data == nil {
		_ = os.Remove(path)
		return
	}
	// A failed write must not interrupt editing; the next change tries again.
	if err := project.WriteRecovery(path, data); err != nil {
		s.mu.Lock()
		s.recoverySet = false
		s.mu.Unlock()
	}
}

// RecoveryInfo reports the recovery file an earlier session left, which the
// editor offers once at launch. Until RestoreRecovery or DiscardRecovery
// answers, this session leaves the file alone.
func (s *EditorService) RecoveryInfo() Recovery {
	s.recoveryMu.Lock()
	defer s.recoveryMu.Unlock()
	s.mu.Lock()
	path, held := s.recoveryPath, s.recoveryHeld
	s.mu.Unlock()
	if path == "" || !held {
		return Recovery{}
	}
	p, when, err := project.ReadRecovery(path)
	if err != nil || p == nil {
		// Nothing usable to offer: let this session's work take the file.
		s.mu.Lock()
		s.recoveryHeld = false
		s.mu.Unlock()
		return Recovery{}
	}
	return Recovery{Available: true, SavedAt: when.Format(time.RFC3339), Cues: len(p.State.Cues)}
}

// RestoreRecovery opens the recovered project. It stays unsaved, so its
// recovery file remains until the project is saved.
func (s *EditorService) RestoreRecovery() (Snapshot, error) {
	s.recoveryMu.Lock()
	defer s.recoveryMu.Unlock()
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.ready(); err != nil {
		return Snapshot{}, err
	}
	p, _, err := project.ReadRecovery(s.recoveryPath)
	if err != nil {
		return Snapshot{}, err
	}
	if p == nil {
		return Snapshot{}, i18n.Errorf("there is no unsaved work to restore")
	}
	s.project = p
	s.mediaPath = p.VideoPath
	s.mediaRevision++
	s.recoveryHeld, s.cleanSet = false, false
	// The file already holds this project.
	if data, err := json.Marshal(p); err == nil {
		s.recoverySet, s.recoverySum = true, sha256.Sum256(data)
	}
	return s.snapshot(), nil
}

// DiscardRecovery deletes the recovery file an earlier session left.
func (s *EditorService) DiscardRecovery() error {
	s.recoveryMu.Lock()
	defer s.recoveryMu.Unlock()
	s.mu.Lock()
	path, held := s.recoveryPath, s.recoveryHeld
	s.recoveryHeld = false
	// The open project, if any, is tracked from here on.
	if held && s.project != nil {
		if data, err := json.Marshal(s.project); err == nil {
			s.trackRecoveryLocked(data)
		}
	}
	s.mu.Unlock()
	if path == "" || !held {
		return nil
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
