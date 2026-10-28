import { NextResponse } from "next/server";
import { createClient } from "@libsql/client";

// GET /api/youtube/token
// Returns the current access token (refreshing if expired) for client-side
// YouTube uploads. The browser uses this token to upload the MP4 directly
// to YouTube's resumable upload API.

export async function GET() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  const libsql = createClient({ url: dbUrl });

  try {
    const result = await libsql.execute(
      `SELECT "accessToken", "refreshToken", "expiresAt", "channelId", "channelTitle" FROM "YouTubeToken" WHERE "id" = 'singleton'`
    );

    if (result.rows.length === 0) {
      return NextResponse.json({
        connected: false,
        message: "YouTube not connected. Visit /api/youtube/auth to connect.",
      });
    }

    const row = result.rows[0];
    let accessToken = row.accessToken as string;
    const refreshToken = row.refreshToken as string;
    const expiresAt = new Date(row.expiresAt as string);
    const channelId = row.channelId as string | null;
    const channelTitle = row.channelTitle as string | null;

    // Check if the access token has expired
    if (Date.now() >= expiresAt.getTime() && clientId && clientSecret) {
      // Refresh the token
      const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (refreshRes.ok) {
        const newTokens = await refreshRes.json();
        accessToken = newTokens.access_token;
        const newExpiresAt = new Date(
          Date.now() + (newTokens.expires_in - 60) * 1000
        );

        // Update the stored token
        await libsql.execute({
          sql: `UPDATE "YouTubeToken" SET "accessToken" = ?, "expiresAt" = ?, "updatedAt" = ? WHERE "id" = 'singleton'`,
          args: [accessToken, newExpiresAt.toISOString(), new Date().toISOString()],
        });
      }
    }

    return NextResponse.json({
      connected: true,
      accessToken,
      channelId,
      channelTitle,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    return NextResponse.json({
      connected: false,
      error: (err as Error).message,
    });
  }
}
