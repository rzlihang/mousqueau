package analysis

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func audioFile(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "range.m4a")
	if err := os.WriteFile(path, []byte("audio-bytes"), 0600); err != nil {
		t.Fatal(err)
	}
	return path
}
func fastPolling(t *testing.T) {
	old := pollInterval
	pollInterval = time.Millisecond
	t.Cleanup(func() { pollInterval = old })
}
func expect(t *testing.T, segments []Segment, err error, want ...Segment) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
	if len(segments) != len(want) {
		t.Fatalf("got %+v, want %+v", segments, want)
	}
	for i := range want {
		if segments[i] != want[i] {
			t.Fatalf("segment %d: got %+v, want %+v", i, segments[i], want[i])
		}
	}
}

func TestDeepgramRequest(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		body, _ := io.ReadAll(r.Body)
		if r.URL.Path != "/v1/listen" || r.Header.Get("Authorization") != "Token dg" || q.Get("diarize") != "true" || q.Get("utterances") != "true" || q.Get("model") != "nova-2" || string(body) != "audio-bytes" {
			t.Errorf("unexpected request %s %v", r.URL, r.Header)
		}
		w.Write([]byte(`{"results":{"utterances":[{"start":0.5,"end":2,"speaker":1,"transcript":"你 好 世界"},{"start":2,"end":3,"transcript":"OK then"}]}}`))
	}))
	defer server.Close()
	s, err := Deepgram{Key: "dg", BaseURL: server.URL}.Transcribe(context.Background(), audioFile(t))
	expect(t, s, err, Segment{Speaker: "B", Start: 0.5, End: 2, Text: "你好世界"}, Segment{Start: 2, End: 3, Text: "OK then"})
}

func TestAssemblyAIUploadsPollsAndDeletes(t *testing.T) {
	fastPolling(t)
	var polls, deleted atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "aai" {
			t.Errorf("auth missing on %s", r.URL)
		}
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v2/upload":
			w.Write([]byte(`{"upload_url":"https://cdn.example/u1"}`))
		case r.Method == http.MethodPost && r.URL.Path == "/v2/transcript":
			var req map[string]any
			json.NewDecoder(r.Body).Decode(&req)
			if req["audio_url"] != "https://cdn.example/u1" || req["speaker_labels"] != true || fmt.Sprint(req["speech_models"]) != "[universal-2]" {
				t.Errorf("bad transcript request %v", req)
			}
			w.Write([]byte(`{"id":"t1","status":"queued"}`))
		case r.Method == http.MethodGet && r.URL.Path == "/v2/transcript/t1":
			if polls.Add(1) < 2 {
				w.Write([]byte(`{"id":"t1","status":"processing"}`))
				return
			}
			w.Write([]byte(`{"id":"t1","status":"completed","utterances":[{"speaker":"A","start":1000,"end":2500,"text":"第一句"}]}`))
		case r.Method == http.MethodDelete && r.URL.Path == "/v2/transcript/t1":
			deleted.Add(1)
			w.Write([]byte(`{}`))
		default:
			t.Errorf("unexpected %s %s", r.Method, r.URL)
		}
	}))
	defer server.Close()
	s, err := AssemblyAI{Key: "aai", Model: "universal-2", BaseURL: server.URL}.Transcribe(context.Background(), audioFile(t))
	expect(t, s, err, Segment{Speaker: "A", Start: 1, End: 2.5, Text: "第一句"})
	if deleted.Load() != 1 {
		t.Fatal("transcript left on the service")
	}
}

func TestAssemblyAIError(t *testing.T) {
	fastPolling(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v2/upload":
			w.Write([]byte(`{"upload_url":"u"}`))
		case "/v2/transcript":
			w.Write([]byte(`{"id":"t1","status":"error","error":"Transcoding failed"}`))
		default:
			w.Write([]byte(`{}`))
		}
	}))
	defer server.Close()
	_, err := AssemblyAI{Key: "aai", BaseURL: server.URL}.Transcribe(context.Background(), audioFile(t))
	if err == nil || !strings.Contains(err.Error(), "Transcoding failed") {
		t.Fatalf("error not reported: %v", err)
	}
}

