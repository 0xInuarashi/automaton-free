#!/usr/bin/env bash
# install-service.sh — install Conway Automaton as a systemd user service
#
# Usage:
#   bash scripts/install-service.sh              # agent only
#   bash scripts/install-service.sh --dashboard  # agent + web dashboard on :3456
#   bash scripts/install-service.sh --uninstall  # remove the service
#
# Notes:
# - Installs as a systemd user service, so it runs as the current user.
# - Explicitly loads nvm and resolves an absolute node path.
# - Exports PATH into the unit so any child process that does `spawn("node", ...)`
#   can still resolve node under systemd.
# - Logs: journalctl --user -u automaton -f

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE_NAME="automaton"
UNIT_FILE="$HOME/.config/systemd/user/${SERVICE_NAME}.service"

# ---- nvm / node resolution ---------------------------------------------------

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

if [[ -s "${NVM_DIR}/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  . "${NVM_DIR}/nvm.sh"
else
  echo "[ERROR] nvm.sh not found at ${NVM_DIR}/nvm.sh" >&2
  exit 1
fi

# Prefer Node 20 if available
if nvm ls 20 >/dev/null 2>&1; then
  nvm use 20 >/dev/null
else
  echo "[WARN] nvm does not show Node 20 installed; using current default node" >&2
fi

NODE_BIN="$(command -v node || true)"
if [[ -z "${NODE_BIN}" ]]; then
  echo "[ERROR] node not found after loading nvm" >&2
  exit 1
fi

NODE_DIR="$(dirname "${NODE_BIN}")"
SERVICE_PATH="${NODE_DIR}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

echo "[INFO] Using node: ${NODE_BIN}"

# ---- uninstall ---------------------------------------------------------------

if [[ "${1:-}" == "--uninstall" ]]; then
  echo "[INFO] Stopping and removing ${SERVICE_NAME} service..."
  systemctl --user stop "${SERVICE_NAME}" 2>/dev/null || true
  systemctl --user disable "${SERVICE_NAME}" 2>/dev/null || true
  rm -f "${UNIT_FILE}"
  systemctl --user daemon-reload
  echo "[OK]   Service removed."
  exit 0
fi

# ---- build check -------------------------------------------------------------

if [[ ! -f "${REPO_DIR}/dist/index.js" ]]; then
  echo "[ERROR] ${REPO_DIR}/dist/index.js not found. Run 'npm run build' first." >&2
  exit 1
fi

# ---- optional flags ----------------------------------------------------------

EXTRA_ARGS=""
if [[ "${1:-}" == "--dashboard" ]]; then
  EXTRA_ARGS="--dashboard"
  echo "[INFO] Dashboard mode enabled (port 3456)"
fi

# ---- write unit --------------------------------------------------------------

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
ExecStart=${NODE_BIN} ${REPO_DIR}/dist/index.js ${EXTRA_ARGS}

# Ensure child_process.spawn("node", ...) can find node under systemd
Environment=PATH=${SERVICE_PATH}
Environment=NVM_DIR=${NVM_DIR}

# Optional user-provided env file
EnvironmentFile=-${HOME}/.config/automaton/env

Restart=on-failure
RestartSec=10s
RestartSteps=5
RestartMaxDelaySec=300

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=${HOME}/.automaton ${REPO_DIR}
PrivateTmp=true

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

[Install]
WantedBy=default.target
UNIT

echo "[INFO] Unit file written to ${UNIT_FILE}"

# ---- enable and start --------------------------------------------------------

loginctl enable-linger "$(id -un)" 2>/dev/null || true

systemctl --user daemon-reload
systemctl --user enable "${SERVICE_NAME}"
systemctl --user restart "${SERVICE_NAME}"

sleep 1
STATUS="$(systemctl --user is-active "${SERVICE_NAME}" 2>/dev/null || echo "unknown")"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║         Automaton service installed & started        ║"
echo "╠══════════════════════════════════════════════════════╣"
printf "║  Status : %-43s║\n" "${STATUS}"
printf "║  Unit   : %-43s║\n" "~/.config/systemd/user/automaton.service"
printf "║  Node   : %-43s║\n" "${NODE_BIN}"
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