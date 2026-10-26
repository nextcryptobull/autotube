#!/usr/bin/env bash
# AutoTube Studio — Oracle Cloud Always Free VM setup script
#
# Run on a freshly-provisioned Oracle Cloud Ampere A1 VM (Ubuntu 22.04+).
# This script:
#   1. Installs Node 20 LTS, ffmpeg, pm2, cloudflared
#   2. Clones the repo to /opt/autotube
#   3. Sets up .env and a local SQLite DB
#   4. Builds the Next.js app
#   5. Starts the app under pm2 (auto-restart on crash + reboot)
#   6. Configures UFW firewall (allow SSH, 80, 443)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/nextcryptobull/autotube/main/deploy/setup.sh | sudo bash
#
# Or if you cloned the repo first:
#   sudo bash deploy/setup.sh
#
# Idempotent: safe to re-run.

set -euo pipefail

# === Config ===
REPO_URL="https://github.com/nextcryptobull/autotube.git"
INSTALL_DIR="/opt/autotube"
NODE_MAJOR=20
SERVICE_USER="autotube"

# === Color helpers ===
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() {
  echo -e "${CYAN}[$(date -u +%H:%M:%S)]${NC} $*"
}
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; }

if [[ $EUID -ne 0 ]]; then
  err "This script must be run as root (use sudo)."
  exit 1
fi

ARCH=$(uname -m)
log "Detected architecture: ${ARCH}"

if [[ "$ARCH" != "x86_64" && "$ARCH" != "aarch64" ]]; then
  err "Unsupported architecture: ${ARCH}. Only x86_64 and aarch64 are supported."
  exit 1
fi

# === Step 1: apt update + base deps ===
log "Updating apt and installing base dependencies…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  curl ca-certificates gnupg2 git build-essential \
  ffmpeg ufw \
  sqlite3 \
  > /dev/null
ok "Base packages installed (ffmpeg, ufw, sqlite3, git)"

# === Step 2: Node 20 LTS via NodeSource ===
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null | cut -d. -f1 | tr -d v)" -lt "$NODE_MAJOR" ]]; then
  log "Installing Node.js ${NODE_MAJOR}.x via NodeSource…"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null
fi
ok "Node $(node -v), npm $(npm -v)"

# === Step 3: pm2 globally ===
if ! command -v pm2 >/dev/null 2>&1; then
  log "Installing pm2 globally…"
  npm install -g pm2 >/dev/null 2>&1
fi
ok "pm2 $(pm2 --version)"

# === Step 4: cloudflared (for free HTTPS tunnel) ===
if ! command -v cloudflared >/dev/null 2>&1; then
  log "Installing cloudflared…"
  case "$ARCH" in
    x86_64)   CF_ARCH="amd64" ;;
    aarch64)  CF_ARCH="arm64" ;;
  esac
  curl -fsSL -o /tmp/cloudflared.deb \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}.deb"
  dpkg -i /tmp/cloudflared.deb >/dev/null 2>&1 || true
  rm -f /tmp/cloudflared.deb
fi
ok "cloudflared $(cloudflared --version 2>&1 | head -1)"

# === Step 5: Create service user ===
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  log "Creating service user '${SERVICE_USER}'…"
  useradd --system --create-home --home-dir "/home/${SERVICE_USER}" --shell /bin/bash "$SERVICE_USER"
fi
ok "Service user '${SERVICE_USER}' exists"

# === Step 6: Clone or update repo ===
if [[ -d "$INSTALL_DIR/.git" ]]; then
  log "Repo exists at ${INSTALL_DIR}, pulling latest…"
  cd "$INSTALL_DIR"
  sudo -u "$SERVICE_USER" git fetch --all -q
  sudo -u "$SERVICE_USER" git reset --hard origin/main -q
else
  log "Cloning repo to ${INSTALL_DIR}…"
  mkdir -p "$INSTALL_DIR"
  chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"
  sudo -u "$SERVICE_USER" git clone --depth=1 "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"
ok "Repo at ${INSTALL_DIR}"

