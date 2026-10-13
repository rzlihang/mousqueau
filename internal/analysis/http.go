package analysis

import (
	"context"
	"encoding/json"
	"io"
	"mousqueau/internal/i18n"
	"net/http"
	"os"
	"strings"
	"time"
	"unicode"
)

// pollInterval spaces status requests to providers that work asynchronously.
var pollInterval = 2 * time.Second

func client(c *http.Client) *http.Client {
	if c != nil {
		return c
	}
	return &http.Client{Timeout: 8 * time.Minute}
}

// readAudio loads the extracted range, which media.Extract keeps small.
func readAudio(path string) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	stat, err := file.Stat()
	if err != nil {
		return nil, err
	}
	if stat.Size() > MaxAudioBytes {
		return nil, i18n.Errorf("audio exceeds 24 MB; select a shorter range")
	}
	return io.ReadAll(file)
}

// send performs a request and reports failures without echoing response
// bodies, which may repeat request details.
func send(ctx context.Context, c *http.Client, req *http.Request, name string) (*http.Response, error) {
	resp, err := client(c).Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, i18n.Errorf("cannot reach %s; check your connection", name)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		resp.Body.Close()
		switch resp.StatusCode {
		case 401, 403:
			return nil, i18n.Errorf("%s rejected the credentials or model access (HTTP %d)", name, resp.StatusCode)
		case 429:
			return nil, i18n.Errorf("%s rate or quota limit reached; retry later", name)
		default:
			return nil, i18n.Errorf("%s transcription failed (HTTP %d)", name, resp.StatusCode)
		}
	}
	return resp, nil
}

// fetchJSON sends a request and decodes a bounded JSON response into v.
func fetchJSON(ctx context.Context, c *http.Client, req *http.Request, name string, v any) error {
	resp, err := send(ctx, c, req, name)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if err := json.NewDecoder(io.LimitReader(resp.Body, 8_000_000)).Decode(v); err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return i18n.Errorf("invalid response from %s: %w", name, err)
	}
	return nil
}

// providerError reports an error code a provider returned in a successful
// HTTP response; only a short code or message is kept.
func providerError(name, code string) error {
	code = strings.TrimSpace(code)
	if len(code) > 120 {
		code = code[:120] + "…"
	}
	if code == "" {
		code = "unknown"
	}
	return i18n.Errorf("%s reported an error: %s", name, code)
}

func pause(ctx context.Context) error {
	timer := time.NewTimer(pollInterval)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

// done ends a polling loop when the context is cancelled.
func done(ctx context.Context, err error) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	return err
}

func noSegments(segments []Segment) ([]Segment, error) {
	if len(segments) == 0 {
		return nil, i18n.Errorf("no speech segments returned for this range")
	}
	return segments, nil
}

// tidy trims text, collapses runs of spaces and drops the spaces some
// providers put between Chinese, Japanese or Korean words.
func tidy(text string) string {
	runes := []rune(strings.TrimSpace(text))
	out := make([]rune, 0, len(runes))
	for i := 0; i < len(runes); i++ {
		if unicode.IsSpace(runes[i]) {
			j := i
			for j < len(runes) && unicode.IsSpace(runes[j]) {
				j++
			}
			if len(out) > 0 && j < len(runes) && cjk(out[len(out)-1]) && cjk(runes[j]) {
				i = j - 1
				continue
			}
			out = append(out, ' ')
			i = j - 1
			continue
		}
		out = append(out, runes[i])
	}
	return string(out)
}
func cjk(r rune) bool {
	return unicode.In(r, unicode.Han, unicode.Hiragana, unicode.Katakana, unicode.Hangul) ||
		(r >= 0x3000 && r <= 0x303f) || (r >= 0xff00 && r <= 0xffef)
}
