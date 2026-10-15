package main

// awakeReason is what the system shows for the hold, as in macOS's
// `pmset -g assertions`.
const awakeReason = "Mousqueau is playing media"

// holdAwake keeps the display awake and the screen saver off until the
// returned release is called. Platforms fill it in; tests replace it.
var holdAwake = platformHoldAwake

// KeepAwake holds the display awake while media plays, since a web view's
// <video> does not do that by itself; false lets it sleep again.
func (s *EditorService) KeepAwake(on bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if on == (s.awakeRelease != nil) {
		return nil
	}
	if !on {
		s.awakeRelease()
		s.awakeRelease = nil
		return nil
	}
	release, err := holdAwake(awakeReason)
	if err != nil {
		return err
	}
	s.awakeRelease = release
	return nil
}
