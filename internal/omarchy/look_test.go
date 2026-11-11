package omarchy

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestParseColors(t *testing.T) {
	accent, mode := ParseColors([]byte(`mode = "dark"
# a comment with accent = "#000000"
accent = "#F48FB8"   # trailing
selection = "#1f4166"
[extra]
`))
	if accent != "#f48fb8" || mode != "dark" {
		t.Fatalf("got %q %q", accent, mode)
	}
	if accent, mode := ParseColors([]byte(`accent = "pink"` + "\nmode = \"dim\"")); accent != "" || mode != "" {
		t.Fatalf("invalid values kept: %q %q", accent, mode)
	}
}

func TestParseRounding(t *testing.T) {
	for in, want := range map[string]int{
		`{"option": "decoration:rounding", "int": 8, "set": true}`: 8,
		`{"option": "decoration:rounding", "int": 0}`:              0,
		`{"int": -3}`: 0,
		`no`:          0,
	} {
		if got := ParseRounding([]byte(in)); got != want {
			t.Errorf("%s: got %d want %d", in, got, want)
		}
	}
}

func TestReadWithoutOmarchy(t *testing.T) {
	if look := (Reader{ThemeDir: t.TempDir()}).Read(context.Background()); look.Present {
		t.Fatalf("present without colors.toml: %+v", look)
	}
}

func TestReadKeepsLookWhenHyprlandIsAbsent(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "colors.toml"), []byte(`accent = "#ffd60a"`), 0o644); err != nil {
		t.Fatal(err)
	}
	r := Reader{ThemeDir: dir, Rounding: func(context.Context) ([]byte, error) { return nil, errors.New("no hyprctl") }}
	if look := r.Read(context.Background()); look != (Look{Present: true, Accent: "#ffd60a"}) {
		t.Fatalf("got %+v", look)
	}
}

func TestWatchFollowsThemeSwitch(t *testing.T) {
	root := t.TempDir()
	write := func(name, accent string) string {
		dir := filepath.Join(root, name)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "colors.toml"), []byte(`accent = "`+accent+`"`), 0o644); err != nil {
			t.Fatal(err)
		}
		return dir
	}
	link := filepath.Join(root, "current")
	if err := os.Symlink(write("a", "#111111"), link); err != nil {
		t.Fatal(err)
	}
	r := Reader{ThemeDir: link}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	got := make(chan Look, 1)
	go r.Watch(ctx, 10*time.Millisecond, r.Read(ctx), func(l Look) { got <- l })
	// Omarchy swaps the link to the new theme rather than editing the file.
	next := filepath.Join(root, "next")
	if err := os.Symlink(write("b", "#222222"), next); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(next, link); err != nil {
		t.Fatal(err)
	}
	select {
	case look := <-got:
		if look.Accent != "#222222" {
			t.Fatalf("got %+v", look)
		}
	case <-ctx.Done():
		t.Fatal("no change seen")
	}
}
