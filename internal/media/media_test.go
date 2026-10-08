package media

import (
	"context"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestRange(t *testing.T) {
	for _, r := range [][2]float64{{0, 60}, {120, 420}} {
		if ValidateRange(r[0], r[1]) != nil {
			t.Fatal(r)
		}
	}
	for _, r := range [][2]float64{{-1, 60}, {0, 59}, {0, 301}, {math.NaN(), 60}, {0, math.Inf(1)}} {
		if ValidateRange(r[0], r[1]) == nil {
			t.Fatal("invalid range accepted", r)
		}
	}
}
func TestProtectExistingFiles(t *testing.T) {
	path := filepath.Join(t.TempDir(), "source.srt")
	if err := SafeNewFile(path, []byte("original")); err != nil {
		t.Fatal(err)
	}
	if SafeNewFile(path, []byte("changed")) == nil {
		t.Fatal("overwrote existing file")
	}
	data, _ := os.ReadFile(path)
	if string(data) != "original" {
		t.Fatal("original changed")
	}
	link := filepath.Join(filepath.Dir(path), "link.srt")
	if err := os.Link(path, link); err == nil && !SamePath(path, link) {
		t.Fatal("hardlink not recognized")
	}
}
func TestYouTubeURL(t *testing.T) {
	for _, u := range []string{"https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30", "https://youtube.com/shorts/dQw4w9WgXcQ"} {
		if _, err := ValidateYouTube(u); err != nil {
			t.Fatal(err)
		}
	}
	for _, u := range []string{"http://youtube.com/watch?v=dQw4w9WgXcQ", "https://evil.com/watch?v=dQw4w9WgXcQ", "https://youtube.com/playlist?list=x", "https://youtube.com/watch?v=dQw4w9WgXcQ&list=x", "https://youtube.com/@channel", "https://user@youtube.com/watch?v=dQw4w9WgXcQ"} {
		if _, err := ValidateYouTube(u); err == nil {
			t.Fatal("invalid URL accepted", u)
		}
	}
}
func TestFFmpegExtractAndCancel(t *testing.T) {
	if !Dependency("ffmpeg") {
		t.Skip("FFmpeg missing")
	}
	path := filepath.Join(t.TempDir(), "input.wav")
	if err := exec.Command("ffmpeg", "-nostdin", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=61", "-y", path).Run(); err != nil {
		t.Fatal(err)
	}
	audio, cleanup, err := Extract(context.Background(), path, 0, 60)
	if err != nil {
		t.Fatal(err)
	}
	if stat, err := os.Stat(audio); err != nil || stat.Size() == 0 {
		t.Fatal("no audio produced")
	}
	cleanup()
	if _, err := os.Stat(audio); !os.IsNotExist(err) {
		t.Fatal("temporary audio leaked")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, clean, err := Extract(ctx, path, 0, 60)
	clean()
	if err == nil {
		t.Fatal("cancel ignored")
	}
}
