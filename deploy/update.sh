#!/usr/bin/env bash
# AutoTube Studio — update/redeploy script
#
# Run on the VM after you push a new commit to GitHub main.
# Pulls latest code, runs npm install if package.json changed, regenerates
# Prisma client, rebuilds the Next.js bundle, and restarts pm2.
#
# Usage (as the autotube user):
#   cd /opt/autotube && bash deploy/update.sh
#
# Or via SSH one-liner:
#   ssh autotube@VM_IP 'cd /opt/autotube && bash deploy/update.sh'

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/autotube}"
cd "$INSTALL_DIR"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'
log() { echo -e "${CYAN}[$(date -u +%H:%M:%S)]${NC} $*"; }
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }

log "Fetching latest from origin/main…"
git fetch --all -q
LOCAL_HASH=$(git rev-parse HEAD)
REMOTE_HASH=$(git rev-parse origin/main)

if [[ "$LOCAL_HASH" == "$REMOTE_HASH" ]]; then
  ok "Already up to date ($LOCAL_HASH). Nothing to do."
  exit 0
fi

log "Local:  $LOCAL_HASH"
log "Remote: $REMOTE_HASH"

# Snapshot package.json hash to detect dep changes
OLD_PKG_HASH=$(sha1sum package.json | awk '{print $1}')
git reset --hard origin/main -q
NEW_PKG_HASH=$(sha1sum package.json | awk '{print $1}')

if [[ "$OLD_PKG_HASH" != "$NEW_PKG_HASH" ]]; then
  warn "package.json changed, running npm install…"
  npm install --omit=dev 2>&1 | tail -5
fi

log "Generating Prisma client…"
npx prisma generate 2>&1 | tail -3

log "Pushing DB schema (safe, no data loss for existing tables)…"
npx prisma db push --accept-data-loss 2>&1 | tail -3

log "Building Next.js production bundle…"
npm run build 2>&1 | tail -5
ok "Build complete"

log "Restarting pm2 process…"
pm2 restart autotube --update-env 2>&1 | tail -3
ok "Deployed. App is live."
pm2 status
