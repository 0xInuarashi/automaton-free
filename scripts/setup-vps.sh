#!/bin/bash
# Automaton VPS Setup — One-Shot Installer
#
# Installs, configures, and runs the Automaton dashboard as a
# persistent systemd service on a fresh VPS.
#
# Usage:
#   bash scripts/setup-vps.sh
#
# Or from a fresh machine (if repo is not yet cloned):
#   curl -fsSL https://raw.githubusercontent.com/Conway-Research/automaton/main/scripts/setup-vps.sh | bash
#
# Options (environment variables):
#   DASHBOARD_PORT=3456          Dashboard web UI port
#   AUTOMATON_DIR=/opt/automaton  Install directory (defaults to current repo if already cloned)
#   SERVICE_NAME=automaton        systemd service name
#   NO_SETUP=1                    Skip the interactive setup wizard
#   NO_START=1                    Install service but do not start it

set -euo pipefail

DASHBOARD_PORT="${DASHBOARD_PORT:-3456}"
SERVICE_NAME="${SERVICE_NAME:-automaton}"
REPO="https://github.com/Conway-Research/automaton.git"

# ─── Colours ──────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
ok()      { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; }
section() { echo -e "\n${BOLD}${BLUE}▶ $*${RESET}"; }
die()     { error "$*"; exit 1; }

# ─── 1. Root check ────────────────────────────────────────────────

section "Checking permissions"

if [ "$(id -u)" -ne 0 ]; then
  # Not root — try sudo elevation for systemd parts
  SUDO="sudo"
  info "Running as $(whoami). sudo will be used for systemd installation."
else
  SUDO=""
  info "Running as root."
fi

# ─── 2. Detect install directory ──────────────────────────────────

section "Detecting install location"

# If we're already inside the repo, use it directly
if [ -f "$(pwd)/package.json" ] && grep -q '"@conway/automaton"' "$(pwd)/package.json" 2>/dev/null; then
  INSTALL_DIR="$(pwd)"
  info "Using current directory: $INSTALL_DIR"
elif [ -n "${AUTOMATON_DIR:-}" ]; then
  INSTALL_DIR="$AUTOMATON_DIR"
  info "Using AUTOMATON_DIR: $INSTALL_DIR"
elif [ -w /opt ] || [ "$(id -u)" = "0" ]; then
  INSTALL_DIR="/opt/automaton"
else
  INSTALL_DIR="$HOME/automaton"
fi

INSTALL_USER="$(stat -c '%U' "$(dirname "$INSTALL_DIR")" 2>/dev/null || echo "$(whoami)")"
# If install dir exists, use its owner
if [ -d "$INSTALL_DIR" ]; then
  INSTALL_USER="$(stat -c '%U' "$INSTALL_DIR" 2>/dev/null || echo "$(whoami)")"
fi
INSTALL_GROUP="$(id -gn "$INSTALL_USER" 2>/dev/null || echo "$INSTALL_USER")"

info "Install dir: $INSTALL_DIR"
info "Service user: $INSTALL_USER:$INSTALL_GROUP"

# ─── 3. Prerequisites ─────────────────────────────────────────────

section "Checking prerequisites"

# Node.js — install via nvm if missing or too old
install_node_via_nvm() {
  info "Installing nvm + Node.js 22..."
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  # Source nvm into the current shell session
  # shellcheck source=/dev/null
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  nvm install 22
  nvm use 22
  nvm alias default 22
  # Persist nvm sourcing for future shells if not already in profile
  for PROFILE in "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile" "$HOME/.zshrc"; do
    if [ -f "$PROFILE" ] && ! grep -q 'NVM_DIR' "$PROFILE" 2>/dev/null; then
      cat >> "$PROFILE" <<'NVMEOF'

# nvm (added by automaton setup)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && . "$NVM_DIR/bash_completion"
NVMEOF
      break
    fi
  done
  ok "Node.js $(node -v) installed via nvm"
}

if ! command -v node >/dev/null 2>&1; then
  warn "Node.js not found — installing via nvm..."
  install_node_via_nvm
