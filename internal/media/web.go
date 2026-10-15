package media

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"math"
	"mousqueau/internal/i18n"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// Downloads from video pages go through the user's yt-dlp. Any site it
// supports works; one video at a time, never a playlist or channel.

type Caption struct {
	Language  string   `json:"language"`
	Automatic bool     `json:"automatic"`
	Formats   []string `json:"formats"`
}
type WebInfo struct {
	ID       string    `json:"id"`
	Title    string    `json:"title"`
	Site     string    `json:"site"`
	Duration float64   `json:"duration"`
	Captions []Caption `json:"captions"`
}

// Media kinds a page can be downloaded as.
const (
	WebAudio = "audio"
	WebVideo = "video"
)

var videoID = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)
var languageID = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

// ValidateURL accepts an HTTPS link to one video page. YouTube links are
// reduced to the video itself so a playlist parameter cannot widen them.
func ValidateURL(raw string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme != "https" || u.User != nil || u.Hostname() == "" {
		return "", i18n.Errorf("use an HTTPS link to one video page")
	}
	switch strings.ToLower(u.Hostname()) {
	case "youtu.be", "youtube.com", "www.youtube.com", "m.youtube.com":
		return canonicalYouTube(u)
	}
	u.Fragment = ""
	return u.String(), nil
}
func canonicalYouTube(u *url.URL) (string, error) {
	if u.Query().Get("list") != "" {
		return "", i18n.Errorf("playlists and channels are not supported")
	}
	var id string
	if strings.EqualFold(u.Hostname(), "youtu.be") {
		id = strings.TrimPrefix(u.Path, "/")
	} else if u.Path == "/watch" {
		id = u.Query().Get("v")
	} else if strings.HasPrefix(u.Path, "/shorts/") {
		id = strings.TrimPrefix(u.Path, "/shorts/")
	}
	if !videoID.MatchString(id) {
		return "", i18n.Errorf("playlists and channels are not supported")
	}
	return "https://www.youtube.com/watch?v=" + id, nil
}
func Discover(ctx context.Context, raw string) (WebInfo, error) {
	canonical, err := ValidateURL(raw)
	if err != nil {
		return WebInfo{}, err
	}
	ytdlp, ok := Tool("yt-dlp")
	if !ok {
		return WebInfo{}, i18n.Errorf("yt-dlp was not found; install it or set its location in Settings. Local imports still work")
	}
	cmd := command(ctx, ytdlp, "--ignore-config", "--no-playlist", "--skip-download", "--dump-single-json", "--", canonical)
	data, err := cmd.Output()
	if err != nil {
		if ctx.Err() != nil {
			return WebInfo{}, ctx.Err()
		}
		return WebInfo{}, i18n.Errorf("yt-dlp could not read this page; check the link, network and yt-dlp version")
	}
	return parseInfo(data)
}

type track struct {
	Ext string `json:"ext"`
}

func parseInfo(data []byte) (WebInfo, error) {
	var response struct {
		Type      string             `json:"_type"`
		ID        string             `json:"id"`
		Title     string             `json:"title"`
		Site      string             `json:"extractor_key"`
		Domain    string             `json:"webpage_url_domain"`
		Duration  float64            `json:"duration"`
		Subtitles map[string][]track `json:"subtitles"`
		Automatic map[string][]track `json:"automatic_captions"`
	}
	if err := json.Unmarshal(data, &response); err != nil {
		return WebInfo{}, err
	}
	if response.Type == "playlist" || response.Type == "multi_video" {
		return WebInfo{}, i18n.Errorf("playlists and channels are not supported")
	}
	// The domain reads as people know the site; the extractor name
	// ("Youtube", "Generic") only stands in when yt-dlp gives none.
	site := strings.TrimPrefix(response.Domain, "www.")
	if site == "" && response.Site != "Generic" {
		site = response.Site
	}
	info := WebInfo{ID: response.ID, Title: response.Title, Site: site, Duration: response.Duration, Captions: []Caption{}}
	for _, automatic := range []bool{false, true} {
		tracks := response.Subtitles
		if automatic {
			tracks = response.Automatic
		}
		langs := []string{}
		for lang := range tracks {
			langs = append(langs, lang)
		}
		sort.Strings(langs)
		for _, lang := range langs {
			formats := []string{}
			for _, t := range tracks[lang] {
				if (t.Ext == "srt" || t.Ext == "vtt") && !containsString(formats, t.Ext) {
					formats = append(formats, t.Ext)
				}
			}
			if len(formats) > 0 {
				info.Captions = append(info.Captions, Caption{Language: lang, Automatic: automatic, Formats: formats})
			}
		}
	}
	return info, nil
}
func containsString(values []string, value string) bool {
	for _, v := range values {
		if v == value {
			return true
		}
	}
	return false
}
func DownloadCaption(ctx context.Context, raw, language string, automatic bool) ([]byte, error) {
	canonical, err := ValidateURL(raw)
	if err != nil {
		return nil, err
	}
	if !languageID.MatchString(language) {
		return nil, i18n.Errorf("invalid subtitle language")
	}
	ytdlp, ok := Tool("yt-dlp")
	if !ok {
		return nil, i18n.Errorf("yt-dlp is missing")
	}
	ffmpeg, ok := Tool("ffmpeg")
	if !ok {
		return nil, i18n.Errorf("FFmpeg is required for subtitle conversion")
	}
	dir, err := os.MkdirTemp("", "mousqueau-captions-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(dir)
	flag := "--write-subs"
	if automatic {
		flag = "--write-auto-subs"
	}
	cmd := command(ctx, ytdlp, "--ignore-config", "--no-playlist", "--ffmpeg-location", ffmpeg, "--skip-download", flag, "--sub-langs", language, "--sub-format", "srt/vtt", "--convert-subs", "srt", "-o", filepath.Join(dir, "caption.%(ext)s"), "--", canonical)
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, i18n.Errorf("subtitle download failed; verify the selected track is still available")
	}
	paths, _ := filepath.Glob(filepath.Join(dir, "*.srt"))
	if len(paths) != 1 {
		return nil, i18n.Errorf("no unique SRT subtitle downloaded")
	}
	return os.ReadFile(paths[0])
}

