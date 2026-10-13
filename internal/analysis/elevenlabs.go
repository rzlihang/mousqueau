package analysis

import (
	"bytes"
	"context"
	"mime/multipart"
	"mousqueau/internal/i18n"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
)

// ElevenLabs returns words with speaker IDs; consecutive words of one speaker
// are grouped into sentences.
type ElevenLabs struct {
	Key     string
	Model   string
	BaseURL string
	Client  *http.Client
}

type word struct {
	Text    string  `json:"text"`
	Start   float64 `json:"start"`
	End     float64 `json:"end"`
	Type    string  `json:"type"`
	Speaker string  `json:"speaker_id"`
}

func (p ElevenLabs) Transcribe(ctx context.Context, path string) ([]Segment, error) {
	const name = "ElevenLabs"
	if p.Key == "" {
		return nil, i18n.Errorf("%s needs credentials; add them in Settings", name)
	}
	audio, err := readAudio(path)
	if err != nil {
		return nil, err
	}
	base := p.BaseURL
	if base == "" {
		base = "https://api.elevenlabs.io"
	}
	model := p.Model
	if model == "" {
		model = "scribe_v2"
	}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for _, f := range [][2]string{{"model_id", model}, {"diarize", "true"}, {"language_code", "zh"}, {"tag_audio_events", "false"}, {"timestamps_granularity", "word"}} {
		if err := writer.WriteField(f[0], f[1]); err != nil {
			return nil, err
		}
	}
	part, err := writer.CreateFormFile("file", filepath.Base(path))
	if err != nil {
		return nil, err
	}
	if _, err := part.Write(audio); err != nil {
		return nil, err
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/v1/speech-to-text", &body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("xi-api-key", p.Key)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	var data struct {
		Words []word `json:"words"`
	}
	if err := fetchJSON(ctx, p.Client, req, name, &data); err != nil {
		return nil, err
	}
	return noSegments(sentences(data.Words))
}

// sentences groups words into segments that end where the speaker changes,
// after a pause of a second or more, or after sentence-ending punctuation.
func sentences(words []word) []Segment {
	var out []Segment
	var cur *Segment
	var text strings.Builder
	flush := func() {
		if cur != nil {
			if cur.Text = tidy(text.String()); cur.Text != "" {
				out = append(out, *cur)
			}
		}
		cur = nil
		text.Reset()
	}
	for _, w := range words {
		switch w.Type {
		case "spacing":
			if cur != nil {
				text.WriteString(w.Text)
			}
			continue
		case "audio_event":
			continue
		}
		speaker := speakerLetter(w.Speaker)
		if cur != nil && (speaker != cur.Speaker || w.Start-cur.End >= 1) {
			flush()
		}
		if cur == nil {
			cur = &Segment{Speaker: speaker, Start: w.Start}
		}
		text.WriteString(w.Text)
		cur.End = w.End
		if strings.ContainsAny(lastChar(w.Text), "。！？!?.…") {
			flush()
		}
	}
	flush()
	return out
}
func lastChar(s string) string {
	r := []rune(strings.TrimSpace(s))
	if len(r) == 0 {
		return ""
	}
	return string(r[len(r)-1])
}

// speakerLetter maps "speaker_0" to "A"; anything else is kept as given.
func speakerLetter(id string) string {
	if n, err := strconv.Atoi(strings.TrimPrefix(id, "speaker_")); err == nil && strings.HasPrefix(id, "speaker_") {
		return numbered(&n)
	}
	return id
}
func itoa(n int) string { return strconv.Itoa(n) }
