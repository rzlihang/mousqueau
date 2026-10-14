package analysis

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"mousqueau/internal/i18n"
	"net/http"
	"net/url"
	"path/filepath"
)

// DashScope is Alibaba Cloud Model Studio's speech recognition. File
// transcription reads audio from a URL, so the audio first goes to the
// temporary storage DashScope provides for this, which expires on its own.
type DashScope struct {
	Key     string
	Model   string
	BaseURL string
	Client  *http.Client
}

func (p DashScope) Transcribe(ctx context.Context, path string) ([]Segment, error) {
	name := i18n.T("Alibaba Cloud Model Studio")
	if p.Key == "" {
		return nil, i18n.Errorf("%s needs credentials; add them in Settings", name)
	}
	audio, err := readAudio(path)
	if err != nil {
		return nil, err
	}
	base := p.BaseURL
	if base == "" {
		base = "https://dashscope.aliyuncs.com"
	}
	model := p.Model
	if model == "" {
		model = "paraformer-v2"
	}
	request := func(method, url string, body []byte) (*http.Request, error) {
		req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+p.Key)
		return req, nil
	}

	// 1. A signed upload policy for the temporary storage.
	var policy struct {
		Data struct {
			Policy    string `json:"policy"`
			Signature string `json:"signature"`
			Dir       string `json:"upload_dir"`
			Host      string `json:"upload_host"`
			KeyID     string `json:"oss_access_key_id"`
			ACL       string `json:"x_oss_object_acl"`
			Overwrite string `json:"x_oss_forbid_overwrite"`
		} `json:"data"`
	}
	req, err := request(http.MethodGet, base+"/api/v1/uploads?"+url.Values{"action": {"getPolicy"}, "model": {model}}.Encode(), nil)
	if err != nil {
		return nil, err
	}
	if err := fetchJSON(ctx, p.Client, req, name, &policy); err != nil {
		return nil, err
	}
	d := policy.Data
	if d.Host == "" || d.Dir == "" {
		return nil, providerError(name, "upload policy")
	}
	// 2. The audio itself, as a form upload to the storage host.
	key := d.Dir + "/" + filepath.Base(path)
	var form bytes.Buffer
	writer := multipart.NewWriter(&form)
	for _, f := range [][2]string{{"OSSAccessKeyId", d.KeyID}, {"Signature", d.Signature}, {"policy", d.Policy}, {"x-oss-object-acl", d.ACL}, {"x-oss-forbid-overwrite", d.Overwrite}, {"key", key}, {"success_action_status", "200"}} {
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
	upload, err := http.NewRequestWithContext(ctx, http.MethodPost, d.Host, &form)
	if err != nil {
		return nil, err
	}
	upload.Header.Set("Content-Type", writer.FormDataContentType())
	resp, err := send(ctx, p.Client, upload, name)
	if err != nil {
		return nil, err
	}
	resp.Body.Close()

	// 3. An asynchronous transcription task with speaker diarization.
	body, _ := json.Marshal(map[string]any{
		"model":      model,
		"input":      map[string]any{"file_urls": []string{"oss://" + key}},
		"parameters": map[string]any{"diarization_enabled": true, "language_hints": []string{"zh"}},
	})
	req, err = request(http.MethodPost, base+"/api/v1/services/audio/asr/transcription", body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-DashScope-Async", "enable")
	req.Header.Set("X-DashScope-OssResourceResolve", "enable")
	type task struct {
		Code    string `json:"code"`
		Message string `json:"message"`
		Output  struct {
			ID      string `json:"task_id"`
			Status  string `json:"task_status"`
			Code    string `json:"code"`
			Message string `json:"message"`
			Results []struct {
				URL     string `json:"transcription_url"`
				Status  string `json:"subtask_status"`
				Code    string `json:"code"`
				Message string `json:"message"`
			} `json:"results"`
		} `json:"output"`
	}
	var job task
	if err := fetchJSON(ctx, p.Client, req, name, &job); err != nil {
		return nil, err
	}
	if job.Output.ID == "" {
		return nil, providerError(name, job.Code)
	}
	id := job.Output.ID
	for job.Output.Status != "SUCCEEDED" {
		switch job.Output.Status {
		case "FAILED", "CANCELED", "UNKNOWN":
			code := job.Output.Code
			for _, r := range job.Output.Results {
				if r.Code != "" {
					code = r.Code
				}
			}
			return nil, providerError(name, code)
		}
		if err := pause(ctx); err != nil {
			return nil, err
		}
		req, err := request(http.MethodGet, base+"/api/v1/tasks/"+id, nil)
		if err != nil {
			return nil, err
		}
		if err := fetchJSON(ctx, p.Client, req, name, &job); err != nil {
			return nil, done(ctx, err)
		}
	}
	if len(job.Output.Results) == 0 || job.Output.Results[0].Status != "SUCCEEDED" || job.Output.Results[0].URL == "" {
		code := ""
		if len(job.Output.Results) > 0 {
			code = job.Output.Results[0].Code
		}
		return nil, providerError(name, code)
	}

	// 4. The result is a separate, presigned JSON document.
	req, err = http.NewRequestWithContext(ctx, http.MethodGet, job.Output.Results[0].URL, nil)
	if err != nil {
		return nil, err
	}
	var result struct {
		Transcripts []struct {
			Sentences []struct {
				Begin   float64 `json:"begin_time"` // milliseconds
				End     float64 `json:"end_time"`
				Text    string  `json:"text"`
				Speaker *int    `json:"speaker_id"`
			} `json:"sentences"`
		} `json:"transcripts"`
	}
	if err := fetchJSON(ctx, p.Client, req, name, &result); err != nil {
		return nil, err
	}
	var segments []Segment
	for _, t := range result.Transcripts {
		for _, s := range t.Sentences {
			segments = append(segments, Segment{Speaker: numbered(s.Speaker), Start: s.Begin / 1000, End: s.End / 1000, Text: tidy(s.Text)})
		}
	}
	return noSegments(segments)
}
