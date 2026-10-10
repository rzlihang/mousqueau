package settings

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

func TestDefaultsRoundTripAndDamagedFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "settings.json")
	loaded, err := Load(path)
	if err != nil || loaded != Default() {
		t.Fatalf("missing file: %+v %v", loaded, err)
	}
	want := Settings{Theme: "dark", LastProject: "/tmp/p.json", SetupDone: true, FFmpegPath: "/opt/ffmpeg", Beta: true, LastUpdateCheck: time.Date(2026, 10, 8, 9, 0, 0, 0, time.UTC)}
	if err := want.Save(path); err != nil {
		t.Fatal(err)
	}
	loaded, err = Load(path)
	if err != nil || loaded != want {
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

	os.WriteFile(path, []byte(`{"theme":"neon","autoUpdate":false}`), 0600)
	loaded, err = Load(path)
	if err != nil || loaded.Theme != "system" || loaded.AutoUpdate || !loaded.OpenLastProject {
		t.Fatalf("partial file: %+v %v", loaded, err)
	}
	os.WriteFile(path, []byte(`{not json`), 0600)
	loaded, err = Load(path)
	if err == nil || loaded != Default() {
		t.Fatalf("damaged file: %+v %v", loaded, err)
	}
}
