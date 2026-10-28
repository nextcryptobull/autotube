import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createClient } from "@libsql/client";
import { calcCompositeScore } from "@/lib/autotube/projections";

// Initial niches with REALISTIC 2025-2026 industry benchmarks.
//
// All CPM values are ADVERTISER CPM (what YouTube charges advertisers).
// Creator RPM = ~55% of these values for long-form (YouTube keeps 45%).
// shortsRpm is the CREATOR RPM (post-cut) per 1,000 Shorts views,
// capped at $0.04–$0.15 per industry benchmarks.
//
// monetizationSafety: 0-1, lower = higher AI/reused-content denial risk.
// AI-generated niches with templated output face ~30-50% denial risk.
//
// Sources: YouTube YPP 2026 eligibility docs, Satura AI RPM benchmarks,
// OutlierKit, vidIQ, Fliki, Virvid analyses.

interface NicheSeed {
  name: string;
  category: string;
  cpmLow: number; // Advertiser CPM (creator keeps ~55%)
  cpmHigh: number;
  shortsRpm: number; // Creator RPM (post-cut, $0.04-$0.15 range)
  trendScore: number;
  competition: number;
  evergreenFactor: number;
  automationEase: number;
  monetizationSafety: number;
  sampleChannels: string;
  bestFor: string;
}

const NICHES: NicheSeed[] = [
  {
    name: "Personal Finance & Investing",
    category: "Finance",
    cpmLow: 18,
    cpmHigh: 36,
    shortsRpm: 0.12, // realistic creator RPM (was 0.18)
    trendScore: 78,
    competition: 72,
    evergreenFactor: 0.85,
    automationEase: 0.55,
    monetizationSafety: 0.85, // established niche, low AI denial risk
    sampleChannels: "Graham Stephan, Andrei Jikh, MagnatesMoney",
    bestFor: "long-form",
  },
  {
    name: "AI News & Tool Reviews",
    category: "AI / Tech",
    cpmLow: 10,
    cpmHigh: 22,
    shortsRpm: 0.10,
    trendScore: 95,
    competition: 48,
    evergreenFactor: 0.45,
    automationEase: 0.9,
    monetizationSafety: 0.65, // AI content scrutiny higher
    sampleChannels: "Matt Wolfe, AI Explained, The AI Advantage",
    bestFor: "hybrid",
  },
  {
    name: "Business Case Studies & Documentaries",
    category: "Business",
    cpmLow: 10,
    cpmHigh: 25,
    shortsRpm: 0.08,
    trendScore: 82,
    competition: 55,
    evergreenFactor: 0.9,
    automationEase: 0.7,
    monetizationSafety: 0.85, // original content, well-received
    sampleChannels: "MagnatesMedia, ColdFusion, Company Man",
    bestFor: "long-form",
  },
  {
    name: "Make Money Online & Side Hustles",
    category: "Finance",
    cpmLow: 10,
    cpmHigh: 25,
    shortsRpm: 0.10,
    trendScore: 85,
    competition: 68,
    evergreenFactor: 0.6,
    automationEase: 0.85,
    monetizationSafety: 0.55, // often flagged as templated/reused
    sampleChannels: "Iman Gadzhi, Ali Abdaal, Make Money Alex",
    bestFor: "hybrid",
  },
  {
    name: "True Crime & Mystery",
    category: "Entertainment",
    cpmLow: 5,
    cpmHigh: 12,
    shortsRpm: 0.05,
    trendScore: 74,
    competition: 65,
    evergreenFactor: 0.95,
    automationEase: 0.8,
    monetizationSafety: 0.75,
    sampleChannels: "MrBallen, Bailey Sarian, Explore With Us",
    bestFor: "long-form",
  },
  {
    name: "History & Education Documentaries",
    category: "Education",
    cpmLow: 5,
    cpmHigh: 12,
    shortsRpm: 0.05,
    trendScore: 68,
    competition: 50,
    evergreenFactor: 0.98,
    automationEase: 0.8,
    monetizationSafety: 0.80,
    sampleChannels: "Kings and Generals, History Matters",
    bestFor: "long-form",
  },
  {
    name: "Motivation & Self-Improvement",
    category: "Self-Help",
    cpmLow: 6,
    cpmHigh: 15,
    shortsRpm: 0.07,
    trendScore: 71,
    competition: 60,
    evergreenFactor: 0.88,
    automationEase: 0.85,
    monetizationSafety: 0.55, // heavy AI voiceover risk
    sampleChannels: "Motiversity, Menfulness, Diary of a CEO",
    bestFor: "hybrid",
  },
  {
    name: "Health & Wellness Explainers",
    category: "Health",
    cpmLow: 5,
    cpmHigh: 15,
    shortsRpm: 0.08,
    trendScore: 66,
    competition: 58,
    evergreenFactor: 0.75,
    automationEase: 0.7,
    monetizationSafety: 0.60, // medical misinformation scrutiny
    sampleChannels: "What I've Learned, Thomas DeLauer",
    bestFor: "hybrid",
  },
  {
    name: "AI Tool Tutorials (Screen Recording)",
    category: "AI / Tech",
    cpmLow: 8,
    cpmHigh: 20,
    shortsRpm: 0.09,
    trendScore: 92,
    competition: 40,
    evergreenFactor: 0.4,
    automationEase: 0.95,
    monetizationSafety: 0.60, // AI tool content flagged more often
    sampleChannels: "Kevin Stratvert, AI Tutorials Hub",
    bestFor: "long-form",
  },
  {
    name: "Tech News Roundups",
    category: "AI / Tech",
    cpmLow: 8,
    cpmHigh: 18,
    shortsRpm: 0.08,
    trendScore: 88,
    competition: 52,
    evergreenFactor: 0.35,
    automationEase: 0.95,
    monetizationSafety: 0.55, // compilations often flagged
    sampleChannels: "ColdFusion, TechAlt, Two Minute Papers",
    bestFor: "hybrid",
  },
  {
    name: "Meditation & Sleep Music",
    category: "Wellness",
    cpmLow: 4,
    cpmHigh: 10,
    shortsRpm: 0.04, // realistic floor
    trendScore: 55,
    competition: 70,
    evergreenFactor: 0.99,
    automationEase: 1.0,
    monetizationSafety: 0.45, // pure AI-generated music high denial risk
    sampleChannels: "YellowBrickCinema, Sleepy Time",
    bestFor: "long-form",
  },
  {
    name: "Gaming Lore & Tier Lists",
    category: "Gaming",
    cpmLow: 3,
    cpmHigh: 8,
    shortsRpm: 0.05,
    trendScore: 79,
    competition: 75,
    evergreenFactor: 0.65,
    automationEase: 0.85,
    monetizationSafety: 0.65, // game footage licensed fair use, generally OK
    sampleChannels: "VaatiVidya, TheSpiffingBrit",
    bestFor: "hybrid",
  },
  {
    name: "Kids Educational Animations",
    category: "Kids",
    cpmLow: 3,
    cpmHigh: 8,
    shortsRpm: 0.04,
    trendScore: 62,
    competition: 80,
    evergreenFactor: 0.95,
    automationEase: 0.6,
    monetizationSafety: 0.50, // COPPA + AI content scrutiny
    sampleChannels: "Cocomelon, Ms Rachel",
    bestFor: "long-form",
  },
  {
    name: "Real Estate Investing",
    category: "Finance",
    cpmLow: 12,
    cpmHigh: 28,
    shortsRpm: 0.10,
    trendScore: 73,
    competition: 47,
    evergreenFactor: 0.7,
    automationEase: 0.65,
    monetizationSafety: 0.75,
    sampleChannels: "BiggerPockets, Meet Kevin",
    bestFor: "long-form",
  },
  {
    name: "SaaS Review & Software Comparisons",
    category: "AI / Tech",
    cpmLow: 12,
    cpmHigh: 24,
    shortsRpm: 0.11,
    trendScore: 90,
    competition: 35,
    evergreenFactor: 0.5,
    automationEase: 0.9,
    monetizationSafety: 0.70, // screen-recorded, generally OK
    sampleChannels: "Landon Schertz, Toolify, SaaS Pedia",
    bestFor: "hybrid",
  },
];