// MediaExtension is the file type a download of kind is saved as: MP4 with
// H.264 where the site offers it, so every platform's web view can play it.
func MediaExtension(kind string) (string, bool) {
	switch kind {
	case WebAudio:
		return ".m4a", true
	case WebVideo:
		return ".mp4", true
	}
	return "", false
}
func mediaArgs(kind string) []string {
	if kind == WebAudio {
		return []string{"--max-filesize", "500M", "-f", "bestaudio", "-x", "--audio-format", "m4a"}
	}
	return []string{"--max-filesize", "4G", "-f", "bv*[height<=1080]+ba/b[height<=1080]/b", "-S", "vcodec:h264,acodec:aac,ext:mp4:m4a", "--merge-output-format", "mp4", "--remux-video", "mp4"}
}

// DownloadMedia saves the page's audio or video to destination, which must
// not exist yet. progress receives a fraction for each stream yt-dlp fetches
// (video, then audio), or -1 while the size is unknown.
func DownloadMedia(ctx context.Context, raw, kind, destination string, progress func(float64)) error {
	canonical, err := ValidateURL(raw)
	if err != nil {
		return err
	}
	ext, ok := MediaExtension(kind)
	if !ok {
		return i18n.Errorf("choose audio or video")
	}
	if !HasExtension(destination, ext) {
		return i18n.Errorf("choose a %s destination", ext)
	}
	ytdlp, hasYTDLP := Tool("yt-dlp")
	ffmpeg, hasFFmpeg := Tool("ffmpeg")
	if !hasYTDLP || !hasFFmpeg {
		return i18n.Errorf("yt-dlp and FFmpeg are required for downloads")
	}
	// Reserve the name first so an existing file is never replaced, and
	// download beside it so the finished file is renamed, not copied.
	reserved, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		if os.IsExist(err) {
			return i18n.Errorf("destination already exists; choose a new filename to preserve original files")
		}
		return err
	}
	reserved.Close()
	done := false
	defer func() {
		if !done {
			_ = os.Remove(destination)
		}
	}()
	dir, err := os.MkdirTemp(filepath.Dir(destination), ".mousqueau-download-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(dir)
	args := append([]string{"--ignore-config", "--no-playlist", "--ffmpeg-location", ffmpeg, "--quiet", "--progress", "--newline",
		"--progress-template", "download:" + progressPrefix + "%(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s"},
		mediaArgs(kind)...)
	args = append(args, "-o", filepath.Join(dir, "media.%(ext)s"), "--", canonical)
	cmd := command(ctx, ytdlp, args...)
	out, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	readProgress(out, progress)
	if err := cmd.Wait(); err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return i18n.Errorf("download failed; check authorization, availability and yt-dlp version")
	}
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if err := os.Rename(filepath.Join(dir, "media"+ext), destination); err != nil {
		return i18n.Errorf("download failed; check authorization, availability and yt-dlp version")
	}
	done = true
	return nil
}

const progressPrefix = "mousqueau-progress "

func readProgress(r io.Reader, progress func(float64)) {
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		if fraction, ok := parseProgress(scanner.Text()); ok && progress != nil {
			progress(fraction)
		}
	}
	_, _ = io.Copy(io.Discard, r)
}
func parseProgress(line string) (float64, bool) {
	rest, ok := strings.CutPrefix(line, progressPrefix)
	if !ok {
		return 0, false
	}
	fields := strings.Fields(rest)
	if len(fields) != 3 {
		return 0, false
	}
	done, err := strconv.ParseFloat(fields[0], 64)
	if err != nil {
		return -1, true
	}
	for _, f := range fields[1:] {
		if total, err := strconv.ParseFloat(f, 64); err == nil && total > 0 {
			return math.Min(1, done/total), true
		}
	}
	return -1, true
}

// FileName turns a page title into a safe default file name.
func FileName(title, ext string) string {
	name := strings.Map(func(r rune) rune {
		if r < 32 || strings.ContainsRune(`<>:"/\|?*`, r) {
			return '_'
		}
		return r
	}, strings.TrimSpace(title))
	name = strings.Trim(name, ". ")
	if r := []rune(name); len(r) > 80 {
		name = string(r[:80])
	}
	if name == "" {
		name = "download"
	}
	return name + ext
}
