package analysis

import (
	"context"
	"mousqueau/internal/subtitle"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestAlignAmbiguityAndOffset(t *testing.T) {
	cues := []subtitle.Cue{{ID: "a", Start: 60, End: 64, Text: "原文"}, {ID: "b", Start: 64, End: 68, Text: "後文"}, {ID: "c", Start: 70, End: 72, Text: "未分析"}}
	segments, err := Offset([]Segment{{Speaker: "A", Start: 0, End: 3, Text: "第一句"}, {Speaker: "B", Start: 2, End: 5, Text: "第二句"}}, 60, 60)
	if err != nil {
		t.Fatal(err)
	}
	r := Align(cues, segments, 60, 68)
	if len(r.Suggestions) != 2 || len(r.Suggestions[0].SpeakerIDs) != 2 || !r.Suggestions[0].Review || !r.Suggestions[1].Review {
		t.Fatalf("bad alignment: %+v", r)
	}
	if r.Segments[0].Start != 60 {
		t.Fatal("offset missing")
	}
}
func TestSingleAndMissingSpeech(t *testing.T) {
	c := []subtitle.Cue{{ID: "a", Start: 0, End: 2, Text: "a"}, {ID: "b", Start: 3, End: 4, Text: "b"}}
	r := Align(c, []Segment{{Speaker: "A", Start: 0, End: 2, Text: "好"}}, 0, 60)
	if len(r.Suggestions) != 1 || r.Suggestions[0].Review || r.Suggestions[0].Proposed != "好" {
		t.Fatal(r)
	}
}
func TestOffsetInvalid(t *testing.T) {
	if _, err := Offset([]Segment{{Start: 2, End: 1}}, 0, 60); err == nil {
		t.Fatal("invalid segment accepted")
	}
}
func TestOpenAIRequest(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test" {
			t.Error("auth missing")
		}
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Error(err)
		}
		for k, v := range map[string]string{"model": "gpt-4o-transcribe-diarize", "response_format": "diarized_json", "chunking_strategy": "auto", "language": "zh"} {
			if r.FormValue(k) != v {
				t.Errorf("%s missing", k)
			}
		}
		f, _, err := r.FormFile("file")
		if err != nil {
			t.Error(err)
		} else {
			f.Close()
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"segments":[{"speaker":"A","start":1,"end":2,"text":"你好"}]}`))
	}))
	defer server.Close()
	path := filepath.Join(t.TempDir(), "audio.m4a")
	os.WriteFile(path, []byte("audio"), 0600)
	s, err := (OpenAI{Key: "test", Endpoint: server.URL}).Transcribe(context.Background(), path)
	if err != nil || len(s) != 1 || s[0].Text != "你好" {
		t.Fatalf("%v %+v", err, s)
	}
}
func TestOpenAICancelAndSize(t *testing.T) {
	path := filepath.Join(t.TempDir(), "audio.m4a")
	os.WriteFile(path, []byte("a"), 0600)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(100 * time.Millisecond):
		}
	}))
	defer server.Close()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := (OpenAI{Key: "test", Endpoint: server.URL}).Transcribe(ctx, path); err == nil {
		t.Fatal("cancel ignored")
	}
	file, _ := os.OpenFile(path, os.O_WRONLY, 0600)
	file.Truncate(MaxAudioBytes + 1)
	file.Close()
	if _, err := (OpenAI{Key: "test", Endpoint: server.URL}).Transcribe(context.Background(), path); err == nil {
		t.Fatal("oversized upload accepted")
	}
}
