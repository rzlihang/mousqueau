#!/usr/bin/env bash
# Launches the native macOS build several times in light and dark system
# appearance and fails if it dies, logs a panic, or never shows a window.
# Startup races (such as calling into Wails before App.Run has created its
# platform) only fail on some launches, hence the repetition. Screenshots are
# saved for a person to look at; nothing asserts on their colours, so this
# does not show that the first frame is free of a white flash.
#
#   scripts/macos-launch-smoke.sh ./mousqueau [screenshot-dir] [launches-per-appearance]
set -euo pipefail

BIN=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
SHOTS=${2:-}
RUNS=${3:-3}
[ -n "$SHOTS" ] && mkdir -p "$SHOTS"
WORK=$(mktemp -d)
LOG=$WORK/app.log
APP=

swiftc -O "$(dirname "$0")/macos-windows.swift" -o "$WORK/macos-windows"

ORIGINAL_DARK=$(osascript -e 'tell application "System Events" to tell appearance preferences to get dark mode')
cleanup() {
	[ -n "$APP" ] && kill "$APP" 2>/dev/null || true
	osascript -e "tell application \"System Events\" to tell appearance preferences to set dark mode to $ORIGINAL_DARK" >/dev/null || true
}
trap cleanup EXIT

shot() {
	# screencapture needs Screen Recording; without it the shot is skipped.
	[ -n "$SHOTS" ] && screencapture -x "$SHOTS/$1.png" 2>/dev/null || true
}
fail() {
	echo "FAIL: $*" >&2
	shot "failure-$NAME"
	# A crash puts its cause first and a goroutine dump after it.
	echo "--- application log (first and last 30 lines) ---" >&2
	head -n 30 "$LOG" >&2 || true
	echo "..." >&2
	tail -n 30 "$LOG" >&2 || true
	[ -n "$SHOTS" ] && cp "$LOG" "$SHOTS/failure-$NAME.log" || true
	exit 1
}
panicked() { grep -qE '^(panic:|fatal error:)|SIGSEGV|SIGBUS' "$LOG"; }
windows() { "$WORK/macos-windows" "$APP"; }

for appearance in light dark; do
	dark=false
	[ "$appearance" = dark ] && dark=true
	osascript -e "tell application \"System Events\" to tell appearance preferences to set dark mode to $dark"
	for run in $(seq 1 "$RUNS"); do
		NAME=$appearance-$run
		# A fresh configuration each time, so every launch is a first launch
		# with the welcome window and the theme following the system.
		HOME=$(mktemp -d) "$BIN" >"$LOG" 2>&1 &
		APP=$!

		shown=
		for _ in $(seq 1 60); do
			kill -0 "$APP" 2>/dev/null || fail "$NAME: the application exited"
			panicked && fail "$NAME: the application panicked"
			if [ "$(windows)" -gt 0 ]; then
				shown=1
				break
			fi
			sleep 0.5
		done
		[ -n "$shown" ] || fail "$NAME: no window appeared within 30 seconds"
		# Past the ten-second recovery timer, so its main-thread call runs too.
		sleep 12
		kill -0 "$APP" 2>/dev/null || fail "$NAME: the application exited after showing a window"
		panicked && fail "$NAME: the application panicked after showing a window"
		[ "$(windows)" -gt 0 ] || fail "$NAME: its window disappeared"
		shot "$NAME"

		kill "$APP"
		wait "$APP" 2>/dev/null || true
		APP=
		echo "$NAME: ok"
	done
done
echo "macOS launch smoke test passed"
