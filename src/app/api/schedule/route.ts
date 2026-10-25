import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const slots = await db.publishingSlot.findMany({
    include: { video: { include: { niche: true } } },
    orderBy: { scheduledAt: "asc" },
  });
  return NextResponse.json({ slots });
}

export async function POST(req: Request) {
  try {
    const { videoId, scheduledAt, platform } = await req.json();
    if (!videoId || !scheduledAt) {
      return NextResponse.json(
        { error: "videoId and scheduledAt required" },
        { status: 400 }
      );
    }
    const slot = await db.publishingSlot.create({
      data: {
        videoId,
        scheduledAt: new Date(scheduledAt),
        platform: platform ?? "youtube",
      },
    });
    await db.videoProject.update({
      where: { id: videoId },
      data: { status: "scheduled" },
    });
    return NextResponse.json({ slot });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
