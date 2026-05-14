#!/usr/bin/env bash
# record-dictation.sh — record native Dictivo doing real Whisper transcription.
#
# Usage:
#   AUDIO_FILE=path/to/speech.mp3 ./record-dictation.sh
#   AUDIO_FILE=… OUT=path/to/out.mov APP=Dictivo ./record-dictation.sh
#   ./record-dictation.sh --check        # only run preflight, do not record
#
# How it works:
#   1. Brings Dictivo's native window to front (must already be running)
#   2. Starts macOS `screencapture -v` recording the full screen
#   3. Fires the dictation hotkey via System Events (default ⌘⇧Space)
#   4. Plays your audio file through the speakers; the laptop mic hears it
#   5. Fires the hotkey again to stop dictation, waits for Whisper to render
#   6. Lets screencapture finish, opens the output in Finder
#
# Prereqs:
#   * Dictivo is already running natively (npm run tauri:dev OR installed .app)
#   * macOS Screen Recording permission granted to Terminal (or your shell)
#     System Settings → Privacy & Security → Screen Recording
#   * macOS Accessibility permission granted to Terminal (for System Events keystrokes)
#     System Settings → Privacy & Security → Accessibility
#   * Dictivo has Microphone permission (it asks on first launch)
#   * Speakers ON, volume at ~50%+, mic picks up your speakers (default setup)
#   * Quiet room (one shot, no notifications, ⌘+option+control+8 invert OFF, etc.)
#
# Audio sourcing tip (Trump-specific, public-domain options):
#   The 2017 US Presidential Inaugural Address is public domain (US gov work).
#   Grab a short clean clip from archive.org:
#       yt-dlp -x --audio-format mp3 --postprocessor-args "-ss 30 -t 18" \
#         "https://archive.org/details/POTUSInauguralAddress2017" \
#         -o "marketing/assets/trump-sample.mp3"
#   Or pick ANY clear 15-25s speech sample — the script doesn't care.

set -euo pipefail

# ──────────────────────── Config ────────────────────────
AUDIO_FILE="${AUDIO_FILE:-marketing/assets/speech-sample.mp3}"
OUT="${OUT:-marketing/captures/dictation/native-recording.mov}"
APP="${APP:-Dictivo}"
HOTKEY_KEYCODE="${HOTKEY_KEYCODE:-49}"            # 49 = Space
# AppleScript modifier list; literal braces required.
HOTKEY_MODS='{command down, shift down}'

# ──────────────────────── Paths ────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

# ──────────────────────── Helpers ────────────────────────
die() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
say() { printf '\033[36m→\033[0m %s\n' "$*"; }
ok()  { printf '\033[32m✓\033[0m %s\n' "$*"; }

# ──────────────────────── Preflight ────────────────────────
preflight() {
  say "Preflight checks…"

  [ -f "${AUDIO_FILE}" ] || die "audio not found: ${AUDIO_FILE}
       Set AUDIO_FILE=… or drop a file at ${AUDIO_FILE}
       See the comment block at the top of this script for sourcing tips."

  pgrep -ix "${APP}" >/dev/null 2>&1 \
    || pgrep -fi "${APP}" >/dev/null 2>&1 \
    || die "${APP} is not running. Start it first:
         cd apps/desktop && npm run tauri:dev
       …or open the installed Dictivo.app."

  command -v afplay     >/dev/null || die "afplay missing (you're not on macOS?)"
  command -v osascript  >/dev/null || die "osascript missing"
  command -v screencapture >/dev/null || die "screencapture missing"

  # Estimate audio duration; afinfo output looks like "estimated duration: 17.234 sec"
  AUDIO_SECONDS=$(afinfo "${AUDIO_FILE}" 2>/dev/null \
    | awk -F': ' '/estimated duration:/ { split($2, a, " "); print int(a[1]) + 1; exit }')
  [ -z "$AUDIO_SECONDS" ] && AUDIO_SECONDS=25
  TOTAL_SECONDS=$((AUDIO_SECONDS + 7))

  ok "audio          ${AUDIO_FILE}  (~${AUDIO_SECONDS}s)"
  ok "app running    ${APP}"
  ok "output         ${OUT}"
  ok "total record   ${TOTAL_SECONDS}s"
}

# ──────────────────────── Focus management ────────────────────────
# We have to record only Dictivo, not the calling terminal / Finder / etc.
# Hide every other foreground app, snapshot the original visible set so we
# can put it back afterwards.

isolate_dictivo() {
  say "Hiding other foreground apps…"
  osascript -e 'tell application "Finder" to close every window' 2>/dev/null || true
  osascript -e "tell application \"System Events\" to set visible of (every application process whose visible is true and background only is false and name is not \"${APP}\") to false" 2>/dev/null || true
  osascript -e "tell application \"${APP}\" to activate"
  osascript -e "tell application \"System Events\" to set frontmost of process \"${APP}\" to true"
  sleep 0.6
}

unhide_all() {
  osascript -e 'tell application "System Events" to set visible of (every application process whose background only is false) to true' 2>/dev/null || true
}

trap unhide_all EXIT

# ──────────────────────── Recording ────────────────────────
record() {
  mkdir -p "$(dirname "${OUT}")"

  isolate_dictivo

  say "Verifying ${APP} is frontmost…"
  FRONT=$(osascript -e 'tell application "System Events" to get name of (first application process whose frontmost is true)' 2>/dev/null)
  [ "${FRONT}" = "${APP}" ] || say "  (warning: frontmost = ${FRONT}, proceeding anyway)"
  sleep 0.6

  say "Starting screen recording (full screen, cursor included)…"
  # -v video mode, -C include cursor, -V seconds limit
  screencapture -v -C -V "${TOTAL_SECONDS}" "${OUT}" &
  REC_PID=$!
  sleep 2

  say "Pressing dictation hotkey: ⌘⇧Space (start)"
  osascript -e "tell application \"System Events\" to key code ${HOTKEY_KEYCODE} using $HOTKEY_MODS" \
    || die "System Events keystroke failed — grant Terminal Accessibility permission"
  sleep 0.6

  say "Playing audio (turn speakers up, mic will hear them)…"
  afplay "${AUDIO_FILE}"
  sleep 0.8

  say "Pressing dictation hotkey: ⌘⇧Space (stop)"
  osascript -e "tell application \"System Events\" to key code ${HOTKEY_KEYCODE} using $HOTKEY_MODS"

  say "Waiting for Whisper to render transcript on screen…"
  sleep 3

  # screencapture stops by itself when -V elapses
  wait "$REC_PID" 2>/dev/null || true
  ok "Recording saved → ${OUT}"

  open -R "${OUT}"
}

# ──────────────────────── Main ────────────────────────
case "${1:-}" in
  --check|-c)
    preflight
    ok "preflight passed — re-run without --check to record"
    exit 0
    ;;
  --help|-h)
    sed -n '2,40p' "$0" | sed 's|^# \{0,1\}||'
    exit 0
    ;;
esac

preflight
record
