# Mousqueau v0.1

A Wails v3 desktop application for correcting **existing SRT subtitles** and reviewing speaker identities in conversations. Go + React/TypeScript + Vite + Ant Design v6, bootstrapped from the official Wails v3 React template and pinned to `v3.0.0-beta.28`. macOS is the first target; the core is portable to Windows and Linux.

![Mousqueau editor with mock Traditional Chinese diarization](docs/editor-preview.png)

## Develop on macOS

Requirements: Go **1.25+**, Node **24 LTS**, pnpm **12.10.1** (pinned in `frontend/package.json`), Xcode Command Line Tools, and optionally FFmpeg / yt-dlp. No API key is required for editing.

If Vite+ manages your environment, it reads the pnpm pin in `frontend/package.json`; run `vp install --frozen-lockfile` from `frontend`. A global Vite+ installation is optional: the Wails tasks and CI invoke pnpm directly. To install the pinned pnpm with Node/npm, run `npm install --global pnpm@12.10.1`.

```sh
xcode-select --install
brew install go node ffmpeg
# Optional: YouTube import (install independently of Mousqueau)
brew install yt-dlp

go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.28
# Ensure $(go env GOPATH)/bin is on PATH.
cd frontend
pnpm install --frozen-lockfile
cd ..
wails3 dev
```

For AI analysis, either save an API key under **设置 › 供应商** (⌘,), which stores it in the macOS keychain, or set `OPENAI_API_KEY` in the environment of the **Go application** before launching; the environment variable wins when both exist. The key is typed once into the settings or welcome window and handed to Go; it is never written to project or settings files and never returned to the frontend. The application does not read `.env` files. Launching a packaged app through Finder generally does not inherit terminal exports, so use the keychain there. Key storage is macOS-only; other platforms use the environment variable.

```sh
export OPENAI_API_KEY='your-key'
wails3 dev
```

FFmpeg and yt-dlp are looked up on that process's `PATH`, then in `/opt/homebrew/bin` and `/usr/local/bin`; **设置 › 外部工具** can pin either to another location. The first launch opens a short welcome window (theme, external tools, optional OpenAI key) that can be run again from Settings. Preferences are kept in `settings.json` under the user configuration directory (`~/Library/Application Support/Mousqueau` on macOS). Update checks only read this repository's GitHub release list, at most once a day when automatic checking is on, and never download anything. Hover the environment indicator at the left of the status bar for dependency/configuration availability. The interface is in Simplified Chinese or US English. By default it follows the macOS preferred languages (a language set for Mousqueau under System Settings › General › Language & Region › Applications comes first), uses Simplified Chinese for every Chinese variant and English for anything else; **设置 › 通用 › 语言** (Settings › General › Language) fixes it instead. The menu bar, window titles, file dialogs, progress and error messages switch with it. A change of the system language applies on the next launch. Linux desktop builds require GTK4 and WebKitGTK 6 development packages; Windows requires the WebView2 runtime. See the [Wails setup guide](https://v3.wails.io/getting-started/installation/). The server build described below is only for local testing, not a deployed service.

## Use the editor

1. **导入媒体**: select a local video or audio file. MP4/H.264/AAC is the most portable playback format. Native WebView codecs determine whether other formats play.
2. **导入 SRT**: select UTF-8 SRT subtitles. Identifiers, millisecond timestamps, and multiline text are preserved in the project. The window follows a video-editor layout: cue list (with text search and a 待处理／Unknown filter), viewer with the current subtitle overlaid, inspector, and a timeline with the audio waveform, subtitle blocks, speaker and suggestion tracks. Click a cue row or block to pause and seek; click the ruler or waveform to move the playhead. Playback follows the current cue when there are no pending field edits. The waveform is decoded locally by FFmpeg and needs FFmpeg on `PATH`; nothing is uploaded for it.
3. Change text, start/end (`HH:MM:SS,mmm`), or speaker annotations in the inspector's **编辑** tab and click **套用编辑**. Add A/B/C or other speaker identities in the **说话人** tab. An unassigned cue shows **Unknown**. One cue can have multiple speakers. Undo/redo (toolbar, ⌘Z / ⇧⌘Z, or Ctrl+Z / Ctrl+Shift+Z outside text fields) covers edits, speaker names, analysis results, and accept/reject decisions; the last 100 undo snapshots are retained.
4. Optionally select **60–300 seconds** by dragging on the timeline ruler or with **调整范围**, and explicitly confirm **上传所选音频并分析**. Go extracts mono AAC using FFmpeg, limits uploads to 24 MB, and requests OpenAI `gpt-4o-transcribe-diarize` with `diarized_json`, `chunking_strategy=auto`, and `language=zh`. API calls and subprocesses can be cancelled. Cancellation discards pending results; it cannot recall bytes already sent or cancel provider billing.
5. Compare original text with transcription suggestions and highlighted changes in the **校正建议** tab, or for the selected cue under **编辑**. Accept or reject individually. Review flags identify multiple speakers, overlap, and segments crossing a cue/range boundary. Suggestions **never silently modify text or speakers**. Accepting a stale suggestion after a manual text change is refused; analyze again or edit manually.
6. **保存项目** writes JSON with immutable original cues, editable cues, speaker mappings, transcription segments, suggestions, and undo/redo history. **开启项目** restores it. The local media path is saved; if the file moved, reimport it. Projects contain transcripts and local paths, but not API keys.
7. **导出 SRT** writes the edited text/times without speaker metadata. Both saves and exports require a **new filename**: existing destinations are refused, including hardlinks/symlinks to source files. Originals are never overwritten. Keep a JSON project to retain speaker information and history.

Use **载入示例** for a Traditional Chinese conversation and mock diarization without an API key. The third cue deliberately includes overlapping speakers. The UI follows the system appearance by default and can be fixed to light or dark in Settings. Existing UTF-8 Traditional Chinese text is preserved. Taiwan Mandarin audio is processed with Chinese-language transcription; OpenAI can still return Simplified Chinese or misrecognize names. Verify wording and script before accepting. The diarization model does not support a transcription prompt, so v0.1 does not invent a prompt-based Traditional Chinese guarantee or apply stylistic rewriting.

## Optional YouTube import

Open **YouTube 导入** and enter an HTTPS URL for one video. **发现字幕** lists manual tracks before automatic captions; select a track and explicitly download/import it. `yt-dlp` and FFmpeg convert supported SRT/VTT captions to SRT. Import replaces the active subtitle project after confirmation.

Audio is downloaded only through a separate action after you confirm you have authorization. Choose a new `.m4a` destination; it becomes the local media source. Downloading does not upload anything to OpenAI. Videos with playlists, channels, and batch downloading are excluded. Availability depends on yt-dlp, the network, and the video; authenticated/cookie-based downloads are outside v0.1. Full YouTube support in current yt-dlp releases may also require its documented JavaScript runtime/EJS dependencies. Local file imports remain independent of yt-dlp.

## Tests and builds

```sh
go test ./internal/...
cd frontend
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run build
cd ..
node --test scripts/frontend-dependencies.test.mjs
# Native macOS desktop build / app bundle
wails3 build
wails3 package
```

Wails defaults to pnpm for dependency installation and frontend scripts. Commit `frontend/pnpm-lock.yaml` with dependency changes; routine builds use the frozen lockfile. This migration retains the existing dependency versions and Vite/Vitest configuration.

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