else
  NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
  if [ "$NODE_MAJOR" -lt 20 ]; then
    warn "Node.js $(node -v) is too old (need >= 20) — upgrading via nvm..."
    install_node_via_nvm
  fi
fi

# Re-check after potential nvm install
NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))" 2>/dev/null) \
  || die "Node.js still not available after install. Open a new shell and re-run this script."
if [ "$NODE_MAJOR" -lt 20 ]; then
  die "Node.js $(node -v) is still < 20 after install attempt. Please resolve manually."
fi
ok "Node.js $(node -v)"

# git
if ! command -v git >/dev/null 2>&1; then
  warn "git not found, installing..."
  if command -v apt-get >/dev/null 2>&1; then
    $SUDO apt-get install -y git
  elif command -v dnf >/dev/null 2>&1; then
    $SUDO dnf install -y git
  else
    die "Please install git manually."
  fi
fi
ok "git $(git --version | awk '{print $3}')"

# pnpm
if ! command -v pnpm >/dev/null 2>&1; then
  info "Enabling pnpm via corepack..."
  corepack enable pnpm 2>/dev/null || npm install -g pnpm
fi
ok "pnpm $(pnpm --version)"

# systemd
if ! command -v systemctl >/dev/null 2>&1; then
  die "systemctl not found. This script requires systemd. For containers, use scripts/run-forever.sh instead."
fi
if ! systemctl is-system-running >/dev/null 2>&1 && ! $SUDO systemctl is-system-running >/dev/null 2>&1; then
  # Try to detect if systemd is actually active
  if [ "$(cat /proc/1/comm 2>/dev/null)" != "systemd" ]; then
    warn "systemd does not appear to be PID 1 (found: $(cat /proc/1/comm 2>/dev/null))."
    warn "If this is a container, use scripts/run-forever.sh instead."
    warn "Continuing anyway — this may fail at the service install step."
  fi
fi
ok "systemd available"

# ─── 4. Clone or update repo ──────────────────────────────────────

section "Installing Automaton"

if [ -d "$INSTALL_DIR/.git" ]; then
  info "Updating existing installation at $INSTALL_DIR..."
  cd "$INSTALL_DIR"
  git pull --ff-only
  ok "Repository updated"
elif [ -f "$INSTALL_DIR/package.json" ]; then
  info "Found existing installation at $INSTALL_DIR (no .git)"
  cd "$INSTALL_DIR"
else
  info "Cloning repository to $INSTALL_DIR..."
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone "$REPO" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
  ok "Repository cloned"
fi

# ─── 5. Install dependencies and build ────────────────────────────

section "Building"

info "Installing dependencies..."
pnpm install --frozen-lockfile

info "Building TypeScript..."
pnpm run build

ok "Build complete"

# ─── 6. Run setup wizard if not configured ────────────────────────

CONFIG_FILE="$HOME/.automaton/automaton.json"

if [ "${NO_SETUP:-}" != "1" ] && [ ! -f "$CONFIG_FILE" ]; then
  section "First-time setup"
  echo ""
  echo -e "${BOLD}${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}${YELLOW}  🔑  Configuration required${RESET}"
  echo -e "${BOLD}${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""
  echo -e "  Please have the following ready:"
  echo -e "    ${BOLD}• OpenRouter API key${RESET}  — https://openrouter.ai/keys"
  echo -e "    ${BOLD}• Creator wallet address${RESET} (optional — press Enter to skip)"
  echo ""
  echo -e "  Starting setup wizard..."
  echo ""
  # Redirect stdin from /dev/tty so interactive prompts work even when
  # this script is being piped in via `curl ... | bash`
  if [ -t 0 ]; then
    node dist/index.js --setup
  elif [ -e /dev/tty ]; then
    node dist/index.js --setup < /dev/tty
  else
    warn "No interactive terminal available."
    warn "Run 'node dist/index.js --setup' manually in $INSTALL_DIR before starting the service."
    warn "Then run: sudo systemctl start $SERVICE_NAME"
    # Don't start the service automatically — config is missing
    export NO_START=1
  fi
  ok "Setup complete"
