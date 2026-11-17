package project

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"time"
)

// WriteRecovery replaces the recovery file with data, an encoded project.
// The new content is written beside the file and renamed over it, so a crash
// while writing leaves the previous recovery file whole.
func WriteRecovery(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	temp, err := os.CreateTemp(filepath.Dir(path), ".recovery-*")
	if err != nil {
		return err
	}
	_, err = temp.Write(data)
	if closeErr := temp.Close(); err == nil {
		err = closeErr
	}
	if err == nil {
		err = os.Rename(temp.Name(), path)
	}
	if err != nil {
		_ = os.Remove(temp.Name())
	}
	return err
}

// ReadRecovery returns the project in the recovery file and when it was
// written, or nil when there is no file.
func ReadRecovery(path string) (*Project, time.Time, error) {
	stat, err := os.Stat(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, time.Time{}, nil
	}
	if err != nil {
		return nil, time.Time{}, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, time.Time{}, err
	}
	p, err := Decode(data)
	if err != nil {
		return nil, time.Time{}, err
	}
	return p, stat.ModTime(), nil
}