// Schema SQL — applied if tables don't exist yet (idempotent).
// Now includes monetizationSafety column.
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
  "monetizationSafety" REAL NOT NULL DEFAULT 0.7,
  "compositeScore" REAL NOT NULL,
  "sampleChannels" TEXT,
  "bestFor" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("name")
);

ALTER TABLE "Niche" ADD COLUMN "monetizationSafety" REAL NOT NULL DEFAULT 0.7;

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

CREATE TABLE IF NOT EXISTS "YouTubeToken" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT 'singleton',
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "channelId" TEXT,
  "channelTitle" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" DATETIME,
  "image" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "accounts" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "refresh_token" TEXT,
  "access_token" TEXT,
  "expires_at" INTEGER,
  "token_type" TEXT,
  "scope" TEXT,
  "id_token" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "sessionToken" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL,
  "expires" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "verificationtokens" (
  "identifier" TEXT NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "expires" DATETIME NOT NULL
);

ALTER TABLE "VideoProject" ADD COLUMN "userId" TEXT;
ALTER TABLE "PublishingSlot" ADD COLUMN "userId" TEXT;
`;

// Apply the schema directly via libsql client.
async function ensureSchema(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!url.startsWith("libsql://") && !url.startsWith("file:")) {
    throw new Error("DATABASE_URL must start with libsql:// or file:");
  }
  const client = createClient({ url });
  const statements = SCHEMA_SQL.split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));
  for (const stmt of statements) {
    try {
      await client.execute(stmt);
    } catch (err) {
      // "already exists" / "duplicate column" errors are fine — idempotent re-runs
      const msg = (err as Error).message ?? "";
      if (
        !msg.includes("already exists") &&
        !msg.includes("duplicate column")
      ) {
        console.error("Schema statement failed:", stmt.substring(0, 80), msg);
      }
    }
  }
}

export async function POST() {
  try {
    await ensureSchema();

    let upserted = 0;
    for (const n of NICHES) {
      const score = calcCompositeScore(n);
      await db.niche.upsert({
        where: { name: n.name },
        create: { ...n, compositeScore: score },
        update: { ...n, compositeScore: score },
      });
      upserted++;
    }
    return NextResponse.json({
      ok: true,
      count: upserted,
      note: "Niches updated with realistic 2025-2026 benchmarks (creator RPMs, monetization safety scores)",
    });
  } catch (e) {
    console.error("seed error", e);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    await ensureSchema();
    const niches = await db.niche.findMany({
      orderBy: { compositeScore: "desc" },
    });
    return NextResponse.json({ niches });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
