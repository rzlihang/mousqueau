package analysis

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"mousqueau/internal/i18n"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Tencent is Tencent Cloud ASR's recording-file recognition. The audio goes
// inline with the request (up to 5 MB) and the result is polled for. Requests
// are signed with TC3-HMAC-SHA256, so the secret key itself is never sent.
type Tencent struct {
	SecretID  string
	SecretKey string
	Model     string // engine type
	BaseURL   string
	Client    *http.Client
	now       func() time.Time
}

const tencentMaxData = 5 << 20

func (p Tencent) Transcribe(ctx context.Context, path string) ([]Segment, error) {
	name := i18n.T("Tencent Cloud ASR")
	if p.SecretID == "" || p.SecretKey == "" {
		return nil, i18n.Errorf("%s needs credentials; add them in Settings", name)
	}
	audio, err := readAudio(path)
	if err != nil {
		return nil, err
	}
	if len(audio) > tencentMaxData {
		return nil, i18n.Errorf("audio exceeds %d MB for %s; select a shorter range", 5, name)
	}
	model := p.Model
	if model == "" {
		model = "16k_zh"
	}
	var created struct {
		Response struct {
			Data struct {
				TaskID int64 `json:"TaskId"`
			}
			Error *struct{ Code string }
		}
	}
	// ResTextFormat 3 splits the result at punctuation, as subtitles are.
	err = p.call(ctx, name, "CreateRecTask", map[string]any{
		"EngineModelType": model, "ChannelNum": 1, "ResTextFormat": 3, "SourceType": 1,
		"Data": base64.StdEncoding.EncodeToString(audio), "DataLen": len(audio),
		"SpeakerDiarization": 1, "SpeakerNumber": 0,
	}, &created)
	if err != nil {
		return nil, err
	}
	if created.Response.Error != nil || created.Response.Data.TaskID == 0 {
		code := ""
		if created.Response.Error != nil {
			code = created.Response.Error.Code
		}
		return nil, providerError(name, code)
	}
	for {
		if err := pause(ctx); err != nil {
			return nil, err
		}
		var status struct {
			Response struct {
				Data struct {
					Status   int
					ErrorMsg string
					Detail   []struct {
						FinalSentence string
						StartMs       float64
						EndMs         float64
						SpeakerID     *int `json:"SpeakerId"`
					} `json:"ResultDetail"`
				}
				Error *struct{ Code string }
			}
		}
		if err := p.call(ctx, name, "DescribeTaskStatus", map[string]any{"TaskId": created.Response.Data.TaskID}, &status); err != nil {
			return nil, done(ctx, err)
		}
		r := status.Response
		if r.Error != nil {
			return nil, providerError(name, r.Error.Code)
		}
		switch r.Data.Status {
		case 2:
			var segments []Segment
			for _, d := range r.Data.Detail {
				segments = append(segments, Segment{Speaker: numbered(d.SpeakerID), Start: d.StartMs / 1000, End: d.EndMs / 1000, Text: tidy(d.FinalSentence)})
			}
			return noSegments(segments)
		case 3:
			return nil, providerError(name, r.Data.ErrorMsg)
		}
	}
}

// call sends one signed API action.
func (p Tencent) call(ctx context.Context, name, action string, params map[string]any, v any) error {
	base := p.BaseURL
	if base == "" {
		base = "https://asr.tencentcloudapi.com"
	}
	host := strings.TrimPrefix(strings.TrimPrefix(base, "https://"), "http://")
	payload, err := json.Marshal(params)
	if err != nil {
		return err
	}
	now := time.Now
	if p.now != nil {
		now = p.now
	}
	t := now().UTC()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	req.Header.Set("X-TC-Action", action)
	req.Header.Set("X-TC-Version", "2019-06-14")
	req.Header.Set("X-TC-Timestamp", strconv.FormatInt(t.Unix(), 10))
	req.Header.Set("Authorization", tc3Authorization(p.SecretID, p.SecretKey, host, action, payload, t))
	return fetchJSON(ctx, p.Client, req, name, v)
}

// tc3Authorization signs a request to the asr service as Tencent Cloud's
// TC3-HMAC-SHA256 scheme describes.
func tc3Authorization(id, key, host, action string, payload []byte, t time.Time) string {
	const service = "asr"
	date := t.UTC().Format("2006-01-02") // Tencent dates the scope in UTC
	signed := "content-type;host;x-tc-action"
	canonical := strings.Join([]string{
		http.MethodPost, "/", "",
		"content-type:application/json; charset=utf-8\nhost:" + host + "\nx-tc-action:" + strings.ToLower(action) + "\n",
		signed, sha256hex(payload),
	}, "\n")
	scope := date + "/" + service + "/tc3_request"
	toSign := strings.Join([]string{"TC3-HMAC-SHA256", strconv.FormatInt(t.Unix(), 10), scope, sha256hex([]byte(canonical))}, "\n")
	secret := hmacSHA256([]byte("TC3"+key), date)
	secret = hmacSHA256(secret, service)
	secret = hmacSHA256(secret, "tc3_request")
	signature := hex.EncodeToString(hmacSHA256(secret, toSign))
	return "TC3-HMAC-SHA256 Credential=" + id + "/" + scope + ", SignedHeaders=" + signed + ", Signature=" + signature
}
func sha256hex(b []byte) string { h := sha256.Sum256(b); return hex.EncodeToString(h[:]) }
func hmacSHA256(key []byte, msg string) []byte {
	h := hmac.New(sha256.New, key)
	h.Write([]byte(msg))
	return h.Sum(nil)
}
