# Mousqueau conventions

- Desktop application: Wails v3, Go, React/TypeScript, Ant Design. Keep credentials and subprocesses in Go.
- Core packages under `internal/` must not depend on Wails so they can be tested headlessly.
- Treat imported subtitles as immutable originals. Every edit and suggestion acceptance must be undoable; SRT export must not contain speaker metadata.
- Never upload audio without an explicit user action. Cancel subprocesses and HTTP requests using context. Never log credentials.
- Use generated Wails bindings; regenerate with `wails3 generate bindings` after changing service methods.
- Frontend uses pnpm at the version pinned in `frontend/package.json`. Run `go test ./internal/...` at the root, and `pnpm install --frozen-lockfile`, `pnpm run typecheck`, `pnpm test`, and `pnpm run build` in `frontend` as appropriate. Run `node --test scripts/frontend-dependencies.test.mjs` for license tooling changes. Desktop build requires native Wails dependencies.
- Write docs that distinguish verified tests from macOS GUI checks that still need a real Mac.
- No databases, full-episode automation, accounts, or cloud synchronization in v0.1.
- Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.

## Cursor Cloud specific instructions

- Login shells prepend `$HOME/bin`. Node.js 24.21.0, pnpm 12.10.1, and `wails3` v3.0.0-beta.28 are linked there so they take precedence over `/exec-daemon/node` (Node 22). Confirm with `bash -lc 'node --version && pnpm --version && wails3 version'`.
- Repository tests use the image Go 1.25.0 (`go test ./internal/...`, `CGO_ENABLED=0 go test -tags server ./...`). `go install` of `wails3` may download a newer toolchain for that CLI only.
- FFmpeg is on `PATH`. Exercise the editor with the README server-mode build (`CGO_ENABLED=0 go build -tags server`) and `WAILS_SERVER_HOST` / `WAILS_SERVER_PORT` on loopback. GTK and WebKitGTK are not preinstalled; native Linux window smoke still needs those packages and a host that allows WebKit's user namespaces. macOS GUI checks still need a Mac.
