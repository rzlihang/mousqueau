package analysis

import (
	"bytes"
	"context"
	"mousqueau/internal/i18n"
	"net/http"
	"net/url"
)

// Deepgram transcribes the uploaded audio in one request; utterances carry
// a numbered speaker when diarization is on.
type Deepgram struct {
	Key     string
	Model   string
	BaseURL string
	Client  *http.Client
}

func (p Deepgram) Transcribe(ctx context.Context, path string) ([]Segment, error) {
	if p.Key == "" {
		return nil, i18n.Errorf("%s needs credentials; add them in Settings", "Deepgram")
	}
	audio, err := readAudio(path)
	if err != nil {
		return nil, err
	}
	base := p.BaseURL
	if base == "" {
		base = "https://api.deepgram.com"
	}
	model := p.Model
	if model == "" {
		model = "nova-2"
	}
	query := url.Values{"model": {model}, "language": {"zh"}, "diarize": {"true"}, "utterances": {"true"}, "punctuate": {"true"}, "smart_format": {"true"}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/v1/listen?"+query.Encode(), bytes.NewReader(audio))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Token "+p.Key)
	req.Header.Set("Content-Type", "audio/mp4")
	var data struct {
		Results struct {
			Utterances []struct {
				Start      float64 `json:"start"`
				End        float64 `json:"end"`
				Speaker    *int    `json:"speaker"`
				Transcript string  `json:"transcript"`
			} `json:"utterances"`
		} `json:"results"`
	}
	if err := fetchJSON(ctx, p.Client, req, "Deepgram", &data); err != nil {
		return nil, err
	}
	var segments []Segment
	for _, u := range data.Results.Utterances {
		segments = append(segments, Segment{Speaker: numbered(u.Speaker), Start: u.Start, End: u.End, Text: tidy(u.Transcript)})
	}
	return noSegments(segments)
}

// numbered turns a provider's 0-based speaker number into a letter, as
// OpenAI labels speakers; no number means the speaker is unknown.
func numbered(n *int) string {
	switch {
	case n == nil || *n < 0:
		return ""
	case *n < 26:
		return string(rune('A' + *n))
	default:
		return "S" + itoa(*n+1)
	}
}
