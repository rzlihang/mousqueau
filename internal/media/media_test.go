package media

import (
	"context"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
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
func TestWebURL(t *testing.T) {
	for in, want := range map[string]string{
		"https://youtu.be/dQw4w9WgXcQ":                     "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
		"https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
		"https://youtube.com/shorts/dQw4w9WgXcQ":           "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
		" https://vimeo.com/76979871#t=5 ":                 "https://vimeo.com/76979871",
		"https://www.bilibili.com/video/BV1xx411c7mD?p=2":  "https://www.bilibili.com/video/BV1xx411c7mD?p=2",
	} {
		if got, err := ValidateURL(in); err != nil || got != want {
			t.Fatalf("%q: %q %v", in, got, err)
		}
	}
	for _, u := range []string{"http://youtube.com/watch?v=dQw4w9WgXcQ", "file:///etc/passwd", "https://", "youtube.com/watch?v=dQw4w9WgXcQ", "https://youtube.com/playlist?list=x", "https://youtube.com/watch?v=dQw4w9WgXcQ&list=x", "https://youtube.com/@channel", "https://user:pw@example.com/video"} {
		if _, err := ValidateURL(u); err == nil {
			t.Fatal("invalid URL accepted", u)
		}
	}
}
func TestParseInfo(t *testing.T) {
	info, err := parseInfo([]byte(`{"id":"x","title":"T","extractor_key":"Youtube","webpage_url_domain":"www.youtube.com","duration":61.5,
		"subtitles":{"zh-TW":[{"ext":"vtt"},{"ext":"json3"}],"live_chat":[{"ext":"json"}]},
		"automatic_captions":{"en":[{"ext":"srt"},{"ext":"vtt"}]}}`))
	if err != nil || info.Site != "youtube.com" || info.Duration != 61.5 || len(info.Captions) != 2 {
		t.Fatalf("%+v %v", info, err)
	}
	if info.Captions[0].Language != "zh-TW" || info.Captions[0].Automatic || !info.Captions[1].Automatic {
		t.Fatalf("manual tracks first: %+v", info.Captions)
	}
	if info, _ := parseInfo([]byte(`{"extractor_key":"Vimeo"}`)); info.Site != "Vimeo" {
		t.Fatalf("no domain: %+v", info)
	}
	if info, _ := parseInfo([]byte(`{"extractor_key":"Generic"}`)); info.Site != "" {
		t.Fatalf("generic extractor shown: %+v", info)
	}
	if _, err := parseInfo([]byte(`{"_type":"playlist","entries":[]}`)); err == nil {
		t.Fatal("playlist accepted")
	}
}
func TestParseProgress(t *testing.T) {
	for line, want := range map[string]float64{
		progressPrefix + "50 200 NA":  0.25,
		progressPrefix + "50 NA 100":  0.5,
		progressPrefix + "300 200 NA": 1,
		progressPrefix + "50 NA NA":   -1,
		progressPrefix + "NA 200 NA":  -1,
	} {
		if got, ok := parseProgress(line); !ok || got != want {
			t.Errorf("%q: %v %v", line, got, ok)
		}
	}
	if _, ok := parseProgress("[download] 50%"); ok {
		t.Error("foreign line parsed")
	}
}
func TestFileName(t *testing.T) {
	for title, want := range map[string]string{
		"第 1 集: 開場 / Q&A?": "第 1 集_ 開場 _ Q&A_.mp4",
		"  ..  ":           "download.mp4",
		"a\nb":             "a_b.mp4",
	} {
		if got := FileName(title, ".mp4"); got != want {
			t.Errorf("%q: %q", title, got)
		}
	}
}

// A stand-in yt-dlp reports progress and writes the file it was asked for.
func fakeYTDLP(t *testing.T, body string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("shell stand-in is Unix-only")
	}
	dir := t.TempDir()
	for name, script := range map[string]string{
		"yt-dlp": "#!/bin/sh\n" + body,
		"ffmpeg": "#!/bin/sh\nexit 0\n",
	} {
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, []byte(script), 0700); err != nil {
			t.Fatal(err)
		}
		SetToolPath(name, path)
		t.Cleanup(func() { SetToolPath(name, "") })
	}
}

// The output template follows -o; the stand-in writes there with the
// extension yt-dlp would produce.
const writeOutput = `while [ "$1" != "-o" ]; do shift; done; out="$2"
echo "` + progressPrefix + `512 1024 NA"
echo "` + progressPrefix + `1024 1024 NA"
`

func TestDownloadMedia(t *testing.T) {
	fakeYTDLP(t, writeOutput+`printf video > "${out%.%(ext)s}.mp4"`+"\n")
	dest := filepath.Join(t.TempDir(), "clip.mp4")
	var seen []float64
	if err := DownloadMedia(context.Background(), "https://example.com/v", WebVideo, dest, func(f float64) { seen = append(seen, f) }); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(dest); string(data) != "video" || len(seen) != 2 || seen[1] != 1 {
		t.Fatalf("%q %v", data, seen)
	}
	if leftovers, _ := filepath.Glob(filepath.Join(filepath.Dir(dest), ".mousqueau-download-*")); len(leftovers) != 0 {
		t.Fatal("temporary folder left behind", leftovers)
	}
	// An existing file is never replaced.
	if err := DownloadMedia(context.Background(), "https://example.com/v", WebVideo, dest, nil); err == nil {
		t.Fatal("overwrote existing file")
	}
	if data, _ := os.ReadFile(dest); string(data) != "video" {
		t.Fatal("existing file changed")
	}
	if err := DownloadMedia(context.Background(), "https://example.com/v", WebAudio, filepath.Join(t.TempDir(), "a.mp4"), nil); err == nil {
		t.Fatal("audio accepted an .mp4 destination")
	}
}
func TestDownloadMediaFailureLeavesNothing(t *testing.T) {
	fakeYTDLP(t, "exit 1\n")
	dest := filepath.Join(t.TempDir(), "clip.m4a")
	if err := DownloadMedia(context.Background(), "https://example.com/v", WebAudio, dest, nil); err == nil {
		t.Fatal("failure not reported")
	}
	if entries, _ := os.ReadDir(filepath.Dir(dest)); len(entries) != 0 {
		t.Fatalf("left %v behind", entries)
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
