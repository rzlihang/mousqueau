package settings

import (
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestDefaultsRoundTripAndDamagedFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "settings.json")
	loaded, err := Load(path)
	if err != nil || !reflect.DeepEqual(loaded, Default()) {
		t.Fatalf("missing file: %+v %v", loaded, err)
	}
	want := Settings{Theme: "dark", Language: "zh-TW", SubtitleFont: "PingFang TC", LastProject: "/tmp/p.json", SetupDone: true, FFmpegPath: "/opt/ffmpeg", Beta: true, LastUpdateCheck: time.Date(2026, 10, 8, 9, 0, 0, 0, time.UTC),
		Provider: "tencent", Providers: []ProviderConfig{{ID: "openai"}, {ID: "tencent", Model: "16k_zh_video"}, {ID: "custom", Model: "whisper-1", Endpoint: "http://localhost:8000/v1"}}}
	if err := want.Save(path); err != nil {
		t.Fatal(err)
	}
	loaded, err = Load(path)
	if err != nil || !reflect.DeepEqual(loaded, want) {
		t.Fatalf("round trip: %+v %v", loaded, err)
	}
	// Windows has no permission bits; %AppData% is private to the user.
	info, _ := os.Stat(path)
	if runtime.GOOS != "windows" && info.Mode().Perm()&0077 != 0 {
		t.Fatalf("settings readable by others: %v", info.Mode())
	}
	leftovers, _ := filepath.Glob(filepath.Join(filepath.Dir(path), "settings-*.json"))
	if len(leftovers) != 0 {
		t.Fatalf("temporary files left: %v", leftovers)
	}

	os.WriteFile(path, []byte(`{"theme":"neon","language":"fr-FR","subtitleFont":"x\"}","autoUpdate":false}`), 0600)
	loaded, err = Load(path)
	if err != nil || loaded.Theme != "system" || loaded.Language != "system" || loaded.SubtitleFont != "" || loaded.AutoUpdate || !loaded.OpenLastProject || loaded.Provider != "openai" || len(loaded.Providers) != 1 {
		t.Fatalf("partial file: %+v %v", loaded, err)
	}
	os.WriteFile(path, []byte(`{not json`), 0600)
	loaded, err = Load(path)
	if err == nil || !reflect.DeepEqual(loaded, Default()) {
		t.Fatalf("damaged file: %+v %v", loaded, err)
	}
}

func TestProvidersAreNormalized(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")
	os.WriteFile(path, []byte(`{"provider":"gone","providers":[{"id":"nope"},{"id":"deepgram","model":"bad model"},{"id":"deepgram"},{"id":"custom","endpoint":"http://example.com"}]}`), 0600)
	loaded, err := Load(path)
	want := []ProviderConfig{{ID: "deepgram"}, {ID: "custom"}}
	if err != nil || loaded.Provider != "deepgram" || !reflect.DeepEqual(loaded.Providers, want) {
		t.Fatalf("%+v %v", loaded, err)
	}
	os.WriteFile(path, []byte(`{"provider":"openai","providers":[]}`), 0600)
	if loaded, _ = Load(path); loaded.Provider != "" || len(loaded.Providers) != 0 {
		t.Fatalf("removing every provider did not stick: %+v", loaded)
	}
}

func TestFontNames(t *testing.T) {
	for _, ok := range []string{"", "PingFang TC", "Noto Sans CJK TC", "蘋方-繁", "Source Han Serif TW", "serif"} {
		if err := ValidateFont(ok); err != nil {
			t.Errorf("%q rejected: %v", ok, err)
		}
	}
	for _, bad := range []string{`Evil"; color: red`, "a'b", `a\b`, "a{b}", "<b>", "tab\there", strings.Repeat("x", 101)} {
		if ValidateFont(bad) == nil {
			t.Errorf("%q accepted", bad)
		}
	}
}
