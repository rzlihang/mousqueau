package analysis

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"mousqueau/internal/i18n"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const MaxAudioBytes int64 = 24_000_000 // conservative margin below the 25 MB API limit
// Provider can later be extended with a separate known-speaker reference capability.
type Provider interface {
	Transcribe(context.Context, string) ([]Segment, error)
}
type OpenAI struct {
	Key      string
	Endpoint string
	Client   *http.Client
}

func (p OpenAI) Transcribe(ctx context.Context, path string) ([]Segment, error) {
	if strings.TrimSpace(p.Key) == "" {
		return nil, i18n.Errorf("set OPENAI_API_KEY in the desktop application's environment to analyze audio")
	}
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
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, value := range map[string]string{"model": "gpt-4o-transcribe-diarize", "response_format": "diarized_json", "chunking_strategy": "auto", "language": "zh"} {
		if err := writer.WriteField(key, value); err != nil {
			return nil, err
		}
	}
	part, err := writer.CreateFormFile("file", filepath.Base(path))
	if err != nil {
		return nil, err
	}
	if _, err = io.Copy(part, file); err != nil {
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
	req.Header.Set("Authorization", "Bearer "+p.Key)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	client := p.Client
	if client == nil {
		client = &http.Client{Timeout: 8 * time.Minute}
	}
	resp, err := client.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, i18n.Errorf("cannot reach OpenAI audio API; check your connection")
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// Do not echo provider bodies which may include sensitive request details.
		switch resp.StatusCode {
		case 401, 403:
			return nil, i18n.Errorf("OpenAI rejected credentials or model access (HTTP %d)", resp.StatusCode)
		case 429:
			return nil, i18n.Errorf("OpenAI rate or quota limit reached; retry later")
		default:
			return nil, i18n.Errorf("OpenAI transcription failed (HTTP %d)", resp.StatusCode)
		}
	}
	var data struct {
		Segments []Segment `json:"segments"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 8_000_000)).Decode(&data); err != nil {
		return nil, i18n.Errorf("invalid diarized_json response: %w", err)
	}
	if len(data.Segments) == 0 {
		return nil, i18n.Errorf("no speech segments returned for this range")
	}
	return data.Segments, nil
}
