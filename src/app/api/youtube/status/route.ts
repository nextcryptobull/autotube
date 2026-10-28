import { NextResponse } from "next/server";
import { createClient } from "@libsql/client";

// GET /api/youtube/status
// Returns whether YouTube is connected and basic channel info.
// Does NOT return the access token (use /api/youtube/token for that).

export async function GET() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json({ connected: false });
  }

  const libsql = createClient({ url: dbUrl });

  try {
    const result = await libsql.execute(
      `SELECT "channelId", "channelTitle", "expiresAt" FROM "YouTubeToken" WHERE "id" = 'singleton'`
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ connected: false });
    }

    const row = result.rows[0];
    return NextResponse.json({
      connected: true,
      channelId: row.channelId,
      channelTitle: row.channelTitle,
      expiresAt: row.expiresAt,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
