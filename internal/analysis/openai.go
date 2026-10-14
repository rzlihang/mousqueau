package analysis

import (
	"bytes"
	"context"
	"mime/multipart"
	"mousqueau/internal/i18n"
	"net/http"
	"path/filepath"
	"strings"
)

const MaxAudioBytes int64 = 24_000_000 // conservative margin below the 25 MB API limit
// Provider can later be extended with a separate known-speaker reference capability.
type Provider interface {
	Transcribe(context.Context, string) ([]Segment, error)
}

// OpenAI also serves OpenAI-compatible services: Endpoint is then the
// service's transcription URL and Name what errors call it.
type OpenAI struct {
	Key      string
	Endpoint string
	Model    string
	Name     string
	Client   *http.Client
}

func (p OpenAI) Transcribe(ctx context.Context, path string) ([]Segment, error) {
	name := p.Name
	if name == "" {
		name = "OpenAI"
	}
	if strings.TrimSpace(p.Key) == "" && p.Endpoint == "" {
		return nil, i18n.Errorf("%s needs credentials; add them in Settings", name)
	}
	audio, err := readAudio(path)
	if err != nil {
		return nil, err
	}
	model := p.Model
	if model == "" {
		model = "gpt-4o-transcribe-diarize"
	}
	// Only the diarizing models label speakers; others return timed segments
	// whose speaker stays unknown.
	fields := map[string]string{"model": model, "response_format": "verbose_json", "language": "zh"}
	if strings.Contains(model, "diarize") {
		fields["response_format"] = "diarized_json"
		fields["chunking_strategy"] = "auto"
	} else {
		fields["timestamp_granularities[]"] = "segment"
	}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, value := range fields {
		if err := writer.WriteField(key, value); err != nil {
			return nil, err
		}
	}
	part, err := writer.CreateFormFile("file", filepath.Base(path))
	if err != nil {
		return nil, err
	}
	if _, err = part.Write(audio); err != nil {
		return nil, err
	}
	if err = writer.Close(); err != nil {
		return nil, err
	}
	endpoint := p.Endpoint
	if endpoint == "" {
		endpoint = "https://api.openai.com/v1/audio/transcriptions"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, &body)
	if err != nil {
		return nil, err
	}
	if p.Key != "" {
		req.Header.Set("Authorization", "Bearer "+p.Key)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	// verbose_json numbers its segments, so their IDs are not kept.
	var data struct {
		Segments []struct {
			Speaker string  `json:"speaker"`
			Start   float64 `json:"start"`
			End     float64 `json:"end"`
			Text    string  `json:"text"`
		} `json:"segments"`
	}
	if err := fetchJSON(ctx, p.Client, req, name, &data); err != nil {
		return nil, err
	}
	segments := make([]Segment, 0, len(data.Segments))
	for _, s := range data.Segments {
		segments = append(segments, Segment{Speaker: s.Speaker, Start: s.Start, End: s.End, Text: tidy(s.Text)})
	}
	return noSegments(segments)
}
