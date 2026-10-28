import { NextResponse } from "next/server";

// GET /api/youtube/auth
// Redirects the user to Google's OAuth consent screen.
// After consent, Google redirects back to /api/youtube/callback?code=...

export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId) {
    return NextResponse.json(
      { error: "GOOGLE_CLIENT_ID env var not set. Create OAuth credentials at https://console.cloud.google.com/apis/credentials" },
      { status: 500 }
    );
  }

  // Build the redirect URI dynamically from the request's host
  // On Vercel, use x-forwarded-proto header (internal request may be http:
  // even though the browser used https:). Must match what the callback uses.
  const url = new URL(req.url);
  const host = req.headers.get("host") || url.host;
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const protocol = forwardedProto || (process.env.NODE_ENV === "production" ? "https:" : "http:");
  const origin = `${protocol}//${host}`;
  const redirectUri = `${origin}/api/youtube/callback`;

  // Google OAuth 2.0 consent screen URL
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set(
    "scope",
    "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly"
  );
  authUrl.searchParams.set("access_type", "offline"); // get refresh token
  authUrl.searchParams.set("prompt", "consent"); // force consent to get refresh token
  authUrl.searchParams.set("state", redirectUri); // pass redirect URI for verification

  // Redirect the browser to Google
  return NextResponse.redirect(authUrl.toString());
}
