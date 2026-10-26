#!/usr/bin/env bash
# AutoTube Studio — Turso database setup (one-shot)
#
# This script:
#   1. Verifies the Turso CLI is installed and authenticated
#   2. Creates a Turso database named "autotube" (if it doesn't exist)
#   3. Generates the schema SQL from prisma/schema.prisma
#   4. Applies the schema to the Turso database via `turso db shell`
#   5. Prints the DATABASE_URL to set in Vercel
#
# Why this exists: `npx prisma db push` rejects libsql:// URLs because the
# schema's `provider = "sqlite"` enforces `file:` URLs at the CLI level.
# The libsql driver adapter works at runtime (in Next.js), but the Prisma
# CLI's schema validator is stricter. So we use `turso db shell` to apply
# the schema directly via the Turso wire protocol, bypassing the Prisma CLI.
#
# Usage (from the repo root, in any environment with turso CLI installed):
#   bash deploy/turso-setup.sh
#
# Prerequisites:
#   - Turso CLI installed (curl -sSfL https://get.tur.so/install.sh | bash)
#   - Logged in: turso auth login  (opens browser)

set -euo pipefail

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${CYAN}[$(date -u +%H:%M:%S)]${NC} $*"; }
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; }

DB_NAME="autotube"
REPO_ROOT="${PWD}"

# === Step 1: Check turso CLI is installed ===
if ! command -v turso >/dev/null 2>&1; then
  err "Turso CLI not installed."
  echo
  echo "Install it first:"
  echo "  curl -sSfL https://get.tur.so/install.sh | bash"
  echo "  source ~/.bashrc   # or open a new terminal"
  exit 1
fi
ok "Turso CLI found: $(turso --version 2>&1 | head -1)"

# === Step 2: Check auth status ===
if ! turso auth whoami >/dev/null 2>&1; then
  err "Not logged in to Turso."
  echo
  echo "Run this to authenticate (opens browser):"
  echo "  turso auth login"
  echo
  echo "If the browser doesn't open automatically in Codespaces, copy the URL"
  echo "that the CLI prints and open it manually."
  exit 1
fi
ok "Authenticated as: $(turso auth whoami 2>&1)"

# === Step 3: Create database if it doesn't exist ===
log "Checking for database '${DB_NAME}'…"
if turso db list 2>&1 | grep -q "^${DB_NAME}\b"; then
  warn "Database '${DB_NAME}' already exists — reusing."
else
  log "Creating database '${DB_NAME}' (this takes ~5 seconds)…"
  turso db create "$DB_NAME" --location nrt 2>&1 | tail -3
fi
ok "Database ready"

# === Step 4: Get the connection URL + auth token ===
DB_URL=$(turso db show "$DB_NAME" --url 2>&1 | tail -1)
AUTH_TOKEN=$(turso db tokens create "$DB_NAME" 2>&1 | tail -1)

if [[ -z "$DB_URL" || "$DB_URL" == libsql://* ]] && [[ ! "$DB_URL" == libsql://* ]]; then
  err "Could not get database URL. Output was: $DB_URL"
  exit 1
fi

COMBINED_URL="${DB_URL}?authToken=${AUTH_TOKEN}"
ok "Connection URL: ${DB_URL}"
ok "Auth token: ${AUTH_TOKEN:0:20}… (truncated)"

# === Step 5: Generate schema SQL from Prisma ===
log "Generating schema SQL from prisma/schema.prisma…"
SCHEMA_SQL_FILE="/tmp/autotube-schema.sql"
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > "$SCHEMA_SQL_FILE" 2>/dev/null

if [[ ! -s "$SCHEMA_SQL_FILE" ]]; then
  err "Failed to generate schema SQL. Run with --verbose to debug."
  exit 1
fi

TABLE_COUNT=$(grep -c "^CREATE TABLE" "$SCHEMA_SQL_FILE" || true)
ok "Schema SQL generated (${TABLE_COUNT} tables): $SCHEMA_SQL_FILE"

# === Step 6: Apply schema to Turso via turso db shell ===
log "Applying schema to Turso database (this is the alternative to 'prisma db push'…"
turso db shell "$DB_NAME" < "$SCHEMA_SQL_FILE" 2>&1 | tail -5
ok "Schema applied to Turso"

# === Step 7: Verify tables exist ===
log "Verifying tables…"
TABLES=$(turso db shell "$DB_NAME" "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;" 2>&1)
ok "Tables in Turso database:"
echo "$TABLES" | sed 's/^/  /'

# === Step 8: Print the DATABASE_URL to set in Vercel ===
echo
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✓ TURSO SETUP COMPLETE${NC}"
echo -e "${GREEN}========================================${NC}"
echo
echo "Set this exact value as the DATABASE_URL env var in Vercel"
echo "(Settings → Environment Variables → DATABASE_URL):"
echo
echo -e "${CYAN}${COMBINED_URL}${NC}"
echo
echo "Make sure to check Production + Preview + Development environments."
echo
echo "After saving, trigger a redeploy in Vercel:"
echo "  Deployments → latest → ⋯ → Redeploy"
echo
echo "Then verify the API works:"
echo "  curl https://autotubestudio-gamma.vercel.app/api/dashboard"
echo "  # → should return JSON with niche data"
echo
echo "If the API returns no niches, seed it once:"
echo "  curl -X POST https://autotubestudio-gamma.vercel.app/api/seed"
echo "  # → {\"ok\":true,\"count\":15}"
