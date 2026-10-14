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

## macOS overscroll preview

On 2026-10-08, a user reported white strips at the top/bottom of the native window during trackpad scrolling. The outer document previously had neither scroll containment nor a theme background; only the internal `.shell` clipped overflow.

The fix anchors the body to the viewport, prevents document overscroll and pane scroll chaining, and synchronizes the light/dark theme to the document background before paint. Typecheck, all 7 frontend tests, the production frontend build, and native macOS compilation passed. A separate native `Mousqueau Scroll Preview` app loaded the demo and rendered in dark mode; simulated upward/downward scrolling showed no white strips in the captured result. The user then tested physical trackpad scrolling in that native preview and confirmed the white strips had disappeared. The original preview window was preserved. This confirms the reported issue on this Mac, not the full Mac acceptance checklist below.

## Settings and welcome windows

Verified on 2026-10-08 on macOS arm64 with Go 1.27.1, Node 24.21.0, pnpm 12.10.1, Wails v3.0.0-beta.28:

- `go vet -tags server ./...`, `CGO_ENABLED=0 go test -tags server ./...` (31 tests) and `go test -race ./internal/...` passed. New coverage: settings defaults/round trip/damaged file, tool lookup order and invalid configured locations, API key validation, release selection (drafts, prereleases, foreign URLs, HTTP errors, cancellation) and version ordering, and at the service level key precedence without exposing the key, tool changes refused while processing, update check against a local server, the one-time setup action, and reopening the last project.
- Bindings regenerated with `wails3 generate bindings -ts -i -f '-tags=server'`: 1 service, 34 methods.
- `pnpm run typecheck`, `pnpm test` (11 tests) and `pnpm run build` passed; `go build -tags production` compiled the native binary.
- Headless Chrome against the real Go service in server mode, with an isolated home directory: the settings window (760×540) and welcome window (760×520) rendered in light and dark without overflow or runtime errors; sidebar scroll tracking, section jumps, search filtering, theme switching, the four welcome steps, the missing-key warning, and the "载入示例" hand-over to the editor all worked. The editor's environment popover shows the settings link and no longer has a theme switch.
- The `/usr/bin/security` commands the keychain package uses were round-tripped once by hand with a throwaway item (add through stdin, read, delete, exit status 44 when absent).

A later review of this branch found four problems, since fixed with tests: a tool location that failed to save still took effect, concurrent key saves and removals could leave the cached key out of step with the keychain, a service test read the real keychain (it now uses an in-memory store), and the welcome window's "offline only" option claimed more than it did when a key already existed (it is now labelled as keeping the current configuration). The service suite has 32 tests.

Not verified: anything that needs native windows. Server mode has no windows, menus, or file dialogs, so the hidden editor during first launch, the welcome window's close behaviour, ⌘, and the 设置… menu item, fixed window sizes and disabled buttons, the "选择…" tool dialog, saving a real key from the app, opening the release page, and a live GitHub check are all untested.

## Interface language (Simplified Chinese / US English)

Verified on 2026-10-08 in a Linux cloud environment with Go 1.25.0, Node 22.22.0, pnpm 12.10.1 and Wails v3.0.0-beta.28; nothing here ran on a Mac.

