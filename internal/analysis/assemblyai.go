package analysis

import (
	"bytes"
	"context"
	"encoding/json"
	"mousqueau/internal/i18n"
	"net/http"
	"time"
)

// AssemblyAI takes the audio as an upload, transcribes it asynchronously and
// labels utterances with speaker letters. Without a model the service picks
// its current default, falling back by language. The finished transcript is deleted
// from the service once it has been read.
type AssemblyAI struct {
	Key     string
	Model   string
	BaseURL string
	Client  *http.Client
}

func (p AssemblyAI) Transcribe(ctx context.Context, path string) ([]Segment, error) {
	const name = "AssemblyAI"
	if p.Key == "" {
		return nil, i18n.Errorf("%s needs credentials; add them in Settings", name)
	}
	audio, err := readAudio(path)
	if err != nil {
		return nil, err
	}
	base := p.BaseURL
	if base == "" {
		base = "https://api.assemblyai.com"
	}
	call := func(method, url string, body []byte, v any) error {
		req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", p.Key)
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		return fetchJSON(ctx, p.Client, req, name, v)
	}
	var upload struct {
		URL string `json:"upload_url"`
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/v2/upload", bytes.NewReader(audio))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", p.Key)
	req.Header.Set("Content-Type", "application/octet-stream")
	if err := fetchJSON(ctx, p.Client, req, name, &upload); err != nil {
		return nil, err
	}
	request := map[string]any{"audio_url": upload.URL, "speaker_labels": true, "language_code": "zh"}
	if p.Model != "" {
		request["speech_models"] = []string{p.Model}
	}
	body, _ := json.Marshal(request)
	type transcript struct {
		ID         string `json:"id"`
		Status     string `json:"status"`
		Error      string `json:"error"`
		Utterances []struct {
			Speaker string  `json:"speaker"`
			Start   float64 `json:"start"` // milliseconds
			End     float64 `json:"end"`
			Text    string  `json:"text"`
		} `json:"utterances"`
	}
	var job transcript
	if err := call(http.MethodPost, base+"/v2/transcript", body, &job); err != nil {
		return nil, err
	}
	if job.ID == "" {
		return nil, providerError(name, job.Error)
	}
	defer func() {
		// Best effort, and allowed to outlive a cancelled analysis briefly.
		cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer cancel()
		if req, err := http.NewRequestWithContext(cleanup, http.MethodDelete, base+"/v2/transcript/"+job.ID, nil); err == nil {
			req.Header.Set("Authorization", p.Key)
			if resp, err := client(p.Client).Do(req); err == nil {
				resp.Body.Close()
			}
		}
	}()
	for job.Status != "completed" {
		if job.Status == "error" {
			return nil, providerError(name, job.Error)
		}
		if err := pause(ctx); err != nil {
			return nil, err
		}
		if err := call(http.MethodGet, base+"/v2/transcript/"+job.ID, nil, &job); err != nil {
			return nil, done(ctx, err)
		}
	}
	var segments []Segment
	for _, u := range job.Utterances {
		segments = append(segments, Segment{Speaker: u.Speaker, Start: u.Start / 1000, End: u.End / 1000, Text: tidy(u.Text)})
	}
	return noSegments(segments)
}
