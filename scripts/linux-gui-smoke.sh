#!/usr/bin/env bash
# Drives the native Linux desktop build through its frameless windows and the
# window controls the frontend draws: welcome → editor, maximise and restore
# by button and by double-click, settings, and quitting by closing the editor.
# It needs an X display with no desktop running, a D-Bus session, openbox and
# xdotool; ImageMagick's `import` adds screenshots. This exercises
# GTK/WebKitGTK on Linux only; it says nothing about macOS or Windows.
#
#   xvfb-run -a -s "-screen 0 1700x1050x24" dbus-run-session -- \
#     scripts/linux-gui-smoke.sh ./mousqueau [screenshot-dir]
set -euo pipefail

BIN=$(realpath "$1")
SHOTS=${2:-}
[ -n "$SHOTS" ] && mkdir -p "$SHOTS"

# A fresh configuration so the welcome window opens first.
HOME=$(mktemp -d)
export HOME XDG_CONFIG_HOME=$HOME/.config
export GDK_BACKEND=x11 NO_AT_BRIDGE=1 GTK_A11Y=none
export LIBGL_ALWAYS_SOFTWARE=${LIBGL_ALWAYS_SOFTWARE:-1}
export WEBKIT_DISABLE_COMPOSITING_MODE=${WEBKIT_DISABLE_COMPOSITING_MODE:-1}

openbox >/dev/null 2>&1 &
WM=$!
"$BIN" >"${SHOTS:-$HOME}/app.log" 2>&1 &
APP=$!
cleanup() {
	kill "$APP" "$WM" 2>/dev/null || true
	[ -n "$SHOTS" ] || cat "$HOME/app.log"
}
trap cleanup EXIT

fail() {
	echo "FAIL: $*" >&2
	shot "failure"
	exit 1
}
shot() {
	if [ -n "$SHOTS" ] && command -v import >/dev/null; then
		import -window root "$SHOTS/$1.png" || true
	fi
}

# Frameless GTK windows carry no title, so windows are told apart by size:
# the welcome and settings panels are 760 px wide, the editor 1440 px.
window() {
	local w geometry
	for w in $(xdotool search --onlyvisible --pid "$APP" 2>/dev/null); do
		# A window that closed since the search is skipped.
		geometry=$(xdotool getwindowgeometry --shell "$w" 2>/dev/null) || continue
		eval "$geometry"
		case $1 in
		panel) [ "$WIDTH" -eq 760 ] && echo "$w" && return ;;
		editor) [ "$WIDTH" -gt 760 ] && echo "$w" && return ;;
		esac
	done
	return 0
}
# wait_for <seconds> <command…> polls until the command succeeds.
wait_for() {
	local deadline=$((SECONDS + $1))
	shift
	until "$@"; do
		[ $SECONDS -lt $deadline ] || return 1
		sleep 0.5
	done
}
shown() { [ -n "$(window "$1")" ]; }
hidden() { [ -z "$(window "$1")" ]; }
maximised() { xprop -id "$1" _NET_WM_STATE | grep -q MAXIMIZED_HORZ; }
restored() { ! maximised "$1"; }
exited() { ! kill -0 "$APP" 2>/dev/null; }
# click <window> <px from its right edge> clicks in the 52 px title bar.
click() {
	eval "$(xdotool getwindowgeometry --shell "$1")"
	xdotool mousemove $((X + WIDTH - $2)) $((Y + 26)) click 1
}

wait_for 60 shown panel || fail "welcome window did not open"
sleep 2 # let the page render
WELCOME=$(window panel)
shot "1-welcome"
hidden editor || fail "editor shown before setup finished"

click "$WELCOME" 23 # close
wait_for 15 shown editor || fail "closing the welcome window did not show the editor"
wait_for 10 hidden panel || fail "welcome window still open"
EDITOR=$(window editor)
sleep 1
shot "2-editor"

click "$EDITOR" 69 # maximise
wait_for 10 maximised "$EDITOR" || fail "maximise button did not maximise"
sleep 1
shot "3-maximised"
click "$EDITOR" 69 # restore
wait_for 10 restored "$EDITOR" || fail "restore button did not restore"

# Double-clicking the title bar's empty middle maximises and restores.
eval "$(xdotool getwindowgeometry --shell "$EDITOR")"
xdotool mousemove $((X + WIDTH / 2 + 130)) $((Y + 26)) sleep 0.5 click --repeat 2 --delay 80 1
wait_for 10 maximised "$EDITOR" || fail "double-clicking the title bar did not maximise"
sleep 1
eval "$(xdotool getwindowgeometry --shell "$EDITOR")"
xdotool mousemove $((X + WIDTH / 2 + 130)) $((Y + 26)) sleep 0.5 click --repeat 2 --delay 80 1
wait_for 10 restored "$EDITOR" || fail "double-clicking the title bar did not restore"

# Ctrl+, opens settings.
xdotool key ctrl+comma
wait_for 15 shown panel || fail "Ctrl+, did not open settings"
sleep 2
shot "4-settings"
click "$(window panel)" 23 # close settings
wait_for 10 hidden panel || fail "settings close button did not close it"

click "$EDITOR" 23 # close the editor, which quits
wait_for 15 exited || fail "closing the editor did not quit"
trap - EXIT
kill "$WM" 2>/dev/null || true
echo "Linux GUI smoke test passed"
