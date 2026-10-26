import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createClient } from "@libsql/client";

// Initial niches sourced from 2026 trend research
// (OutlierKit, vidIQ, Fliki, Virvid benchmarks — see worklog.md)
const NICHES = [
  {
    name: "Personal Finance & Investing",
    category: "Finance",
    cpmLow: 18,
    cpmHigh: 36,
    shortsRpm: 0.18,
    trendScore: 78,
    competition: 72,
    evergreenFactor: 0.85,
    automationEase: 0.55,
    sampleChannels: "Graham Stephan, Andrei Jikh, MagnatesMoney",
    bestFor: "long-form",
  },
  {
    name: "AI News & Tool Reviews",
    category: "AI / Tech",
    cpmLow: 10,
    cpmHigh: 22,
    shortsRpm: 0.12,
    trendScore: 95,
    competition: 48,
    evergreenFactor: 0.45,
    automationEase: 0.9,
    sampleChannels: "Matt Wolfe, AI Explained, The AI Advantage",
    bestFor: "hybrid",
  },
  {
    name: "Business Case Studies & Documentaries",
    category: "Business",
    cpmLow: 10,
    cpmHigh: 25,
    shortsRpm: 0.1,
    trendScore: 82,
    competition: 55,
    evergreenFactor: 0.9,
    automationEase: 0.7,
    sampleChannels: "MagnatesMedia, ColdFusion, Company Man",
    bestFor: "long-form",
  },
  {
    name: "Make Money Online & Side Hustles",
    category: "Finance",
    cpmLow: 10,
    cpmHigh: 25,
    shortsRpm: 0.14,
    trendScore: 85,
    competition: 68,
    evergreenFactor: 0.6,
    automationEase: 0.85,
    sampleChannels: "Iman Gadzhi, Ali Abdaal, Make Money Alex",
    bestFor: "hybrid",
  },
  {
    name: "True Crime & Mystery",
    category: "Entertainment",
    cpmLow: 5,
    cpmHigh: 12,
    shortsRpm: 0.06,
    trendScore: 74,
    competition: 65,
    evergreenFactor: 0.95,
    automationEase: 0.8,
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
    sampleChannels: "Kings and Generals, History Matters",
    bestFor: "long-form",
  },
  {
    name: "Motivation & Self-Improvement",
    category: "Self-Help",
    cpmLow: 6,
    cpmHigh: 15,
    shortsRpm: 0.08,
    trendScore: 71,
    competition: 60,
    evergreenFactor: 0.88,
    automationEase: 0.85,
    sampleChannels: "Motiversity, Menfulness, Diary of a CEO",
    bestFor: "hybrid",
  },
  {
    name: "Health & Wellness Explainers",
    category: "Health",
    cpmLow: 5,
    cpmHigh: 15,
    shortsRpm: 0.09,
    trendScore: 66,
    competition: 58,
    evergreenFactor: 0.75,
    automationEase: 0.7,
    sampleChannels: "What I've Learned, Thomas DeLauer",
    bestFor: "hybrid",
  },
  {
    name: "AI Tool Tutorials (Screen Recording)",
    category: "AI / Tech",
    cpmLow: 8,
    cpmHigh: 20,
    shortsRpm: 0.11,
    trendScore: 92,
    competition: 40,
    evergreenFactor: 0.4,
    automationEase: 0.95,
    sampleChannels: "Kevin Stratvert, AI Tutorials Hub",
    bestFor: "long-form",
  },
  {
    name: "Tech News Roundups",
    category: "AI / Tech",
    cpmLow: 8,
    cpmHigh: 18,
    shortsRpm: 0.1,
    trendScore: 88,
    competition: 52,
    evergreenFactor: 0.35,
    automationEase: 0.95,
    sampleChannels: "ColdFusion, TechAlt, Two Minute Papers",
    bestFor: "hybrid",
  },
  {
    name: "Meditation & Sleep Music",
    category: "Wellness",
    cpmLow: 4,
    cpmHigh: 10,
    shortsRpm: 0.04,
    trendScore: 55,
    competition: 70,
    evergreenFactor: 0.99,
    automationEase: 1.0,
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
    sampleChannels: "VaatiVidya, TheSpiffingBrit",
    bestFor: "hybrid",
  },
  {
    name: "Kids Educational Animations",
    category: "Kids",
    cpmLow: 3,
    cpmHigh: 8,
    shortsRpm: 0.03,
    trendScore: 62,
    competition: 80,
    evergreenFactor: 0.95,
    automationEase: 0.6,
    sampleChannels: "Cocomelon, Ms Rachel",
    bestFor: "long-form",
  },
  {
    name: "Real Estate Investing",
    category: "Finance",
    cpmLow: 12,
    cpmHigh: 28,
    shortsRpm: 0.15,
    trendScore: 73,
    competition: 47,
    evergreenFactor: 0.7,
    automationEase: 0.65,
    sampleChannels: "BiggerPockets, Meet Kevin",
    bestFor: "long-form",
  },
  {
    name: "SaaS Review & Software Comparisons",
    category: "AI / Tech",
    cpmLow: 12,
    cpmHigh: 24,
    shortsRpm: 0.13,
    trendScore: 90,
    competition: 35,
    evergreenFactor: 0.5,
    automationEase: 0.9,
    sampleChannels: "Landon Schertz, Toolify, SaaS Pedia",
    bestFor: "hybrid",
  },
];

// Weighted composite score
function calcComposite(n: {
  trendScore: number;
  cpmLow: number;
  cpmHigh: number;
  competition: number;
  evergreenFactor: number;
  automationEase: number;
}): number {
  const avgCpm = (n.cpmLow + n.cpmHigh) / 2;
  const cpmNorm = Math.min(100, (avgCpm / 30) * 100);
  const competitionScore = (1 - n.competition / 100) * 100;
  const score =
    0.3 * n.trendScore +
    0.25 * cpmNorm +
    0.2 * competitionScore +
    0.15 * n.evergreenFactor * 100 +
    0.1 * n.automationEase * 100;
  return Math.round(score * 10) / 10;
}

// Schema SQL — applied if tables don't exist yet (idempotent).
// This makes /api/seed self-bootstrapping: hit it once on a fresh
// Turso database and it'll create all 6 tables AND seed the niches.
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

// Apply the schema directly via libsql client (bypasses Prisma which
// doesn't support raw DDL on libsql). Idempotent — safe to run on every
// /api/seed call. CREATE TABLE IF NOT EXISTS skips existing tables.
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
      // "already exists" errors are fine — idempotent re-runs
      const msg = (err as Error).message ?? "";
      if (!msg.includes("already exists")) {
        console.error("Schema statement failed:", stmt.substring(0, 80), msg);
      }
    }
  }
}

export async function POST() {
  try {
    // 1. Ensure all tables exist (idempotent)
    await ensureSchema();

    // 2. Upsert all 15 niches
    let upserted = 0;
    for (const n of NICHES) {
      const score = calcComposite(n);
      await db.niche.upsert({
        where: { name: n.name },
        create: { ...n, compositeScore: score },
        update: { ...n, compositeScore: score },
      });
      upserted++;
    }
    return NextResponse.json({ ok: true, count: upserted });
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
    // Also ensure schema on GET (helps /api/niches work after first deploy)
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
