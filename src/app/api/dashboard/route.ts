import { NextResponse } from "next/server";
import { db } from "@/lib/db";

async function tryBootstrap(): Promise<boolean> {
  // Call /api/seed to ensure schema + niches exist
  try {
    const baseUrl = process.env.VERCEL_URL ?? "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/seed`, { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const [niches, videos, slots, assets] = await Promise.all([
      db.niche.findMany({ orderBy: { compositeScore: "desc" }, take: 5 }),
      db.videoProject.findMany({
        include: { niche: true },
        orderBy: { createdAt: "desc" },
      }),
      db.publishingSlot.findMany({
        include: { video: { include: { niche: true } } },
        orderBy: { scheduledAt: "asc" },
      }),
      db.generatedAsset.findMany(),
    ]);

    const statusCounts = videos.reduce(
      (acc, v) => {
        acc[v.status] = (acc[v.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const scheduledThisWeek = slots.filter(
      (s) =>
        new Date(s.scheduledAt).getTime() <=
        Date.now() + 7 * 24 * 60 * 60 * 1000
    ).length;

    const topNiches = niches.map((n) => ({
      id: n.id,
      name: n.name,
      compositeScore: n.compositeScore,
      trendScore: n.trendScore,
      avgCpm: Math.round((n.cpmLow + n.cpmHigh) / 2),
      category: n.category,
    }));

    return NextResponse.json({
      counts: {
        niches: niches.length,
        videos: videos.length,
        scheduled: slots.length,
        assets: assets.length,
        scheduledThisWeek,
      },
      statusCounts,
      topNiches,
      recentVideos: videos.slice(0, 5).map((v) => ({
        id: v.id,
        title: v.title,
        format: v.format,
        status: v.status,
        nicheName: v.niche?.name ?? "",
        durationSec: v.durationSec,
        thumbnailUrl: v.thumbnailUrl,
      })),
      upcomingSlots: slots.slice(0, 5).map((s) => ({
        id: s.id,
        scheduledAt: s.scheduledAt,
        videoTitle: s.video?.title ?? "",
        nicheName: s.video?.niche?.name ?? "",
        platform: s.platform,
      })),
    });
  } catch (e) {
    const msg = (e as Error).message ?? "";
    // If table doesn't exist, try to bootstrap schema + seed niches
    if (msg.includes("no such table") || msg.includes("does not exist")) {
      const bootstrapped = await tryBootstrap();
      if (bootstrapped) {
        // Retry the original query
        return GET();
      }
    }
    console.error("dashboard error", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
