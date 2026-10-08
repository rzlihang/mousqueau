package update

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNewerFollowsSemanticVersionOrder(t *testing.T) {
	newer := [][2]string{{"0.1.0", "0.1.1"}, {"0.1.9", "v0.2.0"}, {"0.9.9", "1.0.0"}, {"0.2.0-beta.1", "0.2.0"}, {"0.2.0-beta.2", "0.2.0-beta.10"}, {"0.2.0-alpha", "0.2.0-beta"}, {"0.2.0-1", "0.2.0-rc"}, {"0.2.0-rc", "0.2.0-rc.1"}}
	for _, pair := range newer {
		if !Newer(pair[0], pair[1]) {
			t.Errorf("%s should be older than %s", pair[0], pair[1])
		}
		if Newer(pair[1], pair[0]) {
			t.Errorf("%s should not be older than %s", pair[1], pair[0])
		}
	}
	for _, pair := range [][2]string{{"0.1.0", "0.1.0"}, {"0.1.0", "v0.1.0+build5"}, {"0.1.0", "nightly"}, {"dev", "9.9.9"}, {"0.1.0", "1.0"}} {
		if Newer(pair[0], pair[1]) {
			t.Errorf("%s reported older than %s", pair[0], pair[1])
		}
	}
}

func TestLatestSkipsDraftsAndPrereleasesUnlessBeta(t *testing.T) {
	status := http.StatusOK
	body := `[
		{"tag_name":"v0.3.0-beta.1","html_url":"https://github.com/rzlihang/mousqueau/releases/tag/v0.3.0-beta.1","prerelease":true},
		{"tag_name":"v9.0.0","html_url":"https://github.com/rzlihang/mousqueau/releases/tag/v9.0.0","draft":true},
		{"tag_name":"nightly","html_url":"https://github.com/rzlihang/mousqueau/releases/tag/nightly"},
		{"tag_name":"v0.1.5","html_url":"https://github.com/rzlihang/mousqueau/releases/tag/v0.1.5"},
		{"tag_name":"v0.2.0","html_url":"https://evil.example/download"}
	]`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(status)
		w.Write([]byte(body))
	}))
	defer server.Close()

	stable, err := Latest(context.Background(), server.Client(), server.URL, false)
	if err != nil || stable.Version != "0.2.0" || stable.URL != ReleasesPage {
		t.Fatalf("stable: %+v %v", stable, err)
	}
	beta, err := Latest(context.Background(), server.Client(), server.URL, true)
	if err != nil || beta.Version != "0.3.0-beta.1" || beta.URL != ReleasesPage+"/tag/v0.3.0-beta.1" {
		t.Fatalf("beta: %+v %v", beta, err)
	}
	status = http.StatusNotFound
	if none, err := Latest(context.Background(), server.Client(), server.URL, false); err != nil || none.Version != "" {
		t.Fatalf("no releases: %+v %v", none, err)
	}
	status = http.StatusForbidden
	if _, err := Latest(context.Background(), server.Client(), server.URL, false); err == nil {
		t.Fatal("rate limit response accepted")
	}
	status, body = http.StatusOK, `{"message":"unexpected"}`
	if _, err := Latest(context.Background(), server.Client(), server.URL, false); err == nil {
		t.Fatal("malformed response accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := Latest(ctx, server.Client(), server.URL, false); err != context.Canceled {
		t.Fatalf("cancelled request: %v", err)
	}
}