- `go test -race ./internal/...`, `CGO_ENABLED=0 go test -tags server ./...`, `CGO_ENABLED=0 go vet -tags server ./...`, `GOOS=darwin go vet ./internal/...` and `CGO_ENABLED=0 GOOS=windows go build -tags server` passed. New coverage: locale resolution (system list, explicit choice, Chinese variants, unsupported languages), `AppleLanguages` and POSIX locale parsing, errors that follow the current language and still wrap with `%w`, a source scan that requires a Chinese entry with matching verbs for every translatable Go string, settings validation, and at the service level `SetLanguage` changing the locale, an error, a progress message and the saved setting.
- Bindings regenerated with `wails3 generate bindings -ts -i -f '-tags=server'`: 1 service, 35 methods (adds `SetLanguage`).
- `pnpm run typecheck`, `pnpm test` (15 tests, including identical dictionary shapes and no Chinese left in English) and `pnpm run build` passed.
- Headless Chromium against the real Go service in server mode, with isolated configuration directories: with `LANG=en_US.UTF-8` the editor, settings and welcome windows rendered in English and `<html lang>` was `en-US`; with `LANG=zh_CN.UTF-8` they rendered in Chinese with the existing wording. Choosing 简体中文 in the English settings window switched that window and the already open editor without reloading, and saved `"language": "zh-CN"`. Searching "keychain" in the Chinese settings found the provider section. At 1100×720 neither language overflows the toolbar or timeline toolbar. No console errors.

Not verified: everything native. The translated menu bar and its rebuild on a language change, window titles, file dialog titles, `defaults read` against a real macOS language list, the per-application language from System Settings, and whether `CFBundleLocalizations` makes AppKit's own items (Start Dictation, Emoji & Symbols, the Services list, the About panel) follow the system language all need a Mac. The darwin build of the root package needs cgo and was not compiled here.

## Traditional Chinese, mainland wording, subtitle font, no Help menu

Verified on 2026-10-08 in a Linux cloud environment with Go 1.25.0, Node 22.22.0, pnpm 12.10.1 and Wails v3.0.0-beta.28; nothing here ran on a Mac.

- `go test ./internal/...`, `CGO_ENABLED=0 go test -tags server ./...` and `CGO_ENABLED=0 go vet -tags server ./...` passed. New coverage: Traditional/Simplified selection from script and region (`zh-Hant-HK`, `zh-Hans-TW`, `zh_TW`, `zh-SG`, bare `zh`), both catalogs complete with matching verbs, font name validation (CJK names accepted; quotes, backslashes, semicolons, braces, angle brackets, control characters and names over 100 characters refused) and its fallback when loading settings, and at the service level a Traditional Chinese error after choosing the system language on a `zh-Hant-TW` system plus saving, refusing and clearing the subtitle font.
- Bindings regenerated: 1 service, 36 methods (adds `SetSubtitleFont`).
- `pnpm run typecheck`, `pnpm test` (17 tests: identical shapes for all three dictionaries, no Taiwan terms such as 本机/开启/载入/套用 in zh-CN, no Simplified-only characters in zh-TW, font stacks, trilingual settings search) and `pnpm run build` passed.
- Headless Chromium against the real Go service in server mode: with `LANG=zh_TW.UTF-8` the editor and settings rendered in Traditional Chinese with `<html lang="zh-TW">`; with `LANG=zh_CN.UTF-8` the toolbar reads 导入媒体 / 导入 SRT / YouTube 导入 / 加载示例 / 打开项目 / 保存项目 / 导出 SRT. Choosing Songti TC and then typing "My Font" in the settings window changed the cue list font in the open editor without reloading and was saved; `Bad"; x` was refused with the Traditional Chinese error and the field reverted.

After merging the Windows and Linux desktop work (2026-10-10), its new text was brought into the three languages: the key store names (keychain, Credential Manager, keyring), the tool search paths, the frameless window controls, and the Linux and Windows key store errors. `go test ./internal/...`, `CGO_ENABLED=0 go test -tags server ./...`, `GOOS=windows go vet` / `go test -c`, `pnpm test` (17 tests), `pnpm run build` and `node --test scripts/frontend-dependencies.test.mjs` passed; in headless Chromium with `?chrome=custom` the window controls read 縮到最小 / 放到最大 / 關閉 and Minimize / Maximize / Close, and the tool hints name the Linux search path. The native Windows and Linux windows were not run after the merge; CI's `linux-desktop` and `windows-build` jobs cover them.

Not verified: the menu without Help, the zh-Hant AppKit items and the fonts themselves need a Mac; the Linux browser here has none of the macOS Chinese fonts, so the font change was checked through the computed style only.