# === Step 7: .env setup ===
if [[ ! -f "$INSTALL_DIR/.env" ]]; then
  log "Creating .env (SQLite at ${INSTALL_DIR}/db/custom.db)…"
  sudo -u "$SERVICE_USER" tee "$INSTALL_DIR/.env" > /dev/null <<EOF
DATABASE_URL="file:${INSTALL_DIR}/db/custom.db"
EOF
  ok ".env created"
else
  warn ".env already exists, leaving untouched"
fi

# === Step 8: .z-ai-config (SDK credentials) ===
ZAI_CONFIG_PATH="${INSTALL_DIR}/.z-ai-config"
if [[ ! -f "$ZAI_CONFIG_PATH" ]]; then
  warn "Missing ${ZAI_CONFIG_PATH}"
  warn "Without it, AI script/voiceover/image generation will fail."
  warn "Create this file with your Z.ai API credentials:"
  echo '  {'
  echo '    "baseUrl": "https://api.example.com/v1",'
  echo '    "apiKey": "YOUR_API_KEY"'
  echo '  }'
  warn "See: https://z-ai-web-dev-sdk docs"
fi

# === Step 9: Install npm deps ===
log "Running npm install (this can take 1-3 minutes on first run)…"
sudo -u "$SERVICE_USER" npm ci --omit=dev 2>&1 | tail -5 || \
  sudo -u "$SERVICE_USER" npm install --omit=dev 2>&1 | tail -5
ok "Dependencies installed"

# === Step 10: Generate Prisma client + push schema ===
log "Generating Prisma client and pushing DB schema…"
sudo -u "$SERVICE_USER" npx prisma generate 2>&1 | tail -3
sudo -u "$SERVICE_USER" npx prisma db push --accept-data-loss 2>&1 | tail -3
ok "Database ready"

# === Step 11: Build Next.js ===
log "Building Next.js production bundle (Turbopack)…"
sudo -u "$SERVICE_USER" npm run build 2>&1 | tail -8
ok "Build complete"

# === Step 12: Log dir ===
mkdir -p /var/log/autotube
chown -R "$SERVICE_USER":"$SERVICE_USER" /var/log/autotube

# === Step 13: Start under pm2 ===
log "Starting app under pm2…"
sudo -u "$SERVICE_USER" pm2 start deploy/ecosystem.config.cjs --cwd "$INSTALL_DIR" || \
  sudo -u "$SERVICE_USER" pm2 restart autotube
sudo -u "$SERVICE_USER" pm2 save
# Enable pm2 auto-start on VM reboot
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u "$SERVICE_USER" --hp "/home/${SERVICE_USER}" 2>&1 | tail -3
ok "App running on port 3000 under pm2"

# === Step 14: Firewall ===
log "Configuring UFW firewall…"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp       # SSH
ufw allow 80/tcp       # HTTP (cloudflared tunnel endpoint / direct)
ufw allow 443/tcp      # HTTPS (if running Caddy/nginx later)
ufw --force enable >/dev/null
ok "UFW active: SSH(22), HTTP(80), HTTPS(443) allowed"

# === Done ===
echo
ok "Setup complete!"
echo
echo -e "${CYAN}Next steps:${NC}"
echo "  1. Create ${ZAI_CONFIG_PATH} with your Z.ai API credentials (see above)"
echo "  2. Expose the app to the internet with Cloudflare Tunnel:"
echo "       sudo -u ${SERVICE_USER} cloudflared tunnel --url http://localhost:3000"
echo "     (gives you a free *.trycloudflare.com HTTPS URL — random, changes on restart)"
echo "  3. For a STABLE URL, follow the named-tunnel setup in deploy/README.md"
echo
echo -e "${CYAN}Useful commands:${NC}"
echo "  pm2 status                          # check app health"
echo "  pm2 logs autotube --lines 50         # tail logs"
echo "  sudo -u ${SERVICE_USER} pm2 restart autotube    # restart app"
echo "  cd ${INSTALL_DIR} && bash deploy/update.sh     # pull latest code + rebuild"
echo
