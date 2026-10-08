package i18n

import (
	"context"
	"errors"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"testing"
)

func TestResolve(t *testing.T) {
	for _, c := range []struct {
		choice    string
		preferred []string
		want      Locale
	}{
		{"system", []string{"en-US", "zh-Hans-CN"}, English},
		{"system", []string{"zh-Hans-CN", "en-US"}, Chinese},
		{"system", []string{"zh-Hant-TW"}, Traditional},
		{"system", []string{"zh-Hant-HK"}, Traditional},
		{"system", []string{"zh-Hant"}, Traditional},
		{"system", []string{"zh_TW"}, Traditional},
		{"system", []string{"zh-HK"}, Traditional},
		{"system", []string{"zh-Hans-TW"}, Chinese},
		{"system", []string{"zh-SG"}, Chinese},
		{"system", []string{"zh"}, Chinese},
		{"system", []string{"zh_CN"}, Chinese},
		{"system", []string{"ja-JP", "en-GB"}, English},
		{"system", []string{"fr-FR"}, English},
		{"system", nil, English},
		{"zh-CN", []string{"en-US"}, Chinese},
		{"zh-TW", []string{"zh-Hans"}, Traditional},
		{"en-US", []string{"zh-Hans"}, English},
		{"klingon", []string{"zh-Hans"}, Chinese},
	} {
		if got := Resolve(c.choice, c.preferred); got != c.want {
			t.Errorf("Resolve(%q, %v) = %s, want %s", c.choice, c.preferred, got, c.want)
		}
	}
	for _, choice := range []string{"system", "zh-CN", "zh-TW", "en-US"} {
		if !ValidChoice(choice) {
			t.Errorf("%q rejected", choice)
		}
	}
	if ValidChoice("zh-HK") || ValidChoice("") {
		t.Error("unsupported choice accepted")
	}
}

func TestSystemLanguageSources(t *testing.T) {
	out := "(\n    \"en-US\",\n    \"zh-Hans-CN\"\n)\n"
	if got := parseAppleLanguages(out); !slices.Equal(got, []string{"en-US", "zh-Hans-CN"}) {
		t.Fatalf("AppleLanguages: %v", got)
	}
	t.Setenv("LANGUAGE", "")
	t.Setenv("LC_ALL", "")
	t.Setenv("LC_MESSAGES", "zh_CN.UTF-8@pinyin")
	t.Setenv("LANG", "en_US.UTF-8")
	if got := envLanguages(); !slices.Equal(got, []string{"zh_CN"}) {
		t.Fatalf("LC_MESSAGES: %v", got)
	}
	t.Setenv("LANGUAGE", "en_GB:zh_CN")
	t.Setenv("LC_MESSAGES", "C")
	if got := envLanguages(); !slices.Equal(got, []string{"en_GB", "zh_CN"}) {
		t.Fatalf("LANGUAGE: %v", got)
	}
	// Never fails, whatever the machine is set to.
	_ = SystemLanguages(context.Background(), "com.rzlihang.mousqueau")
}

func TestErrorsFollowTheCurrentLocale(t *testing.T) {
	defer SetCurrent(Current())
	inner := Errorf("no SRT cues found")
	err := Errorf("invalid project JSON: %w", inner)
	SetCurrent(English)
	if err.Error() != "invalid project JSON: no SRT cues found" {
		t.Fatalf("English: %q", err)
	}
	SetCurrent(Chinese)
	if err.Error() != "项目 JSON 无效：未找到 SRT 字幕" {
		t.Fatalf("Chinese: %q", err)
	}
	if !errors.Is(err, inner) {
		t.Fatal("%w does not wrap")
	}
	if T("Quit %[1]s", "Mousqueau") != "退出 Mousqueau" || T("Not in the catalog") != "Not in the catalog" {
		t.Fatal("T")
	}
	SetCurrent(Traditional)
	if err.Error() != "專案 JSON 無效：找不到 SRT 字幕" {
		t.Fatalf("Traditional: %q", err)
	}
}

var verb = regexp.MustCompile(`%(\[\d+\])?[-+# 0]*\d*(\.\d+)?[a-zA-Z%]`)

// verbs normalizes %w to %v, which is how a translation is formatted.
func verbs(format string) []string {
	found := verb.FindAllString(format, -1)
	for i, v := range found {
		found[i] = strings.Replace(v, "%w", "%v", 1)
	}
	slices.Sort(found)
	return found
}

// Every string Go hands to i18n has a translation in every catalog with the
// same formatting verbs, and no catalog holds anything no longer used.
func TestCatalogCoversTheSource(t *testing.T) {
	used := map[string]bool{}
	root := filepath.Join("..", "..")
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() && (d.Name() == "node_modules" || d.Name() == "frontend" || strings.HasPrefix(d.Name(), ".")) && path != root {
			return filepath.SkipDir
		}
		if d.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		source, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		file, err := parser.ParseFile(token.NewFileSet(), path, source, 0)
		if err != nil {
			return err
		}
		ast.Inspect(file, func(n ast.Node) bool {
			if n, ok := n.(*ast.CallExpr); ok {
				sel, ok := n.Fun.(*ast.SelectorExpr)
				name := ""
				if ok {
					if pkg, ok := sel.X.(*ast.Ident); ok && pkg.Name == "i18n" {
						name = sel.Sel.Name
					}
				} else if id, ok := n.Fun.(*ast.Ident); ok && filepath.Base(filepath.Dir(path)) == "i18n" {
					name = id.Name
				}
				if (name == "T" || name == "Errorf" || name == "N") && len(n.Args) > 0 {
					if lit, ok := n.Args[0].(*ast.BasicLit); ok && lit.Kind == token.STRING {
						s, _ := strconv.Unquote(lit.Value)
						used[s] = true
					}
				}
			}
			return true
		})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(used) < 50 {
		t.Fatalf("found only %d strings; is the scan broken?", len(used))
	}
	for l, catalog := range catalogs {
		for s := range used {
			translated, ok := catalog[s]
			if !ok {
				t.Errorf("%s: missing %q", l, s)
			} else if !slices.Equal(verbs(s), verbs(translated)) {
				t.Errorf("%s: verbs differ: %q → %q", l, s, translated)
			}
		}
		for s := range catalog {
			if !used[s] {
				t.Errorf("%s: unused translation %q", l, s)
			}
		}
	}
	if len(catalogs) != len(locales)-1 {
		t.Errorf("%d catalogs for %d translated locales", len(catalogs), len(locales)-1)
	}
}
