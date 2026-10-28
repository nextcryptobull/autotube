import { NextResponse } from "next/server";
import { createClient } from "@libsql/client";

// GET /api/youtube/callback?code=...&state=...
// Google redirects here after the user consents.
// We exchange the auth code for access + refresh tokens, store them in the DB,
// and redirect back to the dashboard.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  // Build origin from headers (Vercel-safe)
  const host = req.headers.get("host") || url.host;
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const proto = forwardedProto
    ? forwardedProto.endsWith(":") ? forwardedProto : forwardedProto + ":"
    : "https:";
  const origin = `${proto}//${host}`;

  if (error) {
    return NextResponse.redirect(
      new URL(`/?youtube_error=${encodeURIComponent(error)}`, origin)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/?youtube_error=No auth code in callback", origin)
    );
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        new URL("/?youtube_error=GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET env vars not set on Vercel", origin)
      );
    }

    const redirectUri = `${origin}/api/youtube/callback`;

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("Token exchange failed:", errBody);
      return NextResponse.redirect(
        new URL(`/?youtube_error=${encodeURIComponent("Token exchange failed: " + errBody.substring(0, 200))}`, origin)
      );
    }

    const tokens = await tokenRes.json();
    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token;
    const expiresIn = tokens.expires_in;
    const expiresAt = new Date(Date.now() + (expiresIn - 60) * 1000);

    if (!accessToken || !refreshToken) {
      return NextResponse.redirect(
        new URL("/?youtube_error=No access_token or refresh_token in response", origin)
      );
    }

    // Fetch channel info
    let channelId: string | null = null;
    let channelTitle: string | null = null;
    try {
      const channelRes = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (channelRes.ok) {
        const channelData = await channelRes.json();
        channelId = channelData.items?.[0]?.id ?? null;
        channelTitle = channelData.items?.[0]?.snippet?.title ?? null;
      }
    } catch {
      // Non-critical
    }

    // Store tokens in DB via raw SQL (avoids Prisma client issues)
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      return NextResponse.redirect(
        new URL("/?youtube_error=DATABASE_URL not set", origin)
      );
    }

    const libsql = createClient({ url: dbUrl });

    // Ensure table exists
    try {
      await libsql.execute(
        `CREATE TABLE IF NOT EXISTS "YouTubeToken" (
          "id" TEXT PRIMARY KEY NOT NULL DEFAULT 'singleton',
          "accessToken" TEXT NOT NULL,
          "refreshToken" TEXT NOT NULL,
          "expiresAt" DATETIME NOT NULL,
          "channelId" TEXT,
          "channelTitle" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`
      );
    } catch {
      // Table might already exist
    }

    // Upsert token
    await libsql.execute({
      sql: `INSERT INTO "YouTubeToken" ("id", "accessToken", "refreshToken", "expiresAt", "channelId", "channelTitle", "updatedAt")
            VALUES ('singleton', ?, ?, ?, ?, ?, ?)
            ON CONFLICT ("id") DO UPDATE SET
              "accessToken" = excluded."accessToken",
              "refreshToken" = excluded."refreshToken",
              "expiresAt" = excluded."expiresAt",
              "channelId" = excluded."channelId",
              "channelTitle" = excluded."channelTitle",
              "updatedAt" = excluded."updatedAt"`,
      args: [accessToken, refreshToken, expiresAt.toISOString(), channelId, channelTitle, new Date().toISOString()],
    });

    // Redirect back to dashboard with success
    return NextResponse.redirect(
      new URL("/?youtube_connected=true", origin)
    );
  } catch (err) {
    console.error("YouTube callback error:", err);
    const msg = (err as Error).message ?? "Unknown error";
    return NextResponse.redirect(
      new URL(`/?youtube_error=${encodeURIComponent("Callback error: " + msg.substring(0, 200))}`, origin)
    );
  }
}
