package media

import (
	"context"
	"fmt"
	"math"
	"mousqueau/internal/analysis"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

func ValidateRange(start, end float64) error {
	if math.IsNaN(start) || math.IsNaN(end) || math.IsInf(start, 0) || math.IsInf(end, 0) || start < 0 || end-start < 60 || end-start > 300 {
		return fmt.Errorf("select a 1–5 minute range with a nonnegative start")
	}
	return nil
}
func Extract(ctx context.Context, input string, start, end float64) (string, func(), error) {
	noop := func() {}
	if err := ValidateRange(start, end); err != nil {
		return "", noop, err
	}
	ffmpeg, ok := Tool("ffmpeg")
	if !ok {
		return "", noop, fmt.Errorf("FFmpeg was not found; install it or set its location in Settings")
	}
	stat, err := os.Stat(input)
	if err != nil || !stat.Mode().IsRegular() {
		return "", noop, fmt.Errorf("select an existing local video or audio file")
	}
	dir, err := os.MkdirTemp("", "mousqueau-audio-*")
	if err != nil {
		return "", noop, err
	}
	cleanup := func() { _ = os.RemoveAll(dir) }
	path := filepath.Join(dir, "range.m4a")
	cmd := command(ctx, ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-ss", strconv.FormatFloat(start, 'f', 3, 64), "-i", input, "-t", strconv.FormatFloat(end-start, 'f', 3, 64), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "aac", "-b:a", "64k", "-y", path)
	if err := cmd.Run(); err != nil {
		cleanup()
		if ctx.Err() != nil {
			return "", noop, ctx.Err()
		}
		return "", noop, fmt.Errorf("FFmpeg could not extract audio; check media format and selected range")
	}
	info, err := os.Stat(path)
	if err != nil {
		cleanup()
		return "", noop, err
	}
	if info.Size() == 0 || info.Size() > analysis.MaxAudioBytes {
		cleanup()
		return "", noop, fmt.Errorf("extracted audio is empty or exceeds the 24 MB upload limit")
	}
	return path, cleanup, nil
}
func SamePath(a, b string) bool {
	aa, _ := filepath.Abs(a)
	bb, _ := filepath.Abs(b)
	if aa == bb {
		return true
	}
	sa, ea := os.Stat(a)
	sb, eb := os.Stat(b)
	return ea == nil && eb == nil && os.SameFile(sa, sb)
}
func SafeNewFile(path string, data []byte) error {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		if os.IsExist(err) {
			return fmt.Errorf("destination already exists; choose a new filename to preserve original files")
		}
		return err
	}
	_, err = file.Write(data)
	closeErr := file.Close()
	if err != nil {
		_ = os.Remove(path)
		return err
	}
	if closeErr != nil {
		_ = os.Remove(path)
		return closeErr
	}
	return nil
}
func HasExtension(path string, extensions ...string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	for _, e := range extensions {
		if ext == e {
			return true
		}
	}
	return false
}
