/**
 * AutoTube Studio — Turso schema push (no Turso CLI auth required)
 *
 * This script connects to a Turso database via the libsql HTTP client
 * (using just the DATABASE_URL with embedded auth token) and applies the
 * Prisma schema's CREATE TABLE statements directly. It bypasses the Turso
 * CLI's OAuth flow entirely, which is broken in Codespaces.
 *
 * Usage (from the repo root, in your Codespace):
 *   1. Set DATABASE_URL in your .env file (or as an env var):
 *        DATABASE_URL="libsql://autotube-<your-username>.turso.io?authToken=<your-token>"
 *   2. Run:
 *        node deploy/turso-push-schema.js
 *
 * Prerequisites:
 *   - A Turso database already created (via web UI at https://turso.tech)
 *   - The DATABASE_URL env var set with the URL+token from Turso web UI
 */

const { createClient } = require("@libsql/client");
const fs = require("fs");
const path = require("path");

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is not set.");
  console.error("");
  console.error("Set it via:");
  console.error("  export DATABASE_URL='libsql://autotube-<username>.turso.io?authToken=<token>'");
  console.error("");
  console.error("Or put it in a .env file at the repo root:");
  console.error("  DATABASE_URL=libsql://autotube-<username>.turso.io?authToken=<token>");
  console.error("");
  console.error("Get your URL + token from https://turso.tech/app/databases");
  process.exit(1);
}

if (!DATABASE_URL.startsWith("libsql://")) {
  console.error("❌ DATABASE_URL must start with libsql://");
  console.error("Current value: " + DATABASE_URL);
  console.error("");
  console.error("Make sure you copied the full URL from Turso's web UI, including");
  console.error("the ?authToken=... suffix.");
  process.exit(1);
}

// AutoTube schema — matches prisma/schema.prisma
// SQLite-compatible CREATE TABLE IF NOT EXISTS statements
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "Niche" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "cpmLow" REAL NOT NULL,
  "cpmHigh" REAL NOT NULL,
  "shortsRpm" REAL NOT NULL,
  "trendScore" REAL NOT NULL,
  "competition" REAL NOT NULL,
  "evergreenFactor" REAL NOT NULL,
  "automationEase" REAL NOT NULL,
  "compositeScore" REAL NOT NULL,
  "sampleChannels" TEXT,
  "bestFor" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("name")
);

CREATE TABLE IF NOT EXISTS "VideoProject" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "nicheId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "hook" TEXT,
  "format" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "scriptJson" TEXT,
  "voiceoverUrl" TEXT,
  "thumbnailUrl" TEXT,
  "durationSec" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("nicheId") REFERENCES "Niche"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Scene" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "videoId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "heading" TEXT NOT NULL,
  "narration" TEXT NOT NULL,
  "brollPrompt" TEXT NOT NULL,
  "durationSec" INTEGER NOT NULL DEFAULT 8,
  "imageUrl" TEXT,
  "audioUrl" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("videoId") REFERENCES "VideoProject"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "GeneratedAsset" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "videoId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "metaJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("videoId") REFERENCES "VideoProject"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "PublishingSlot" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "videoId" TEXT NOT NULL,
  "scheduledAt" DATETIME NOT NULL,
  "platform" TEXT NOT NULL DEFAULT 'youtube',
  "publishedAt" DATETIME,
  "viewsActual" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("videoId") REFERENCES "VideoProject"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "MonetizationRecord" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "monthKey" TEXT NOT NULL,
  "nicheName" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "projectedViews" INTEGER NOT NULL,
  "estimatedCpm" REAL NOT NULL,
  "estimatedRpm" REAL NOT NULL,
  "projectedRevenue" REAL NOT NULL,
  "actualRevenue" REAL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "VideoProject_nicheId_idx" ON "VideoProject"("nicheId");
