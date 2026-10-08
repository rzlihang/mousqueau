package media

import (
	"bufio"
	"context"
	"encoding/binary"
	"errors"
	"io"
	"mousqueau/internal/i18n"
	"os"
	"strconv"
)

// PeaksPerSecond is the waveform resolution: one peak per 20 ms.
const PeaksPerSecond = 50

const peakSampleRate = 8000

// Peaks decodes the local file's audio with FFmpeg and returns the loudest
// absolute sample of each 1/PeaksPerSecond window, scaled to 0–100.
// Nothing leaves the machine; the decoded audio is never written to disk.
func Peaks(ctx context.Context, input string) ([]int, error) {
	ffmpeg, ok := Tool("ffmpeg")
	if !ok {
		return nil, i18n.Errorf("FFmpeg was not found; install it or set its location in Settings")
	}
	stat, err := os.Stat(input)
	if err != nil || !stat.Mode().IsRegular() {
		return nil, i18n.Errorf("select an existing local video or audio file")
	}
	cmd := command(ctx, ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-i", input, "-vn", "-ac", "1", "-ar", strconv.Itoa(peakSampleRate), "-f", "s16le", "-")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	peaks, readErr := readPeaks(bufio.NewReaderSize(stdout, 64*1024), peakSampleRate/PeaksPerSecond)
	waitErr := cmd.Wait()
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	if readErr != nil {
		return nil, readErr
	}
	if waitErr != nil {
		return nil, i18n.Errorf("FFmpeg could not decode audio for the waveform")
	}
	return peaks, nil
}

// readPeaks reads little-endian signed 16-bit mono samples and keeps the
// largest magnitude of every window, scaled to 0–100.
func readPeaks(r io.Reader, window int) ([]int, error) {
	peaks := []int{}
	buf := make([]byte, 2*window)
	for {
		n, err := io.ReadFull(r, buf)
		if n >= 2 {
			peak := 0
			for i := 0; i+1 < n; i += 2 {
				v := int(int16(binary.LittleEndian.Uint16(buf[i:])))
				if v < 0 {
					v = -v
				}
				if v > peak {
					peak = v
				}
			}
			peaks = append(peaks, (peak*100+16384)/32768)
		}
		if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
			return peaks, nil
		}
		if err != nil {
			return nil, err
		}
	}
}
