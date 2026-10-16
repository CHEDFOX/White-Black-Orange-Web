#!/usr/bin/env bash
# Start the web app, stopping any instance already on the port.
#
# Termination is by PID file, not by matching the process list: a
# `pkill -f "next start"` pattern also matches the shell running the pkill, so
# the script kills itself.
set -euo pipefail

PORT="${PORT:-3000}"
MODE="${MODE:-start}"
RUNDIR="${RUNDIR:-.run}"
PIDFILE="$RUNDIR/web-$PORT.pid"

mkdir -p "$RUNDIR"

if [ -f "$PIDFILE" ]; then
  OLD_PID="$(cat "$PIDFILE")"
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "stopping existing web server on :$PORT (pid $OLD_PID)"
    kill "$OLD_PID" 2>/dev/null || true
    for _ in $(seq 1 20); do
      kill -0 "$OLD_PID" 2>/dev/null || break
      sleep 0.5
    done
    kill -9 "$OLD_PID" 2>/dev/null || true
  fi
  rm -f "$PIDFILE"
fi

echo "starting web app on http://127.0.0.1:$PORT"
NEXT_TELEMETRY_DISABLED=1 npx next "$MODE" -p "$PORT" &
APP_PID=$!
echo "$APP_PID" > "$PIDFILE"
trap 'rm -f "$PIDFILE"' EXIT
wait "$APP_PID"
