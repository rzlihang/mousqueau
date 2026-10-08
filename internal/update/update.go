// Package update asks GitHub which releases exist. It sends nothing but the
// request itself and never downloads a release.
package update

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	Endpoint     = "https://api.github.com/repos/rzlihang/mousqueau/releases?per_page=30"
	ReleasesPage = "https://github.com/rzlihang/mousqueau/releases"
)

type Release struct {
	Version string
	URL     string
}

// Latest returns the highest published release, or a zero Release when there
// is none. Prereleases only count when beta is set; drafts never do.
func Latest(ctx context.Context, client *http.Client, endpoint string, beta bool) (Release, error) {
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	if endpoint == "" {
		endpoint = Endpoint
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return Release{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := client.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return Release{}, ctx.Err()
		}
		return Release{}, fmt.Errorf("cannot reach GitHub; check your connection")
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return Release{}, nil
	}
	if resp.StatusCode != http.StatusOK {
		return Release{}, fmt.Errorf("GitHub did not return release information (HTTP %d)", resp.StatusCode)
	}
	var releases []struct {
		Tag        string `json:"tag_name"`
		URL        string `json:"html_url"`
		Draft      bool   `json:"draft"`
		Prerelease bool   `json:"prerelease"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4_000_000)).Decode(&releases); err != nil {
		return Release{}, fmt.Errorf("invalid release information from GitHub")
	}
	var best Release
	for _, r := range releases {
		if r.Draft || (r.Prerelease && !beta) {
			continue
		}
		if _, _, ok := parse(r.Tag); !ok {
			continue
		}
		if best.Version == "" || Newer(best.Version, r.Tag) {
			best = Release{Version: strings.TrimPrefix(r.Tag, "v"), URL: r.URL}
		}
	}
	// Only ever send the user to this project's own release pages.
	if !strings.HasPrefix(best.URL, ReleasesPage+"/") {
		best.URL = ReleasesPage
	}
	return best, nil
}

// Newer reports whether candidate is a later semantic version than current.
func Newer(current, candidate string) bool {
	a, apre, ok := parse(current)
	if !ok {
		return false
	}
	b, bpre, ok := parse(candidate)
	if !ok {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return b[i] > a[i]
		}
	}
	return comparePrerelease(apre, bpre) < 0
}

func parse(version string) ([3]int, []string, bool) {
	var core [3]int
	version = strings.TrimPrefix(strings.TrimSpace(version), "v")
	version, _, _ = strings.Cut(version, "+")
	version, pre, hasPre := strings.Cut(version, "-")
	parts := strings.Split(version, ".")
	if len(parts) != 3 {
		return core, nil, false
	}
	for i, part := range parts {
		n, err := strconv.Atoi(part)
		if err != nil || n < 0 {
			return core, nil, false
		}
		core[i] = n
	}
	if !hasPre {
		return core, nil, true
	}
	return core, strings.Split(pre, "."), true
}

// comparePrerelease orders as semver does: a release outranks its
// prereleases, numeric identifiers compare as numbers and rank below text.
func comparePrerelease(a, b []string) int {
	if len(a) == 0 || len(b) == 0 {
		return len(b) - len(a)
	}
	for i := 0; i < len(a) && i < len(b); i++ {
		an, aerr := strconv.Atoi(a[i])
		bn, berr := strconv.Atoi(b[i])
		switch {
		case aerr == nil && berr == nil:
			if an != bn {
				return an - bn
			}
		case aerr == nil:
			return -1
		case berr == nil:
			return 1
		default:
			if c := strings.Compare(a[i], b[i]); c != 0 {
				return c
			}
		}
	}
	return len(a) - len(b)
}
