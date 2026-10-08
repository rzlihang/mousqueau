# Licensing decision for v0.1

Mousqueau's original code is licensed under **MIT**. This fits a small application that can be used, modified, and distributed commercially or as open source, with attribution and the license notice retained.

## yt-dlp: use an external CLI, do not bundle it

v0.1 invokes a user-installed `yt-dlp` executable through Go's `exec.CommandContext`. It neither copies yt-dlp source into this repository nor distributes yt-dlp binaries. Local imports work without it. The application and the separately installed command have independent licenses; using this CLI integration does not by itself require licensing Mousqueau under GPL.

The distinction between yt-dlp source and release artifacts matters:

| Artifact                                         | Upstream licensing statement                                    |
| ------------------------------------------------ | --------------------------------------------------------------- |
| Git source, PyPI source distribution, PyPI wheel | Unlicense                                                       |
| Most PyInstaller bundled executables             | Include GPLv3+ components; the combined executable is GPLv3+    |
| Unix zipimport executable and release tarball    | Include ISC/MIT JavaScript components as well as Unlicense code |

Sources checked on 2026-10-08: [yt-dlp LICENSE](https://github.com/yt-dlp/yt-dlp/blob/master/LICENSE), [README licensing section](https://github.com/yt-dlp/yt-dlp#license), and [third-party notices](https://github.com/yt-dlp/yt-dlp/blob/master/THIRD_PARTY_LICENSES.txt).

**Release rule:** ship Mousqueau, its MIT license, and its dependency notices. Ask users to install yt-dlp themselves (for example, with Homebrew or pipx). If a future installer bundles yt-dlp, inspect the exact artifact and all included dependencies, include their license notices, and satisfy any GPL source-distribution obligations for that artifact. Do not label every yt-dlp executable as Unlicense. Do not assume bundling changes the application's license automatically; review the specific distribution and integration.

## FFmpeg and bundled application dependencies

FFmpeg is also a user-installed external command. Its actual license depends on build configuration (commonly LGPL, potentially GPL, and nonfree builds may not be redistributable). v0.1 does not bundle FFmpeg. Revisit compliance before including any FFmpeg build in an installer.

Wails, its runtime, React, and Ant Design use MIT licenses; the `diff` library uses BSD-3-Clause. Production dependency texts are in `THIRD_PARTY_NOTICES.txt`. Regenerate them after dependency changes using `node scripts/notices.mjs` after `npm ci` in `frontend` and `go mod download` at the root. Include that file with distributed builds. Build-time tools retain their own licenses.

Software licensing does not grant rights to download a video or its audio/subtitles. The audio download action asks users to confirm their authorization. API use is additionally subject to provider terms.
