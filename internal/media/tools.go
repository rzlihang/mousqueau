package media

import (
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
)

var (
	toolMu      sync.RWMutex
	toolCustom  = map[string]string{}
	toolFolders = []string{"/opt/homebrew/bin", "/usr/local/bin"}
)

// SetToolPath pins an external tool to one location; an empty path returns to
// automatic detection.
func SetToolPath(name, path string) {
	toolMu.Lock()
	defer toolMu.Unlock()
	if path == "" {
		delete(toolCustom, name)
	} else {
		toolCustom[name] = path
	}
}

// Tool returns the executable to run for name. A configured location is used
// alone, so a wrong one is reported instead of silently replaced. Otherwise
// PATH is searched, then Homebrew and /usr/local/bin, which applications
// launched from Finder do not have on PATH.
func Tool(name string) (string, bool) {
	toolMu.RLock()
	custom := toolCustom[name]
	toolMu.RUnlock()
	if custom != "" {
		if !filepath.IsAbs(custom) {
			return custom, false
		}
		_, err := exec.LookPath(custom)
		return custom, err == nil
	}
	if path, err := exec.LookPath(name); err == nil {
		if abs, err := filepath.Abs(path); err == nil {
			return abs, true
		}
	}
	if runtime.GOOS != "windows" {
		for _, dir := range toolFolders {
			if path, err := exec.LookPath(filepath.Join(dir, name)); err == nil {
				return path, true
			}
		}
	}
	return "", false
}

func Dependency(name string) bool { _, ok := Tool(name); return ok }