func TestElevenLabsGroupsWordsIntoSentences(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("xi-api-key") != "el" || r.ParseMultipartForm(1<<20) != nil || r.FormValue("diarize") != "true" || r.FormValue("model_id") != "scribe_v2" {
			t.Errorf("unexpected request %v", r.Header)
		}
		w.Write([]byte(`{"words":[
			{"text":"你好","start":0,"end":0.4,"type":"word","speaker_id":"speaker_0"},
			{"text":"。","start":0.4,"end":0.5,"type":"word","speaker_id":"speaker_0"},
			{"text":"(laughs)","start":0.5,"end":0.7,"type":"audio_event","speaker_id":"speaker_0"},
			{"text":"Hi","start":0.8,"end":1,"type":"word","speaker_id":"speaker_1"},
			{"text":" ","start":1,"end":1,"type":"spacing","speaker_id":"speaker_1"},
			{"text":"there","start":1,"end":1.3,"type":"word","speaker_id":"speaker_1"},
			{"text":"again","start":3,"end":3.4,"type":"word","speaker_id":"speaker_1"}
		]}`))
	}))
	defer server.Close()
	s, err := ElevenLabs{Key: "el", BaseURL: server.URL}.Transcribe(context.Background(), audioFile(t))
	expect(t, s, err,
		Segment{Speaker: "A", Start: 0, End: 0.5, Text: "你好。"},
		Segment{Speaker: "B", Start: 0.8, End: 1.3, Text: "Hi there"},
		Segment{Speaker: "B", Start: 3, End: 3.4, Text: "again"})
}

func TestDashScopeUploadsToTemporaryStorage(t *testing.T) {
	fastPolling(t)
	var server *httptest.Server
	var polls atomic.Int32
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		bearer := r.Header.Get("Authorization") == "Bearer ds"
		switch {
		case r.URL.Path == "/api/v1/uploads":
			if !bearer || r.URL.Query().Get("action") != "getPolicy" || r.URL.Query().Get("model") != "paraformer-v2" {
				t.Errorf("bad policy request %s", r.URL)
			}
			w.Write([]byte(`{"data":{"policy":"p","signature":"s","upload_dir":"dashscope-instant/x","upload_host":"` + server.URL + `/oss","oss_access_key_id":"k","x_oss_object_acl":"private","x_oss_forbid_overwrite":"true"}}`))
		case r.URL.Path == "/oss":
			if r.Header.Get("Authorization") != "" {
				t.Error("API key sent to the storage host")
			}
			r.ParseMultipartForm(1 << 20)
			f, _, err := r.FormFile("file")
			if err != nil || r.FormValue("key") != "dashscope-instant/x/range.m4a" || r.FormValue("Signature") != "s" || r.FormValue("policy") != "p" {
				t.Errorf("bad upload form %v", r.MultipartForm)
			} else {
				f.Close()
			}
		case r.URL.Path == "/api/v1/services/audio/asr/transcription":
			var req struct {
				Input struct {
					FileURLs []string `json:"file_urls"`
				}
				Parameters map[string]any
			}
			json.NewDecoder(r.Body).Decode(&req)
			if !bearer || r.Header.Get("X-DashScope-Async") != "enable" || r.Header.Get("X-DashScope-OssResourceResolve") != "enable" ||
				len(req.Input.FileURLs) != 1 || req.Input.FileURLs[0] != "oss://dashscope-instant/x/range.m4a" || req.Parameters["diarization_enabled"] != true {
				t.Errorf("bad task request %+v", req)
			}
			w.Write([]byte(`{"output":{"task_id":"task1","task_status":"PENDING"}}`))
		case r.URL.Path == "/api/v1/tasks/task1":
			if polls.Add(1) < 2 {
				w.Write([]byte(`{"output":{"task_id":"task1","task_status":"RUNNING"}}`))
				return
			}
			w.Write([]byte(`{"output":{"task_id":"task1","task_status":"SUCCEEDED","results":[{"subtask_status":"SUCCEEDED","transcription_url":"` + server.URL + `/result.json"}]}}`))
		case r.URL.Path == "/result.json":
			w.Write([]byte(`{"transcripts":[{"sentences":[{"begin_time":100,"end_time":1900,"text":"大家好","speaker_id":0},{"begin_time":2000,"end_time":3000,"text":"你好","speaker_id":1}]}]}`))
		default:
			t.Errorf("unexpected %s", r.URL)
		}
	}))
	defer server.Close()
	s, err := DashScope{Key: "ds", BaseURL: server.URL}.Transcribe(context.Background(), audioFile(t))
	expect(t, s, err, Segment{Speaker: "A", Start: 0.1, End: 1.9, Text: "大家好"}, Segment{Speaker: "B", Start: 2, End: 3, Text: "你好"})
}

