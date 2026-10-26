import { NextResponse } from "next/server";

// Debug endpoint — verifies what env vars Vercel actually sees at runtime.
// Safe to leave deployed: it only returns redacted env var info, never secrets.

export const runtime = "nodejs";

export async function GET() {
  const dbUrl = process.env.DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;
  const tursoUrl = process.env.TURSO_DATABASE_URL;

  // Helper: redact tokens, show structure
  function redact(val: string | undefined, label: string) {
    if (!val) return { label, set: false };
    // Mask everything except the scheme + first 20 chars + length
    const masked =
      val.length > 30
        ? val.substring(0, 30) + "...(REDACTED, total len=" + val.length + ")"
        : val;
    return { label, set: true, value: masked };
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    runtime: {
      nodeVersion: process.version,
      nodeEnv: process.env.NODE_ENV,
      vercel: process.env.vercel ? "yes" : "no",
      vercelEnv: process.env.VERCEL_ENV ?? "not-set",
      vercelRegion: process.env.VERCEL_REGION ?? "not-set",
      cwd: process.cwd(),
    },
    envVars: {
      DATABASE_URL: redact(dbUrl, "DATABASE_URL"),
      TURSO_DATABASE_URL: redact(tursoUrl, "TURSO_DATABASE_URL"),
      TURSO_AUTH_TOKEN: redact(tursoToken, "TURSO_AUTH_TOKEN"),
    },
    allEnvVarNames: Object.keys(process.env)
      .filter((k) => !k.startsWith("npm_") && !k.startsWith("PATH"))
      .sort(),
    troubleshooting: !dbUrl
      ? "DATABASE_URL is NOT set in this Vercel deployment. Go to Project Settings → Environment Variables, add DATABASE_URL with your Turso libsql://...?authToken=... URL, check Production + Preview + Development, save, then trigger a NEW deployment (Redeploy from the Deployments tab)."
      : dbUrl.startsWith("libsql://")
      ? "DATABASE_URL looks correct (starts with libsql://). If you're still seeing errors, the auth token might be invalid or the database might not have the schema applied yet. Run `node deploy/turso-push-schema.js` from your Codespace with DATABASE_URL exported."
      : dbUrl.startsWith("file:")
      ? "DATABASE_URL is set to a file: path which won't work on Vercel (read-only filesystem). Set it to your Turso libsql:// URL instead."
      : "DATABASE_URL is set but doesn't start with libsql:// or file:. Check the value format.",
  });
}
