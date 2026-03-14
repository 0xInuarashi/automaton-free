#!/usr/bin/env bash
# install-service.sh — install Conway Automaton as a systemd user service
#
# Usage:
#   bash scripts/install-service.sh             # agent only
#   bash scripts/install-service.sh --dashboard  # agent + web dashboard on :3456
#   bash scripts/install-service.sh --uninstall  # remove the service
#
# The service runs as the current user (systemd --user), so no root is needed.
# Logs: journalctl --user -u automaton -f
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE_NAME="automaton"
UNIT_FILE="$HOME/.config/systemd/user/${SERVICE_NAME}.service"
NODE_BIN="$(command -v node)"

# ── Uninstall ──────────────────────────────────────────────────────
if [[ "${1:-}" == "--uninstall" ]]; then
  echo "[INFO] Stopping and removing ${SERVICE_NAME} service..."
  systemctl --user stop  "${SERVICE_NAME}" 2>/dev/null || true
  systemctl --user disable "${SERVICE_NAME}" 2>/dev/null || true
  rm -f "${UNIT_FILE}"
  systemctl --user daemon-reload
  echo "[OK]   Service removed."
  exit 0
fi

# ── Check build is present ─────────────────────────────────────────
if [[ ! -f "${REPO_DIR}/dist/index.js" ]]; then
  echo "[ERROR] ${REPO_DIR}/dist/index.js not found. Run 'npm run build' first." >&2
  exit 1
fi

# ── Optional flags ─────────────────────────────────────────────────
EXTRA_ARGS=""
if [[ "${1:-}" == "--dashboard" ]]; then
  EXTRA_ARGS="--dashboard"
  echo "[INFO] Dashboard mode enabled (port 3456)"
fi

# ── Write unit file ────────────────────────────────────────────────
mkdir -p "$(dirname "${UNIT_FILE}")"

cat > "${UNIT_FILE}" <<UNIT
[Unit]
Description=Conway Automaton - Sovereign AI Agent
Documentation=https://github.com/Conway-Research/automaton
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${REPO_DIR}
ExecStart=${NODE_BIN} dist/index.js --run ${EXTRA_ARGS}
Restart=on-failure
RestartSec=10s
RestartSteps=5
RestartMaxDelaySec=300

# Give the agent access to env vars from ~/.config/automaton/env (optional)
EnvironmentFile=-${HOME}/.config/automaton/env

# Hardening (relaxed enough to allow file I/O, network, subprocess exec)
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=${HOME}/.automaton ${REPO_DIR}
PrivateTmp=true

# Logging goes to journald automatically
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

[Install]
WantedBy=default.target
UNIT

echo "[INFO] Unit file written to ${UNIT_FILE}"

# ── Enable and start ───────────────────────────────────────────────
# Enable linger so the user service survives logout
loginctl enable-linger "$(id -un)" 2>/dev/null || true

systemctl --user daemon-reload
systemctl --user enable "${SERVICE_NAME}"
systemctl --user restart "${SERVICE_NAME}"

sleep 1
STATUS=$(systemctl --user is-active "${SERVICE_NAME}" 2>/dev/null || echo "unknown")

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║         Automaton service installed & started        ║"
echo "╠══════════════════════════════════════════════════════╣"
printf "║  Status : %-43s║\n" "${STATUS}"
printf "║  Unit   : %-43s║\n" "~/.config/systemd/user/automaton.service"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Useful commands:                                    ║"
echo "║    journalctl --user -u automaton -f    # live logs  ║"
echo "║    systemctl --user status automaton    # status     ║"
echo "║    systemctl --user stop automaton      # stop       ║"
echo "║    systemctl --user restart automaton   # restart    ║"
if [[ -n "${EXTRA_ARGS}" ]]; then
echo "║    open http://localhost:3456           # dashboard  ║"
fi
echo "╚══════════════════════════════════════════════════════╝"