func TestTencentSignsAndPolls(t *testing.T) {
	fastPolling(t)
	now := time.Unix(1_700_000_000, 0)
	var polls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		payload, _ := io.ReadAll(r.Body)
		host := r.Host
		action := r.Header.Get("X-TC-Action")
		if r.Header.Get("Authorization") != tc3Authorization("AKID", "secret", host, action, payload, now) {
			t.Errorf("bad signature for %s", action)
		}
		if strings.Contains(string(payload), "secret") || strings.Contains(r.Header.Get("Authorization"), "secret") {
			t.Error("secret key sent")
		}
		var p map[string]any
		json.Unmarshal(payload, &p)
		switch action {
		case "CreateRecTask":
			data, _ := base64.StdEncoding.DecodeString(p["Data"].(string))
			if string(data) != "audio-bytes" || p["SpeakerDiarization"] != 1.0 || p["EngineModelType"] != "16k_zh" || p["SourceType"] != 1.0 {
				t.Errorf("bad task %v", p)
			}
			w.Write([]byte(`{"Response":{"Data":{"TaskId":42},"RequestId":"r"}}`))
		case "DescribeTaskStatus":
			if p["TaskId"] != 42.0 {
				t.Errorf("bad task id %v", p)
			}
			if polls.Add(1) < 2 {
				w.Write([]byte(`{"Response":{"Data":{"Status":1}}}`))
				return
			}
			w.Write([]byte(`{"Response":{"Data":{"Status":2,"ResultDetail":[{"FinalSentence":"你好。","StartMs":0,"EndMs":1200,"SpeakerId":0},{"FinalSentence":"再見","StartMs":1300,"EndMs":2000,"SpeakerId":null}]}}}`))
		}
	}))
	defer server.Close()
	s, err := Tencent{SecretID: "AKID", SecretKey: "secret", BaseURL: server.URL, now: func() time.Time { return now }}.Transcribe(context.Background(), audioFile(t))
	expect(t, s, err, Segment{Speaker: "A", Start: 0, End: 1.2, Text: "你好。"}, Segment{Start: 1.3, End: 2, Text: "再見"})
}

func TestTencentReportsErrorCodes(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"Response":{"Error":{"Code":"AuthFailure.SignatureFailure","Message":"details"}}}`))
	}))
	defer server.Close()
	_, err := Tencent{SecretID: "a", SecretKey: "b", BaseURL: server.URL}.Transcribe(context.Background(), audioFile(t))
	if err == nil || !strings.Contains(err.Error(), "AuthFailure.SignatureFailure") || strings.Contains(err.Error(), "details") {
		t.Fatalf("got %v", err)
	}
}

func TestTC3SignatureIsStable(t *testing.T) {
	a := tc3Authorization("AKID", "key", "asr.tencentcloudapi.com", "CreateRecTask", []byte(`{}`), time.Unix(1_700_000_000, 0))
	b := tc3Authorization("AKID", "key", "asr.tencentcloudapi.com", "CreateRecTask", []byte(`{ }`), time.Unix(1_700_000_000, 0))
	if !strings.HasPrefix(a, "TC3-HMAC-SHA256 Credential=AKID/2023-11-14/asr/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=") || a == b {
		t.Fatal(a)
	}
}

func TestPollingStopsOnCancel(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"Response":{"Data":{"TaskId":1,"Status":1}}}`))
	}))
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	start := time.Now()
	_, err := Tencent{SecretID: "a", SecretKey: "b", BaseURL: server.URL}.Transcribe(ctx, audioFile(t))
	if err == nil || time.Since(start) > 3*time.Second {
		t.Fatalf("polling ignored cancellation: %v", err)
	}
}