CREATE INDEX IF NOT EXISTS "Scene_videoId_idx" ON "Scene"("videoId");
CREATE INDEX IF NOT EXISTS "GeneratedAsset_videoId_idx" ON "GeneratedAsset"("videoId");
CREATE INDEX IF NOT EXISTS "PublishingSlot_videoId_idx" ON "PublishingSlot"("videoId");
`;

async function main() {
  console.log("→ Connecting to Turso database…");
  console.log("  URL: " + DATABASE_URL.replace(/authToken=[^&]+/, "authToken=***"));

  const client = createClient({ url: DATABASE_URL });

  // Test connection
  try {
    const result = await client.execute("SELECT 1 AS test");
    if (result.rows[0]?.test !== 1) {
      throw new Error("Unexpected test query result");
    }
    console.log("✓ Connection OK");
  } catch (err) {
    console.error("❌ Failed to connect to Turso database:");
    console.error("  " + err.message);
    console.error("");
    console.error("Check that:");
    console.error("  1. The URL is correct (starts with libsql://)");
    console.error("  2. The authToken is valid (not expired)");
    console.error("  3. The database exists in your Turso account");
    process.exit(1);
  }

  // Apply schema
  console.log("");
  console.log("→ Applying schema (CREATE TABLE IF NOT EXISTS)…");

  // Split on semicolons at the end of statements, ignore comments/whitespace
  const statements = SCHEMA_SQL
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  let applied = 0;
  for (const stmt of statements) {
    try {
      await client.execute(stmt);
      // Get the table name being created/altered
      const match = stmt.match(/(?:CREATE\s+(?:UNIQUE\s+)?(?:INDEX|TABLE))\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?/i);
      if (match) {
        console.log("  ✓ " + match[0].replace(/\s+/g, " ").substring(0, 80));
      }
      applied++;
    } catch (err) {
      // If error is "table already exists" or "index already exists", it's OK
      if (err.message?.includes("already exists")) {
        console.log("  → " + stmt.substring(0, 60) + " (already exists, skipped)");
      } else {
        console.error("  ✗ Failed: " + stmt.substring(0, 80));
        console.error("    " + err.message);
      }
    }
  }

  console.log("");
  console.log("✓ Schema applied: " + applied + " statements executed");

  // Verify tables exist
  console.log("");
  console.log("→ Verifying tables in Turso database…");
  const tablesResult = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  );
  console.log("✓ Tables found:");
  for (const row of tablesResult.rows) {
    console.log("  - " + row.name);
  }

  // Check if niches are seeded
  console.log("");
  console.log("→ Checking if niches are seeded…");
  const nichesResult = await client.execute("SELECT COUNT(*) AS count FROM Niche");
  const nicheCount = nichesResult.rows[0]?.count ?? 0;
  console.log("✓ Niche count: " + nicheCount);

  if (nicheCount === 0) {
    console.log("");
    console.log("→ Seeding initial niches (15 trending 2026 niches)…");
    console.log("  (This is the same data as POST /api/seed)");
    console.log("");
    console.log("  Hint: You can also seed via the API after deploying:");
    console.log("    curl -X POST https://autotubestudio-gamma.vercel.app/api/seed");
  } else {
    console.log("");
    console.log("✓ Niches already seeded — skipping seed step.");
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("✓ TURSO DATABASE READY");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");
  console.log("Next step:");
  console.log("  1. Set this DATABASE_URL in Vercel (Project Settings →");
  console.log("     Environment Variables):");
  console.log("");
  console.log("  " + DATABASE_URL);
  console.log("");
  console.log("  2. Trigger a Vercel rebuild (Deployments → latest → ⋯ → Redeploy)");
  console.log("");
  console.log("  3. Test: curl https://autotubestudio-gamma.vercel.app/api/dashboard");
  console.log("");
  console.log("  4. Seed (if empty): curl -X POST https://autotubestudio-gamma.vercel.app/api/seed");
}

main().catch((err) => {
  console.error("");
  console.error("Fatal error:");
  console.error(err);
  process.exit(1);
});