## Windows and Linux desktop support

Verified on 2026-10-09 in a Linux cloud container (Ubuntu 24.04, amd64) with Go 1.25.0, Node 22.22.0, pnpm 12.10.1, Wails v3.0.0-beta.28, GTK 4.14 and WebKitGTK 2.52 installed from apt. Nothing here was run on macOS or Windows.

| Check | Result |
| ----- | ------ |
| `go test ./...` with cgo, GTK4 and WebKitGTK present | PASS, including the root package natively for the first time; new: window URLs with and without `chrome=custom`, and the Linux key store against a fake `secret-tool` (missing item, store, replace, delete twice, key never in argv, failures reported as errors) |
| `go test -race ./internal/...`, `CGO_ENABLED=0 go test -tags server ./...`, `CGO_ENABLED=0 go build -tags server` | PASS |
| `pnpm run typecheck`, `pnpm test` (11 tests), `pnpm run build`; `node --test scripts/frontend-dependencies.test.mjs` | PASS |
| `go build -tags production` native Linux binary | PASS |
| `scripts/linux-gui-smoke.sh` under `xvfb-run` + openbox | PASS (three consecutive runs): welcome window alone on first launch → its drawn close button shows the editor → maximise sets `_NET_WM_STATE_MAXIMIZED_*` and restore clears it → double-clicking the title bar does the same (implemented in the frontend; the Wails runtime handles it only on macOS) → Ctrl+, opens settings → its close button closes it → the editor's close button quits the app. The same script run against a build of `main` fails at the first close button, as expected |
| Manual xdotool checks in the same setup | PASS: dragging the title bar moves the window by exactly the pointer offset; dragging the bottom-right edge resizes it; dark theme and the demo render; the window edge is drawn. Pressing a resize edge used to start a text selection across the panes (the Wails runtime does not cancel that press); fixed and rechecked by screenshot |
| Linux key store against a real GNOME Keyring (unlocked in a D-Bus session) | PASS: empty read, store, replace, read back, delete, delete again; with no D-Bus session every call returns an error rather than "no key" |
| `GOOS=windows go build -tags production -ldflags "-H windowsgui"` (amd64 and arm64), `GOOS=windows go vet ./...`, `GOOS=windows go test -c` for every package | PASS: compiles only. The Credential Manager code, frameless WebView2 windows, and the Go tests on Windows are not run here; the new `windows-build` CI job runs `go test ./...` on a Windows runner |

First CI run (2026-10-09): `windows-build` failed in an existing settings test that asserted Unix permission bits (now checked outside Windows only), and `linux-desktop` failed because the app died at launch. That was reproduced here by making `bwrap` fail as on GitHub's AppArmor-restricted runners; the workflow now lifts that restriction, and the smoke script stops as soon as the app exits and prints the start and end of its log.

Not verified: Windows GUI at all; Linux under a real desktop session, Wayland, or HiDPI; media playback through GStreamer; native file dialogs (a GTK file chooser did open under Xvfb, but nothing was picked); saving a key from the Settings window on either platform.

## WSL Windows test build (2026-10-12)

Verified in Ubuntu WSL on amd64 with Go 1.26.0, Node 22.22.3 and the pinned pnpm 12.10.1 / Wails v3.0.0-beta.28:

- `pnpm install --frozen-lockfile`, `pnpm run typecheck`, `pnpm test` (17 tests), `pnpm run build`, and `go test ./internal/...` passed.
- Installed the Wails CLI with `CGO_ENABLED=0` without Linux GTK/WebKit development packages. `wails3 build GOOS=windows ARCH=amd64 CGO_ENABLED=0` produced `bin/mousqueau.exe`; `file` identified a PE32+ x86-64 Windows GUI executable. The build generated Windows icon and DPI manifest resources.
- Binding generation emitted warnings about missing Linux `pkg-config` / C metadata, but generated all 36 service methods; checked-in bindings were unchanged and the frontend and Windows build succeeded. Vite also reported the existing bundle-size warning.