func TestCustomOpenAICompatibleEndpoint(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.ParseMultipartForm(1 << 20)
		if r.URL.Path != "/v1/audio/transcriptions" || r.Header.Get("Authorization") != "" || r.FormValue("response_format") != "verbose_json" || r.FormValue("model") != "whisper-large-v3" {
			t.Errorf("unexpected request %s %v", r.URL, r.Form)
		}
		w.Write([]byte(`{"text":"…","segments":[{"id":0,"start":0,"end":1.5,"text":" 你好 "}]}`))
	}))
	defer server.Close()
	p, err := New("custom", Config{Endpoint: "http://localhost" + strings.TrimPrefix(server.URL, "http://127.0.0.1") + "/v1", Model: "whisper-large-v3"}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	s, err := p.Transcribe(context.Background(), audioFile(t))
	expect(t, s, err, Segment{Start: 0, End: 1.5, Text: "你好"})
	if _, err := New("custom", Config{Model: "m"}, nil, nil); err == nil {
		t.Fatal("custom provider without a URL accepted")
	}
}

func TestRegistry(t *testing.T) {
	for _, p := range Providers() {
		if len(p.EnvVars) != 0 && len(p.EnvVars) != len(p.Credentials) {
			t.Errorf("%s: one environment variable per credential part", p.ID)
		}
		if p.ID != "custom" {
			if _, err := New(p.ID, Config{}, []string{"a", "b"}, nil); err != nil {
				t.Errorf("%s: %v", p.ID, err)
			}
		}
		if p.Caution() != (p.Region == "china" || p.Region == "custom") {
			t.Errorf("%s: caution", p.ID)
		}
	}
	if p, _ := New("elevenlabs", Config{Model: "scribe_v1"}, []string{"k"}, nil); p.(ElevenLabs).Model != "scribe_v2" {
		t.Error("retired ElevenLabs model kept")
	}
	if p, _ := New("assemblyai", Config{Model: "best"}, []string{"k"}, nil); p.(AssemblyAI).Model != "" {
		t.Error("retired AssemblyAI model kept")
	}
	if _, err := New("nope", Config{}, nil, nil); err == nil {
		t.Fatal("unknown provider accepted")
	}
	for raw, ok := range map[string]bool{"": true, "https://api.example.com/v1": true, "http://localhost:8000/v1": true, "http://127.0.0.1/v1": true,
		"http://api.example.com/v1": false, "ftp://x": false, "https://user:pw@x.com": false, "https://x.com/v1?key=1": false, "not a url": false} {
		if (ValidateEndpoint(raw) == nil) != ok {
			t.Errorf("ValidateEndpoint(%q)", raw)
		}
	}
	if TranscriptionURL("https://x/v1/") != "https://x/v1/audio/transcriptions" || TranscriptionURL("https://x/v1/audio/transcriptions") != "https://x/v1/audio/transcriptions" {
		t.Fatal("TranscriptionURL")
	}
	if ValidateModel("FunAudioLLM/SenseVoiceSmall") != nil || ValidateModel("a b") == nil || ValidateModel(`x"`) == nil {
		t.Fatal("ValidateModel")
	}
}

func TestTidy(t *testing.T) {
	for in, want := range map[string]string{" 你 好  世界 ": "你好世界", "Hello   world": "Hello world", "我 love 你": "我 love 你", "好，  再見": "好，再見"} {
		if got := tidy(in); got != want {
			t.Errorf("tidy(%q) = %q", in, got)
		}
	}
}
