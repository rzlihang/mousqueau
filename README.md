# Mousqueau v0.1

A Wails v3 desktop application for correcting **existing SRT subtitles** and reviewing speaker identities in conversations. Go + React/TypeScript + Vite + Ant Design, bootstrapped from the official Wails v3 React template and pinned to `v3.0.0-beta.28`. macOS is the first target; the core is portable to Windows and Linux.

![Mousqueau editor with mock Traditional Chinese diarization](docs/editor-preview.png)

## Develop on macOS

Requirements: Go **1.25+**, Node **24 LTS**, Xcode Command Line Tools, and optionally FFmpeg / yt-dlp. No API key is required for editing.

```sh
xcode-select --install
brew install go node ffmpeg
# Optional: YouTube import (install independently of Mousqueau)
brew install yt-dlp

go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.28
# Ensure $(go env GOPATH)/bin is on PATH.
cd frontend
npm ci
cd ..
wails3 dev
```

For AI analysis, set `OPENAI_API_KEY` in the environment of the **Go application** before launching. The application does not read `.env` files or collect keys in the browser. Launching a packaged app through Finder generally does not inherit terminal exports; launch its executable from the configured shell when using the initial environment-variable configuration.

```sh
export OPENAI_API_KEY='your-key'
wails3 dev
```

FFmpeg and yt-dlp must also be on that process's `PATH`. Check the status badges for dependency/configuration availability. Linux desktop builds require GTK4 and WebKitGTK 6 development packages; Windows requires the WebView2 runtime. See the [Wails setup guide](https://v3.wails.io/getting-started/installation/). The server build described below is only for local testing, not a deployed service.

## Use the editor

1. **导入媒体**: select a local video or audio file. MP4/H.264/AAC is the most portable playback format. Native WebView codecs determine whether other formats play.
2. **导入 SRT**: select UTF-8 SRT subtitles. Identifiers, millisecond timestamps, and multiline text are preserved in the project. Click a cue to pause and seek; playback follows the current cue when there are no pending field edits.
3. Change text, start/end (`HH:MM:SS,mmm`), or speaker annotations and click **套用编辑**. Add A/B/C or other speaker identities in the right panel. An unassigned cue shows **Unknown**. One cue can have multiple speakers. Undo/redo covers edits, speaker names, analysis results, and accept/reject decisions; the last 100 undo snapshots are retained.
4. Optionally select **60–300 seconds** and explicitly confirm **上传所选音频并分析**. Go extracts mono AAC using FFmpeg, limits uploads to 24 MB, and requests OpenAI `gpt-4o-transcribe-diarize` with `diarized_json`, `chunking_strategy=auto`, and `language=zh`. API calls and subprocesses can be cancelled. Cancellation discards pending results; it cannot recall bytes already sent or cancel provider billing.
5. Compare original text with transcription suggestions and highlighted changes. Accept or reject individually. Review flags identify multiple speakers, overlap, and segments crossing a cue/range boundary. Suggestions **never silently modify text or speakers**. Accepting a stale suggestion after a manual text change is refused; analyze again or edit manually.
6. **保存项目** writes JSON with immutable original cues, editable cues, speaker mappings, transcription segments, suggestions, and undo/redo history. **开启项目** restores it. The local media path is saved; if the file moved, reimport it. Projects contain transcripts and local paths, but not API keys.
7. **导出 SRT** writes the edited text/times without speaker metadata. Both saves and exports require a **new filename**: existing destinations are refused, including hardlinks/symlinks to source files. Originals are never overwritten. Keep a JSON project to retain speaker information and history.

Use **载入示例** for a Traditional Chinese conversation and mock diarization without an API key. The third cue deliberately includes overlapping speakers. The UI supports light/dark themes. Existing UTF-8 Traditional Chinese text is preserved. Taiwan Mandarin audio is processed with Chinese-language transcription; OpenAI can still return Simplified Chinese or misrecognize names. Verify wording and script before accepting. The diarization model does not support a transcription prompt, so v0.1 does not invent a prompt-based Traditional Chinese guarantee or apply stylistic rewriting.

## Optional YouTube import

Open **YouTube 导入** and enter an HTTPS URL for one video. **发现字幕** lists manual tracks before automatic captions; select a track and explicitly download/import it. `yt-dlp` and FFmpeg convert supported SRT/VTT captions to SRT. Import replaces the active subtitle project after confirmation.

Audio is downloaded only through a separate action after you confirm you have authorization. Choose a new `.m4a` destination; it becomes the local media source. Downloading does not upload anything to OpenAI. Videos with playlists, channels, and batch downloading are excluded. Availability depends on yt-dlp, the network, and the video; authenticated/cookie-based downloads are outside v0.1. Full YouTube support in current yt-dlp releases may also require its documented JavaScript runtime/EJS dependencies. Local file imports remain independent of yt-dlp.

## Tests and builds

```sh
go test ./internal/...
cd frontend
npm ci
npm run typecheck
npm test
npm run build
cd ..
# Native macOS desktop build / app bundle
wails3 build
wails3 package
```

Bindings are checked in and generated from Go service signatures. Regenerate after changing a service method:

```sh
wails3 generate bindings -ts -i
```

For headless Linux verification without GTK/WebKit, build the frontend first, then:

```sh
CGO_ENABLED=0 wails3 generate bindings -ts -i -f '-tags=server'
CGO_ENABLED=0 go test -tags server ./...
CGO_ENABLED=0 go build -tags server -o /tmp/mousqueau-headless .
WAILS_SERVER_HOST=127.0.0.1 WAILS_SERVER_PORT=9246 /tmp/mousqueau-headless
```

The headless build uses real Wails bindings and allows a browser to exercise the editor/demo; native file dialogs are unsupported there. Keep it on loopback: this is a desktop application, not a remotely hosted authenticated service. Never claim this verifies macOS GUI behavior. CI checks core/frontend/server and builds a native macOS binary; automated builds also do not replace Mac GUI testing.

See [verification and Mac checklist](docs/verification.md), [architecture](docs/architecture.md), and [limitations / v0.2](docs/limitations.md).

## License

Original Mousqueau code: **MIT**. yt-dlp and FFmpeg are separate, user-installed CLI dependencies and are not bundled. yt-dlp source is Unlicense, but some executable distributions contain GPLv3+ code. See the [licensing decision](docs/licensing.md) and `THIRD_PARTY_NOTICES.txt`; include the notices in distributions. Regenerate with `node scripts/notices.mjs` after installing dependencies.
