#!/usr/bin/env bash
# AutoTube Studio — Cloudflare Tunnel setup
#
# Two modes:
#   1. Quick (default): random trycloudflare.com URL, ephemeral
#   2. Stable: named tunnel + cfargotunnel.com (or your own domain in Cloudflare)
#
# Usage:
#   bash deploy/cloudflared-setup.sh           # quick URL
#   bash deploy/cloudflared-setup.sh --named    # stable named tunnel (interactive)
#
# After setup, the tunnel runs as a systemd service that auto-restarts on reboot.

set -euo pipefail

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
log() { echo -e "${CYAN}[$(date -u +%H:%M:%S)]${NC} $*"; }
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; }

MODE="quick"
if [[ "${1:-}" == "--named" ]]; then
  MODE="named"
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  err "cloudflared not installed. Run deploy/setup.sh first."
  exit 1
fi

# === Mode 1: Quick — random trycloudflare URL ===
if [[ "$MODE" == "quick" ]]; then
  log "Starting Cloudflare Quick Tunnel (random *.trycloudflare.com URL)…"
  log "This will run in the foreground. Press Ctrl+C to stop."
  log "URL will change every time you restart — use --named for a stable URL."
  echo
  cloudflared tunnel --url http://localhost:3000
  exit 0
fi

# === Mode 2: Named tunnel (stable URL) ===
log "Cloudflare Named Tunnel setup"
echo
echo "This will:"
echo "  1. Authenticate you with Cloudflare (opens browser on first run)"
echo "  2. Create a named tunnel"
echo "  3. Configure a stable *.cfargotunnel.com hostname (or your own domain)"
echo "  4. Install a systemd service for auto-restart on reboot"
echo

read -rp "Continue? [y/N] " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  warn "Aborted."
  exit 0
fi

TUNNEL_NAME="autotube"

# Authenticate (will open browser)
log "Step 1: Authenticate with Cloudflare…"
echo "  If this is your first time, a browser will open to authorize cloudflared."
echo "  After approving, you'll see 'You have successfully logged in' here."
cloudflared tunnel login || {
  err "Login failed. Re-run this script after logging in."
  exit 1
}

# Create tunnel
log "Step 2: Creating tunnel '${TUNNEL_NAME}'…"
if ! cloudflared tunnel list | grep -q "$TUNNEL_NAME"; then
  cloudflared tunnel create "$TUNNEL_NAME"
else
  warn "Tunnel '${TUNNEL_NAME}' already exists, reusing."
fi

# Generate config
log "Step 3: Writing cloudflared config to ~/.cloudflared/config.yml…"
CONFIG_DIR="${HOME}/.cloudflared"
mkdir -p "$CONFIG_DIR"
TUNNEL_UUID=$(cloudflared tunnel list --output json | python3 -c "import json,sys; data=json.load(sys.stdin); print([t['id'] for t in data if t['name']=='${TUNNEL_NAME}'][0])" 2>/dev/null || echo "")

if [[ -z "$TUNNEL_UUID" ]]; then
  err "Could not find tunnel UUID. Manually edit ${CONFIG_DIR}/config.yml"
  TUNNEL_UUID="REPLACE_WITH_TUNNEL_UUID"
fi

cat > "${CONFIG_DIR}/config.yml" <<EOF
tunnel: ${TUNNEL_UUID}
credentials-file: ${CONFIG_DIR}/${TUNNEL_UUID}.json

ingress:
  - hostname: ${TUNNEL_NAME}.cfargotunnel.com
    service: http://localhost:3000
  - service: http_status:404
EOF
ok "Config written: ${CONFIG_DIR}/config.yml"

# Configure DNS route
log "Step 4: Configuring DNS route (${TUNNEL_NAME}.cfargotunnel.com)…"
cloudflared tunnel route dns "${TUNNEL_NAME}" "${TUNNEL_NAME}.cfargotunnel.com" || \
  warn "DNS route may already exist (OK if you see a 409)"

# Install systemd service
log "Step 5: Installing systemd service for auto-restart…"
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl restart cloudflared
ok "Tunnel running as systemd service"

echo
ok "Setup complete!"
echo
echo -e "${CYAN}Your stable URL:${NC} https://${TUNNEL_NAME}.cfargotunnel.com"
echo
echo "To use your own domain instead:"
echo "  1. Add the domain to Cloudflare (free)"
echo "  2. cloudflared tunnel route dns ${TUNNEL_NAME} yoursubdomain.yourdomain.com"
echo "  3. Edit ${CONFIG_DIR}/config.yml to add the new hostname"
echo "  4. sudo systemctl restart cloudflared"
echo
echo "Check status:   sudo systemctl status cloudflared"
echo "View logs:       sudo journalctl -u cloudflared -f"