elif [ -f "$CONFIG_FILE" ]; then
  ok "Configuration found at $CONFIG_FILE — skipping wizard"
else
  warn "Skipping setup wizard (NO_SETUP=1). Run 'node dist/index.js --setup' manually before starting."
fi

# ─── 7. Find node binary path ─────────────────────────────────────

NODE_BIN="$(command -v node)"
ok "Node binary: $NODE_BIN"

# ─── 8. Write systemd service ─────────────────────────────────────

section "Installing systemd service"

SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

$SUDO tee "$SERVICE_FILE" > /dev/null <<EOF
# Automaton Dashboard — auto-generated by setup-vps.sh
# To reconfigure: sudo nano $SERVICE_FILE && sudo systemctl daemon-reload

[Unit]
Description=Automaton Dashboard — Sovereign AI Agent
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=120
StartLimitBurst=5

[Service]
Type=simple
User=$INSTALL_USER
Group=$INSTALL_GROUP
WorkingDirectory=$INSTALL_DIR
ExecStart=$NODE_BIN $INSTALL_DIR/dist/index.js --dashboard
Environment=DASHBOARD_PORT=$DASHBOARD_PORT
Environment=DASHBOARD_HOST=0.0.0.0
Environment=NODE_ENV=production
Restart=always
RestartSec=5s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME
LimitNOFILE=65536
TimeoutStopSec=30s

[Install]
WantedBy=multi-user.target
EOF

ok "Service file written to $SERVICE_FILE"

$SUDO systemctl daemon-reload
ok "systemd reloaded"

$SUDO systemctl enable "$SERVICE_NAME"
ok "Service enabled (will start on boot)"

# ─── 9. Start the service ─────────────────────────────────────────

if [ "${NO_START:-}" != "1" ]; then
  section "Starting service"

  # Stop any existing instance first
  if $SUDO systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    info "Restarting existing service..."
    $SUDO systemctl restart "$SERVICE_NAME"
  else
    $SUDO systemctl start "$SERVICE_NAME"
  fi

  # Wait a moment and check it came up
  sleep 3
  if $SUDO systemctl is-active --quiet "$SERVICE_NAME"; then
    ok "Service is running"
  else
    error "Service failed to start. Check logs with: journalctl -u $SERVICE_NAME -n 50"
  fi
fi

# ─── 10. Detect public IP ─────────────────────────────────────────

PUBLIC_IP=""
PUBLIC_IP=$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null || \
            curl -s --max-time 5 https://ifconfig.me 2>/dev/null || \
            curl -s --max-time 5 https://icanhazip.com 2>/dev/null || \
            hostname -I 2>/dev/null | awk '{print $1}' || echo "YOUR_SERVER_IP")

# ─── 11. Summary ──────────────────────────────────────────────────

echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${GREEN}  ✅  Automaton is installed and running!${RESET}"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo -e "  ${BOLD}Dashboard:${RESET}  http://${PUBLIC_IP}:${DASHBOARD_PORT}"
echo ""
echo -e "  ${BOLD}Manage:${RESET}"
echo -e "    sudo systemctl status  $SERVICE_NAME   # check status"
echo -e "    sudo systemctl stop    $SERVICE_NAME   # stop"
echo -e "    sudo systemctl start   $SERVICE_NAME   # start"
echo -e "    sudo systemctl restart $SERVICE_NAME   # restart"
echo -e "    journalctl -u $SERVICE_NAME -f         # live logs"
echo ""
echo -e "  ${BOLD}Install dir:${RESET}  $INSTALL_DIR"
echo -e "  ${BOLD}Config:${RESET}       $CONFIG_FILE"
echo -e "  ${BOLD}Service file:${RESET} $SERVICE_FILE"
echo ""
if [ -n "${PUBLIC_IP}" ] && [ "${NO_START:-}" != "1" ]; then
  echo -e "  ${YELLOW}Note: Make sure port ${DASHBOARD_PORT} is open in your VPS firewall.${RESET}"
  echo ""
fi