The executable was not launched on Windows. Window controls, native dialogs, WebView2 playback, Credential Manager, and the checklist below remain unverified. See [WSL build instructions](../README.md#build-a-windows-test-executable-from-wsl).

## Application menu and themed scrollbars (2026-10-12)

The user's Windows screenshot confirms the earlier test executable opens the editor with demo subtitles and the Settings window. It also exposed the missing menu entry point and native white scrollbars. Windows and Linux now show a three-line application menu to the left of the project title and use themed scrollbar tracks/thumbs throughout the document, including secondary windows and Ant Design portals.

Verified for this change: frontend typecheck, all 17 frontend tests and production build; headless Chromium against the real Wails server with isolated settings showed light/dark menus, the menu loaded the demo, Undo removed its suggestions and speaker identities, Redo restored them, and Escape closed the menu. The Settings scrollbar had a 10 px width, dark track and themed thumb without arrow buttons; scrolling changed `scrollTop` to 300. The browser reported no page errors. The Windows amd64 executable was rebuilt with Wails icon and manifest resources. The revised native Windows/Linux GUI, window-control menu actions and native Settings-window opening still require desktop checks; these browser checks do not verify macOS GUI behavior.

## Timeline zoom, split/merge and the virtual cue list (2026-10-13)

Following a Windows trial: time displays now use an explicit monospace stack (SF Mono, Menlo, Cascadia Mono, Consolas, DejaVu Sans Mono, Liberation Mono) with tabular figures, since `ui-monospace` is Safari-only and a bare `monospace` can resolve to a CJK font under a Chinese page language on Windows. The inspector can split the selected cue at the text cursor and merge it with the previous or next cue. The timeline's native scrollbar is replaced by one whose thumb ends zoom, Ctrl/⌘ + wheel zooms around the pointer, the plain wheel scrolls sideways, and zooming out stops once the whole media fits. The cue list renders only the rows in view.

Verified in a Linux cloud environment with Go 1.25.0, Node 22.22.0, pnpm 12.10.1 and Wails v3.0.0-beta.28: `go test ./internal/...` (new split/merge, undo/redo, invalid split points, merged suggestions staying unacceptable, CJK-aware text joining), frontend typecheck, all 20 frontend tests and the production build; regenerated bindings add only `SplitCue` and `MergeCues`. A headless Chromium smoke against the Vite dev server with a stubbed Wails runtime (not the Go service) and 3,000 cues rendered 19–25 cue rows at a time, dragged both ends of the zoom thumb, panned it, zoomed with Ctrl + wheel, zoomed out to the full 100 minutes, split a cue at the cursor and merged it back, with no page errors.

Not verified: the real Go service behind the new buttons in a browser, any native window, Windows WebView2 font rendering (the computed font stack was checked; on Linux it resolved to DejaVu Sans Mono), trackpad pinch on macOS, and wheel behaviour in WebView2 and WKWebView.

## User dictionary v1 (2026-10-14)

Verified in Linux cloud: `go test ./internal/...` (dictionary load/save/read-only damage, matching with correct forms before misspellings, case/fullwidth fold, import preview/apply, project audio+dictionary coexistence and text-only dictionary accept/undo), `CGO_ENABLED=0 go test -tags server ./...`, `wails3 generate bindings -ts -i -f '-tags=server'` (50 service methods), frontend `pnpm run typecheck`, `pnpm test` (20 tests), `pnpm run build`.

Not verified on a real Mac: dictionary management window (`?window=dictionary`), inspector dictionary tab, cue-list highlighting, JSON import/export native dialogs, adding a selection to the dictionary, and “check all cues” producing undoable suggestions in the live app.

## Windows and Linux acceptance checklist (still outstanding)

1. Windows 11: first launch shows only the welcome window, with a native shadow and rounded corners; its close button (red on hover) shows the editor. The editor's minimise, maximise/restore and close buttons work; double-clicking the toolbar's empty space maximises; edges resize; Snap layouts appear when dragging to a screen edge.
2. Windows: save, replace and remove an API key in Settings; confirm it appears in Credential Manager as `Mousqueau/openai-api-key` and that analysis works when launched from the Start menu.
3. Windows: `winget install Gyan.FFmpeg` and confirm FFmpeg is found after restarting the app; import an MP4 and confirm playback and the waveform.
4. Linux (GNOME on Wayland and on X11, and KDE): the same window checks as item 1, plus the 1 px window edge in light and dark themes.
5. Linux: save a key with GNOME Keyring or KWallet running and confirm it in Seahorse/KWalletManager; confirm Settings reports an error rather than success when no keyring is running.
6. Both: import/export through native dialogs, unsaved edits on close, theme following the system appearance, and `wails3 package` output (NSIS/MSIX on Windows, AppImage/deb on Linux).
7. Both: times in the cue list, inspector, clock and ruler render in Cascadia Mono or Consolas (Windows) with digits that keep their width. Split a cue at the cursor with the playhead inside and outside it, merge with the previous and next cue, undo and redo each, and export an SRT with sequential numbering. Drag the timeline scrollbar's ends to zoom, Ctrl + wheel over the tracks without the page zooming, and scroll a full-length episode's cue list.

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
10. User dictionary: open the dictionary window from the inspector, add a person with a wrong spelling (≥2 characters) and a Traditional/Taiwan variant, run “check all cues”, accept a dictionary suggestion (text only; speakers unchanged), undo, export SRT and confirm it has no dictionary metadata. Import/export JSON via native dialogs; confirm a damaged `dictionary.json` becomes read-only.

CI includes a native macOS compilation job; its future result must be checked in GitHub and does not establish GUI testing.
10. First launch with no `settings.json`: only the welcome window appears; finishing or closing it shows the editor, and "加载示例" / "导入 SRT" run there. Relaunch opens the editor directly, with the last saved or opened project when that preference is on.
11. ⌘, and Mousqueau › 设置… open one settings window; closing the editor closes it too and the app quits. Theme changes apply to every open window at once, and "跟随系统" follows a macOS appearance switch.
12. Save, replace and remove an API key in Settings; confirm it appears in Keychain Access under "Mousqueau", that analysis works when launched from Finder, and that `OPENAI_API_KEY` still takes precedence. Pin FFmpeg to a wrong location and confirm "位置无效", then "自动检测".
13. "检查更新" against the real repository, with and without 接收测试版.
14. With macOS set to English, launch and confirm the menu bar (Mousqueau, File, Edit, View, Window and their items, including Settings…; there is no Help menu), the editor, file dialogs and an error message are all English. Switch macOS to 简体中文, relaunch, and confirm the same in Simplified Chinese with mainland wording; then to 繁體中文（台灣）and confirm Traditional Chinese with Taiwan wording, including AppKit's Start Dictation / Emoji & Symbols items. Then set Settings › General › Language to the other language and confirm the menu bar, the settings and welcome window titles and every open window change at once, and that the choice survives a relaunch. Set a per-application language for Mousqueau in System Settings and confirm "跟随系统" follows it.
15. In Settings › General, choose PingFang TC, Songti TC and Kaiti TC as the subtitle font and confirm the cue list, viewer overlay, timeline blocks, text field and suggestion texts change in every open window, that a family that is not installed falls back to the interface font, that the choice survives a relaunch, and that an exported SRT is byte-identical whatever the font.
16. User dictionary: open the dictionary window from the inspector, add a person with a wrong spelling (≥2 characters) and a Traditional/Taiwan variant, run “check all cues”, accept a dictionary suggestion (text only; speakers unchanged), undo, export SRT and confirm it has no dictionary metadata. Import/export JSON via native dialogs; confirm a damaged `dictionary.json` becomes read-only.
