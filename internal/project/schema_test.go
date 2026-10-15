package project

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"sort"
	"strings"
	"testing"

	"mousqueau/internal/analysis"
	"mousqueau/internal/subtitle"
)

// TestSchemaMatchesTheProjectTypes keeps schema/project.schema.json in step
// with the Go types: every JSON field is described, nothing else is, and a
// field the schema requires is one Go always writes.
func TestSchemaMatchesTheProjectTypes(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "schema", "project.schema.json"))
	if err != nil {
		t.Fatal(err)
	}
	var root map[string]any
	if err := json.Unmarshal(data, &root); err != nil {
		t.Fatal(err)
	}
	if root["$id"] != SchemaURL {
		t.Fatalf("$id %v, want %s", root["$id"], SchemaURL)
	}
	defs, _ := root["$defs"].(map[string]any)
	resolve := func(node map[string]any) map[string]any {
		if ref, ok := node["$ref"].(string); ok {
			def, _ := defs[strings.TrimPrefix(ref, "#/$defs/")].(map[string]any)
			if def == nil {
				t.Fatalf("unresolved %s", ref)
			}
			return def
		}
		return node
	}
	seen := map[reflect.Type]bool{}
	var check func(path string, typ reflect.Type, node map[string]any)
	check = func(path string, typ reflect.Type, node map[string]any) {
		node = resolve(node)
		switch typ.Kind() {
		case reflect.Slice:
			items, _ := node["items"].(map[string]any)
			if items == nil {
				t.Fatalf("%s: no items", path)
			}
			check(path+"[]", typ.Elem(), items)
			return
		case reflect.Struct:
		default:
			return
		}
		if seen[typ] {
			return
		}
		seen[typ] = true
		props, _ := node["properties"].(map[string]any)
		if node["additionalProperties"] != false {
			t.Errorf("%s: additionalProperties must be false", path)
		}
		fields := map[string]bool{}
		written := map[string]bool{}
		for i := range typ.NumField() {
			f := typ.Field(i)
			name, opts, _ := strings.Cut(f.Tag.Get("json"), ",")
			if name == "" || name == "-" {
				continue
			}
			fields[name] = true
			written[name] = !strings.Contains(opts, "omitempty")
			prop, _ := props[name].(map[string]any)
			if prop == nil {
				t.Errorf("%s: schema lacks %q", path, name)
				continue
			}
			check(path+"."+name, f.Type, prop)
		}
		var extra []string
		for name := range props {
			if !fields[name] {
				extra = append(extra, name)
			}
		}
		sort.Strings(extra)
		if len(extra) > 0 {
			t.Errorf("%s: schema has fields Go lacks: %v", path, extra)
		}
		required, _ := node["required"].([]any)
		for _, r := range required {
			if name, _ := r.(string); !written[name] {
				t.Errorf("%s: %q is required but Go may omit it", path, name)
			}
		}
		for name, always := range written {
			if always && !slices.Contains(required, any(name)) && name != "$schema" {
				t.Errorf("%s: Go always writes %q; require it", path, name)
			}
		}
	}
	check("project", reflect.TypeOf(Project{}), root)
	for _, typ := range []reflect.Type{reflect.TypeOf(subtitle.Line{}), reflect.TypeOf(analysis.Suggestion{})} {
		if !seen[typ] {
			t.Errorf("%s never reached from the project", typ)
		}
	}
}
