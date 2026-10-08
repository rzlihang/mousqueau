# Verification performed

Verified on 2026-10-08 in a Linux cloud environment, using Go 1.27.1, Node 24.19.0, Wails v3.0.0-beta.28, and installed FFmpeg.

The editor-layout redesign (waveform, bindings, Go and frontend tests, Chromium smoke) was re-verified the same day in a Linux cloud environment with Go 1.25.0, Node 22.22.0, Wails v3.0.0-beta.28 and FFmpeg; nothing in it was checked in the macOS WebView.

| Check                                                        | Result                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `go test ./internal/...`                                     | PASS: SRT parsing/round-trip/identifiers/timestamps, invalid input, project edits and persistence, undo/redo, stale suggestions, speaker alignment, OpenAI multipart contract/cancellation/size limit, safe file writes, single-video URLs, real FFmpeg extraction and temporary cleanup, waveform peak reduction and real FFmpeg waveform decoding/cancellation |
| `go test -race ./internal/...`                               | PASS                                                                                                                                                                                                                                                                                     |
| `CGO_ENABLED=0 go test -tags server ./...`                   | PASS, including detached service snapshots, explicit upload authorization, busy/cancel state, selected-file media Range requests, and arbitrary-path rejection, waveform from the selected media only without entering the busy state |
| Official `wails3 generate bindings -ts -i -f '-tags=server'` | PASS: 1 service, 19 methods (adds `Waveform`); checked-in generated TypeScript interfaces |
| `npm run typecheck`                                          | PASS                                                                                                                                                                                                                                                                                     |
| `npm test`                                                   | PASS: 7 frontend helper tests (playback boundaries, Traditional Chinese diff, timestamp validation, cue status, search/filter, ruler steps and zoom, waveform peaks) |
| `npm run build`                                              | PASS: Vite production build; advisory bundle-size warning remains for the Ant Design-based application                                                                                                                                                                                   |
| `CGO_ENABLED=0 go build -tags server`                        | PASS                                                                                                                                                                                                                                                                                     |
| Real Chromium + Wails headless smoke                         | PASS: demo, per-suggestion accept, undo, redo, manual text edit, speaker rename, dark theme, optional YouTube dialog; no browser runtime errors                                                                                                                                          |
| Editor-layout Chromium smoke | PASS in headless Chromium against the real Go service in server mode, 1440×900 and 1100×720, light and dark: demo load, local FFmpeg waveform for a generated WebM clip, cue grid/timeline selection, text edit + apply, Ctrl+Z undo, accept suggestion + undo, ruler drag sets the analysis range, play/pause advances the playhead, environment popover; no horizontal overflow or console errors. The clip was preset in a throwaway build because native dialogs cannot run in server mode; Playwright's Chromium cannot decode H.264, so MP4 playback was not covered |
| Real FFmpeg extraction                                       | PASS: generated a 61-second synthetic source, extracted a selected 60-second AAC range, checked output/cleanup and cancellation                                                                                                                                                          |
| Windows cross-compilation (`CGO_ENABLED=0 GOOS=windows go build`) | PASS: binary compiled on Linux; Windows GUI was not tested |
| `go vet -tags server ./...` (CGO disabled) | PASS |
| Native Linux desktop                                         | Not built: GTK4/WebKitGTK 6 development packages are absent                                                                                                                                                                                                                              |
| Native macOS GUI                                             | Not tested: this is a Linux environment                                                                                                                                                                                                                                                  |
| Live OpenAI / YouTube                                        | Not tested: no API credential and no allowed live API/video destinations                                                                                                                                                                                                                 |

The initial headless HTTP test required permission to open local test ports in the sandbox; rerunning with local networking enabled passed. Browser smoke exercised the real Go service through generated Wails bindings, not a frontend-only mock. Native dialogs cannot be exercised in Wails server mode.

## pnpm migration verification

Verified on 2026-10-08 on macOS arm64 using Go 1.27.1, Node 24.21.0, pnpm 12.10.1, and installed FFmpeg:

