package media

import (
	"bytes"
	"context"
	"encoding/binary"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestReadPeaksKeepsLoudestMagnitudePerWindow(t *testing.T) {
	var buf bytes.Buffer
	for _, v := range []int16{0, 100, -32768, 5, 16384, -1, 7} {
		_ = binary.Write(&buf, binary.LittleEndian, v)
	}
	peaks, err := readPeaks(&buf, 3)
	if err != nil {
		t.Fatal(err)
	}
	// Windows: {0,100,-32768} {5,16384,-1} {7}; a trailing partial window still counts.
	if len(peaks) != 3 || peaks[0] != 100 || peaks[1] != 50 || peaks[2] != 0 {
		t.Fatalf("unexpected peaks %v", peaks)
	}
}

func TestFFmpegPeaksAndCancel(t *testing.T) {
	if !Dependency("ffmpeg") {
		t.Skip("FFmpeg missing")
	}
	path := filepath.Join(t.TempDir(), "input.wav")
	// One second of tone, one second of silence.
	if err := exec.Command("ffmpeg", "-nostdin", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-af", "apad=pad_dur=1", "-y", path).Run(); err != nil {
		t.Fatal(err)
	}
	peaks, err := Peaks(context.Background(), path)
	if err != nil {
		t.Fatal(err)
	}
	if len(peaks) < 2*PeaksPerSecond-2 || len(peaks) > 2*PeaksPerSecond+2 {
		t.Fatalf("expected about two seconds of peaks, got %d", len(peaks))
	}
	if peaks[PeaksPerSecond/2] < 5 || peaks[len(peaks)-PeaksPerSecond/2] != 0 {
		t.Fatalf("tone and silence not distinguished: %d %d", peaks[PeaksPerSecond/2], peaks[len(peaks)-PeaksPerSecond/2])
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := Peaks(ctx, path); err == nil {
		t.Fatal("cancel ignored")
	}
}
