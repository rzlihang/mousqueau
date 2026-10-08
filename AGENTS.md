# Mousqueau conventions

- Desktop application: Wails v3, Go, React/TypeScript, Ant Design. Keep credentials and subprocesses in Go.
- Core packages under `internal/` must not depend on Wails so they can be tested headlessly.
- Treat imported subtitles as immutable originals. Every edit and suggestion acceptance must be undoable; SRT export must not contain speaker metadata.
- Never upload audio without an explicit user action. Cancel subprocesses and HTTP requests using context. Never log credentials.
- Use generated Wails bindings; regenerate with `wails3 generate bindings` after changing service methods.
- Frontend uses pnpm at the version pinned in `frontend/package.json`. Run `go test ./internal/...` at the root, and `pnpm install --frozen-lockfile`, `pnpm run typecheck`, `pnpm test`, and `pnpm run build` in `frontend` as appropriate. Run `node --test scripts/frontend-dependencies.test.mjs` for license tooling changes. Desktop build requires native Wails dependencies.
- Write docs that distinguish verified tests from macOS GUI checks that still need a real Mac.
- No databases, full-episode automation, accounts, or cloud synchronization in v0.1.
