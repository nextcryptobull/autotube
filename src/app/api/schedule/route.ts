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

export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    // Find the slot first (to get the videoId for status reset)
    const slot = await db.publishingSlot.findUnique({
      where: { id },
      select: { videoId: true },
    });

    if (!slot) {
      return NextResponse.json({ error: "Slot not found" }, { status: 404 });
    }

    // Delete the slot
    await db.publishingSlot.delete({ where: { id } });

    // Reset the video status from "scheduled" back to "imaged" or "voiced"
    await db.videoProject.update({
      where: { id: slot.videoId },
      data: { status: "imaged" },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, scheduledAt } = await req.json();
    if (!id || !scheduledAt) {
      return NextResponse.json(
        { error: "id and scheduledAt required" },
        { status: 400 }
      );
    }

    const updated = await db.publishingSlot.update({
      where: { id },
      data: { scheduledAt: new Date(scheduledAt) },
      include: { video: { include: { niche: true } } },
    });

    return NextResponse.json({ slot: updated });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
