# AutoTube Studio

AI-powered YouTube channel engine that auto-selects trending niches, generates
documentary-style video scripts, voiceovers, and scene imagery, then projects
revenue from 2026 CPM/RPM benchmarks.

## What it does

- **Trend Lab** — 15 trending 2026 niches seeded from OutlierKit / vidIQ / Fliki /
  Virvid benchmarks, auto-scored on a 0-100 composite of trend momentum × CPM ×
  competition-inverse × evergreen factor × automation ease.
- **Content Studio** — Pick niche + format + optional topic hint → AI generates a
  cinematic documentary script with hook, scene-by-scene narration, B-roll
  prompts, outro, and thumbnail prompt. One-click buttons then generate:
  - AI voiceover (chunked TTS via `z-ai-web-dev-sdk` + ffmpeg concat to bypass
    the SDK's 1024-char TTS limit)
  - Per-scene cinematic images (throttled to dodge 429s)
- **Pipeline** — Kanban view of all videos across 6 production stages.
- **Schedule** — Day-grouped publishing calendar.
- **Money Tracker** — Projects blended revenue per niche (30/90/365 day views).

## Stack

- Next.js 16 (App Router) + TypeScript 5
- Tailwind CSS 4 + shadcn/ui (New York)
- Prisma 6 + SQLite (local) — switch to Postgres for production / Vercel
- `z-ai-web-dev-sdk` (LLM + TTS + image generation)
- Recharts for visualizations

## Local development

```bash
bun install
cp .env.example .env           # adjust DATABASE_URL if needed
bun run db:push                # create SQLite schema
bun run dev                    # http://localhost:3000
```

First visit auto-seeds 15 trending niches via `POST /api/seed`.

## Production deployment

**Important for Vercel / serverless:**

1. **Database**: SQLite is read-only on serverless. Switch to Vercel Postgres,
   Supabase, or Turso by changing the Prisma `datasource` provider and
   `DATABASE_URL` env var.
2. **File writes**: The voiceover and scene-image routes write to
   `public/generated/`. Serverless filesystems are read-only. Switch to
   Vercel Blob, S3, or Cloudinary for asset storage.
3. **ffmpeg**: The voiceover route shells out to `ffmpeg` to concatenate
   TTS chunks. ffmpeg is not available in Vercel's Node.js runtime. Either
   remove the concat step (play scenes sequentially client-side) or move
   voiceover assembly to an external worker (Render, Fly.io, AWS Lambda
   layer with ffmpeg).

For a turnkey Vercel deploy, set the `DATABASE_URL` env var in Vercel project
settings before triggering the build.

## Repository

- GitHub: https://github.com/nextcryptobull/autotube
