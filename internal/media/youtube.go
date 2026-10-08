package media

import (
	"context"
	"encoding/json"
	"mousqueau/internal/i18n"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

type Caption struct {
	Language  string   `json:"language"`
	Automatic bool     `json:"automatic"`
	Formats   []string `json:"formats"`
}
type YouTubeInfo struct {
	ID       string    `json:"id"`
	Title    string    `json:"title"`
	Captions []Caption `json:"captions"`
}

var videoID = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)
var languageID = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

func ValidateYouTube(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" {
		return "", i18n.Errorf("use an HTTPS URL for one YouTube video")
	}
	if u.Query().Get("list") != "" {
		return "", i18n.Errorf("playlists and channels are not supported")
	}
	host := strings.ToLower(u.Hostname())
	var id string
	switch host {
	case "youtu.be":
		id = strings.TrimPrefix(u.Path, "/")
	case "youtube.com", "www.youtube.com", "m.youtube.com":
		if u.Path == "/watch" {
			id = u.Query().Get("v")
		} else if strings.HasPrefix(u.Path, "/shorts/") {
			id = strings.TrimPrefix(u.Path, "/shorts/")
		}
	default:
		return "", i18n.Errorf("only youtube.com and youtu.be video URLs are supported")
	}
	if !videoID.MatchString(id) {
		return "", i18n.Errorf("URL must identify a single YouTube video")
	}
	return "https://www.youtube.com/watch?v=" + id, nil
}
func Discover(ctx context.Context, raw string) (YouTubeInfo, error) {
	canonical, err := ValidateYouTube(raw)
	if err != nil {
		return YouTubeInfo{}, err
	}
	ytdlp, ok := Tool("yt-dlp")
	if !ok {
		return YouTubeInfo{}, i18n.Errorf("yt-dlp was not found; install it or set its location in Settings. Local imports still work")
	}
	cmd := command(ctx, ytdlp, "--ignore-config", "--no-playlist", "--skip-download", "--dump-single-json", "--", canonical)
	data, err := cmd.Output()
	if err != nil {
		if ctx.Err() != nil {
			return YouTubeInfo{}, ctx.Err()
		}
		return YouTubeInfo{}, i18n.Errorf("yt-dlp could not discover subtitles; check URL, network, and yt-dlp version")
	}
	type track struct {
		Ext string `json:"ext"`
	}
	var response struct {
		ID        string             `json:"id"`
		Title     string             `json:"title"`
		Subtitles map[string][]track `json:"subtitles"`
		Automatic map[string][]track `json:"automatic_captions"`
	}
	if err := json.Unmarshal(data, &response); err != nil {
		return YouTubeInfo{}, err
	}
	info := YouTubeInfo{ID: response.ID, Title: response.Title, Captions: []Caption{}}
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
				if t.Ext == "srt" || t.Ext == "vtt" {
					if !containsString(formats, t.Ext) {
						formats = append(formats, t.Ext)
					}
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
	canonical, err := ValidateYouTube(raw)
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
func DownloadAudio(ctx context.Context, raw, destination string) error {
	canonical, err := ValidateYouTube(raw)
	if err != nil {
		return err
	}
	ytdlp, hasYTDLP := Tool("yt-dlp")
	ffmpeg, hasFFmpeg := Tool("ffmpeg")
	if !hasYTDLP || !hasFFmpeg {
		return i18n.Errorf("yt-dlp and FFmpeg are required for audio download")
	}
	if !HasExtension(destination, ".m4a") {
		return i18n.Errorf("choose an .m4a destination")
	}
	dir, err := os.MkdirTemp("", "mousqueau-youtube-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(dir)
	cmd := command(ctx, ytdlp, "--ignore-config", "--no-playlist", "--ffmpeg-location", ffmpeg, "--max-filesize", "500M", "-f", "bestaudio", "-x", "--audio-format", "m4a", "-o", filepath.Join(dir, "audio.%(ext)s"), "--", canonical)
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return i18n.Errorf("audio download failed; check authorization, availability and yt-dlp version")
	}
	data, err := os.ReadFile(filepath.Join(dir, "audio.m4a"))
	if err != nil {
		return err
	}
	if ctx.Err() != nil {
		return ctx.Err()
	}
	return SafeNewFile(destination, data)
}
