import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Auto-bootstrap: if the Niche table doesn't exist yet (fresh Turso DB),
// redirect to POST /api/seed which creates the schema + seeds niches.
// This makes /api/niches self-heal on first deploy.
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
    const msg = (e as Error).message ?? "";
    // If the table doesn't exist, the schema hasn't been pushed yet.
    // Trigger the bootstrap path.
    if (msg.includes("no such table") || msg.includes("does not exist")) {
      try {
        const seedRes = await fetch(
          `${process.env.VERCEL_URL ?? "http://localhost:3000"}/api/seed`,
          { method: "POST" }
        );
        if (seedRes.ok) {
          // Retry the query after schema is created
          const niches = await db.niche.findMany({
            orderBy: { compositeScore: "desc" },
            include: { _count: { select: { videos: true } } },
          });
          return NextResponse.json({ niches, bootstrapped: true });
        }
      } catch (retryErr) {
        console.error("bootstrap retry failed", retryErr);
      }
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
