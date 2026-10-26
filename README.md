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
- Prisma 6 + **Turso (libSQL)** via driver adapter — works for both local SQLite
  files and remote Turso databases with zero schema changes
- `z-ai-web-dev-sdk` (LLM + TTS + image generation)
- Recharts for visualizations

## Local development

```bash
npm install
cp .env.example .env           # default DATABASE_URL points to local SQLite
npx prisma db push             # create SQLite schema
npm run dev                    # http://localhost:3000
```

First visit auto-seeds 15 trending niches via `POST /api/seed`.

## Production deployment (Vercel + Turso — fully free)

This stack runs end-to-end on free tiers of Vercel + Turso. No credit card required
for either.

### 1. Create a Turso database (free, GitHub login)

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Sign in with GitHub (no card)
turso auth login

# Create a database
turso db create autotube

# Get the connection URL
turso db show autotube --url
# → libsql://autotube-<your-username>.turso.io

# Create an auth token
turso db tokens create autotube
# → eyJhbGciOi...

# Combine them into the DATABASE_URL:
# libsql://autotube-<your-username>.turso.io?authToken=eyJhbGciOi...
```

Alternatively, use the Turso web UI at https://turso.tech — same steps, click-driven.

### 2. Push the Prisma schema to Turso

Run this from your local clone (with your Turso `DATABASE_URL` in `.env`):

```bash
DATABASE_URL="libsql://autotube-<username>.turso.io?authToken=<token>" \
  npx prisma db push --accept-data-loss
```

This creates all 6 tables (`Niche`, `VideoProject`, `Scene`, `GeneratedAsset`,
`PublishingSlot`, `MonetizationRecord`) in your Turso database.

### 3. Set env vars in Vercel

In your Vercel project settings → **Environment Variables**, add:

| Name | Value | Environments |
|---|---|---|
| `DATABASE_URL` | `libsql://autotube-<username>.turso.io?authToken=<token>` | Production + Preview + Development |

That's it. Push to `main` (or trigger a redeploy) — Vercel builds the Next.js app,
the build pipeline runs `prisma generate` (via `postinstall`), and the runtime
calls into Turso over HTTP for all DB operations.

### 4. Seed the niche data

After deployment, hit your Vercel URL once to auto-seed:

```bash
curl -X POST https://your-vercel-url.vercel.app/api/seed
# → {"ok":true,"count":15}
```

The dashboard, Trend Lab, Pipeline, Schedule, and Money Tracker tabs now work
end-to-end.

## Known runtime limitations on Vercel (free tier)

The Content Studio's "Generate Voiceover" and "Generate Scene Images" buttons will
**fail on Vercel** because they need:

1. `ffmpeg` to concatenate TTS chunks into a single WAV (not installed in Vercel's
   Node.js runtime)
2. A writable filesystem at `public/generated/` (Vercel serverless FS is read-only)

Everything else works fine. To fix these two routes, either:

- Run locally (Linux/macOS with ffmpeg installed — `brew install ffmpeg` or
  `apt install ffmpeg`)
- Or refactor: drop ffmpeg (play scene audio chunks sequentially on the client) +
  use Cloudflare R2 (free 10 GB) for asset storage instead of `public/generated/`

## Other deployment options

- **Oracle Cloud Always Free VM** — fully free, runs everything natively (SQLite
  + ffmpeg + persistent disk). See `deploy/README.md` for the step-by-step guide.
- **Self-hosted VPS** — Hetzner CX22 ($4.5/mo) or any Linux VM with persistent
  disk and `apt install ffmpeg`.

## Repository

- GitHub: https://github.com/nextcryptobull/autotube
- Deploy scripts for Oracle Cloud: `deploy/` directory
- Issue tracker: https://github.com/nextcryptobull/autotube/issues