- `pnpm install --frozen-lockfile`, `pnpm run typecheck`, `pnpm test` (7 tests), and `pnpm run build` passed in `frontend`. The existing bundle-size advisory remains.
- Compared both lockfiles before removing `package-lock.json`: all 149 package/version identities, including platform-specific optional packages, are unchanged. The pnpm workspace config exempts only the imported Rolldown 1.2.13 release and its platform bindings from pnpm's release-age policy, because they were under one day old during migration.
- `node --test scripts/frontend-dependencies.test.mjs` passed (3 tests). Regenerating with `node scripts/notices.mjs` produced a byte-identical `THIRD_PARTY_NOTICES.txt`.
- `go test ./internal/...` and `CGO_ENABLED=0 go test -tags server ./...` passed. `go build -tags production -o /private/tmp/mousqueau-pnpm-check .` compiled the native macOS binary after the final frontend build.
- GitHub Actions configuration now installs the pinned pnpm and caches its store. Docker cross-build configuration uses Node 24 and the pinned pnpm. Neither the remote CI jobs nor the Docker image build were executed during this migration.

These checks do not cover Wails CLI development/packaging or macOS GUI behavior; the acceptance checklist below remains outstanding.

## Ant Design v6 verification

Verified on 2026-10-08 on macOS arm64 with Ant Design 6.6.5, React 18.3.1, Node 24.21.0, and pnpm 12.10.1:

- `pnpm install --frozen-lockfile`, `pnpm run typecheck`, `pnpm test` (7 tests), and `pnpm run build` passed. The production JavaScript bundle is 718.64 kB (236.47 kB gzip); the bundle-size advisory remains.
- Replaced the deprecated `Alert.message` prop with `Alert.title`. The existing custom Tag spacing already uses explicit CSS margins/gaps and requires no migration override.
- Regenerated `THIRD_PARTY_NOTICES.txt` for the changed production dependencies. Added the full MIT license from the `is-mobile` 5.0.0 README as a checked-in fallback; `node --test scripts/frontend-dependencies.test.mjs` passed (3 tests).
- Chrome smoke against the actual Go service in server mode passed: empty state, demo loading, accepting a suggestion, undo restoring original text and status, light/dark rendering, and opening/closing the YouTube modal. The machine has yt-dlp installed, so the missing-yt-dlp Alert branch was typechecked but not exercised in this smoke.
- `go build -tags production -o /private/tmp/mousqueau-antd6-check .` compiled the native macOS binary with the updated frontend assets.

This browser smoke does not verify the macOS desktop WebView, native dialogs, media playback, or live analysis/downloads. Remote CI has not run for this upgrade.

## Mac acceptance checklist (still outstanding)

1. Follow README setup on a real Mac. Confirm `wails3 dev` opens a desktop window and badges reflect `PATH`/key configuration.
2. Import a known MP4 and UTF-8 SRT. Confirm visual playback, audio, seeking, scroll-follow, multiline text, and timestamp edits.
3. Assign A/B/C and multiple speakers, undo/redo, save a new JSON file, reopen, and check speaker names/history/original cues.
4. Export to a new SRT and parse/watch it in an external player. Attempt exporting over the source and verify refusal.
5. With a configured key, select 60–300 seconds, approve upload, inspect diarized timestamps and proposals. Reject one, accept another, and verify undo. Test cancel during extraction and upload, missing FFmpeg/key, and an API rejection.
6. With current yt-dlp/FFmpeg, discover a video with manual and automatic captions, prefer the manual track, and import it. Separately approve an authorized audio download and confirm it does not trigger an API upload. Reject playlist/channel URLs.
7. Check the hidden-inset title bar: traffic lights do not overlap the project title, the toolbar drags the window while its buttons still click, and ⌘Z / ⇧⌘Z undo and redo outside text fields. Import a full-length episode and confirm the waveform appears without blocking editing.
8. Test unsupported media, moved media paths, unsaved field edits, theme switching, window resize/close, and the packaged `.app` launched from a configured shell.
9. Build/package on macOS, check embedded license notices, and configure developer signing/notarization before a public release.

CI includes a native macOS compilation job; its future result must be checked in GitHub and does not establish GUI testing.
