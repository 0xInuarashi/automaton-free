#!/bin/sh
# Automaton Dashboard Keep-Alive Daemon
#
# Runs the dashboard (which manages the automaton agent) indefinitely.
# If it crashes, waits RESTART_DELAY seconds and restarts.
# Writes a PID file so it can be stopped cleanly.
#
# Usage:
#   ./scripts/run-forever.sh start          # start in background
#   ./scripts/run-forever.sh stop           # stop gracefully
#   ./scripts/run-forever.sh restart        # restart
#   ./scripts/run-forever.sh status         # show status
#   ./scripts/run-forever.sh logs           # tail the log
#   ./scripts/run-forever.sh logs -f        # follow the log (like tail -f)
#
# Environment:
#   DASHBOARD_PORT      Port for the web dashboard (default: 3456)
#   DASHBOARD_HOST      Host to bind to (default: 0.0.0.0)
#   RESTART_DELAY       Seconds to wait before restarting on crash (default: 5)
#   LOG_DIR             Where to write logs (default: ~/.automaton/logs)
#   AUTOMATON_DIR       Automaton install directory (default: detected from script location)

set -e

# ─── Paths ────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AUTOMATON_DIR="${AUTOMATON_DIR:-$(dirname "$SCRIPT_DIR")}"
LOG_DIR="${LOG_DIR:-$HOME/.automaton/logs}"
PID_FILE="$HOME/.automaton/dashboard.pid"
LOG_FILE="$LOG_DIR/dashboard.log"
ENTRY="$AUTOMATON_DIR/dist/index.js"

DASHBOARD_PORT="${DASHBOARD_PORT:-3456}"
DASHBOARD_HOST="${DASHBOARD_HOST:-0.0.0.0}"
RESTART_DELAY="${RESTART_DELAY:-5}"

# ─── Helpers ──────────────────────────────────────────────────────

die() { echo "[ERROR] $1" >&2; exit 1; }
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }

is_running() {
  [ -f "$PID_FILE" ] || return 1
  PID="$(cat "$PID_FILE")"
  [ -n "$PID" ] || return 1
  kill -0 "$PID" 2>/dev/null
}

# ─── Commands ─────────────────────────────────────────────────────

cmd_start() {
  if is_running; then
    echo "Already running (PID $(cat "$PID_FILE"))"
    exit 0
  fi

  [ -f "$ENTRY" ] || die "Build not found at $ENTRY — run 'npm run build' first"
  command -v node >/dev/null 2>&1 || die "node not found in PATH"

  mkdir -p "$LOG_DIR"
  mkdir -p "$(dirname "$PID_FILE")"

  log "Starting automaton dashboard on port $DASHBOARD_PORT..."

  # The outer loop (nohup'd) restarts the dashboard if it ever exits
  nohup sh -c '
    while true; do
      echo "[$(date +%Y-%m-%dT%H:%M:%S)] Dashboard starting..."
      DASHBOARD_PORT="'"$DASHBOARD_PORT"'" \
      DASHBOARD_HOST="'"$DASHBOARD_HOST"'" \
        node "'"$ENTRY"'" --dashboard 2>&1
      EXIT=$?
      echo "[$(date +%Y-%m-%dT%H:%M:%S)] Dashboard exited (code=$EXIT). Restarting in '"$RESTART_DELAY"'s..."
      sleep '"$RESTART_DELAY"'
    done
  ' >> "$LOG_FILE" 2>&1 &

  WRAPPER_PID=$!
  echo $WRAPPER_PID > "$PID_FILE"
  log "Started (wrapper PID $WRAPPER_PID). Dashboard: http://localhost:$DASHBOARD_PORT"
  log "Logs: $LOG_FILE"
}

cmd_stop() {
  if ! is_running; then
    echo "Not running."
    exit 0
  fi

  PID="$(cat "$PID_FILE")"
  log "Stopping (PID $PID)..."

  # Kill the wrapper loop
  kill "$PID" 2>/dev/null || true

  # Also kill any child node processes from this wrapper
  # (pkill by parent PID if available)
  if command -v pkill >/dev/null 2>&1; then
    pkill -P "$PID" 2>/dev/null || true
  fi

  # Wait up to 10s for it to die
  for i in $(seq 1 20); do
    kill -0 "$PID" 2>/dev/null || break
    sleep 0.5
  done

  rm -f "$PID_FILE"
  log "Stopped."
}

cmd_restart() {
  cmd_stop
  sleep 1
  cmd_start
}

cmd_status() {
  if is_running; then
    PID="$(cat "$PID_FILE")"
    UPTIME=""
    if command -v ps >/dev/null 2>&1; then
      UPTIME=$(ps -o etime= -p "$PID" 2>/dev/null | tr -d ' ' || echo "?")
    fi
    echo "● automaton-dashboard — RUNNING"
    echo "  PID:      $PID"
    echo "  Uptime:   ${UPTIME:-?}"
    echo "  Dashboard: http://localhost:$DASHBOARD_PORT"
    echo "  Log:      $LOG_FILE"
    echo ""
    echo "  Agent process:"
    # Check if the automaton child is running via the dashboard API
    if command -v curl >/dev/null 2>&1; then
      PROC_STATUS=$(curl -s --max-time 2 "http://localhost:$DASHBOARD_PORT/api/process" 2>/dev/null | \
        grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "unknown")
      echo "    status: $PROC_STATUS"
    fi
  else
    echo "● automaton-dashboard — STOPPED"
    if [ -f "$PID_FILE" ]; then
      echo "  (stale PID file removed)"
      rm -f "$PID_FILE"
    fi
  fi
}

cmd_logs() {
  mkdir -p "$LOG_DIR"
  touch "$LOG_FILE"
  if [ "$1" = "-f" ] || [ "$1" = "--follow" ]; then
    tail -f "$LOG_FILE"
  else
    tail -n "${2:-100}" "$LOG_FILE"
  fi
}

# ─── Entry Point ──────────────────────────────────────────────────

COMMAND="${1:-help}"
shift 2>/dev/null || true

case "$COMMAND" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_restart ;;
  status)  cmd_status ;;
  logs)    cmd_logs "$@" ;;
  help|--help|-h)
    cat <<EOF
Usage: $0 <command> [options]

Commands:
  start     Start the dashboard daemon in the background
  stop      Stop the dashboard daemon
  restart   Restart the dashboard daemon
  status    Show daemon status and agent process status
  logs      Show recent logs (pass -f to follow)
  help      Show this help

Environment variables:
  DASHBOARD_PORT   Port for the web UI (default: 3456)
  DASHBOARD_HOST   Bind address (default: 0.0.0.0)
  RESTART_DELAY    Seconds between crash restarts (default: 5)
  LOG_DIR          Log directory (default: ~/.automaton/logs)

Examples:
  $0 start
  $0 status
  $0 logs -f
  DASHBOARD_PORT=8080 $0 start
EOF
    ;;
  *)
    echo "Unknown command: $COMMAND. Run '$0 help' for usage." >&2
    exit 1
    ;;
esac
