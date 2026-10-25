import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Get all niches sorted by score
export async function GET() {
  try {
    const niches = await db.niche.findMany({
      orderBy: { compositeScore: "desc" },
      include: {
        _count: { select: { videos: true } },
      },
    });
    return NextResponse.json({ niches });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
