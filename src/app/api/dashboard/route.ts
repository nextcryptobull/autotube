import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
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

  // 30-day projected revenue based on pipeline state (rough)
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
}
