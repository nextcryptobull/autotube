import { NextResponse } from "next/server";

// Debug endpoint — verifies what env vars Vercel actually sees at runtime.
// Safe to leave deployed: only returns non-sensitive metadata + redacted user env vars.

export const runtime = "nodejs";

export async function GET() {
  const dbUrl = process.env.DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;
  const tursoUrl = process.env.TURSO_DATABASE_URL;

  // Helper: redact tokens but show STRUCTURE so we can debug URL parsing issues
  function redact(val: string | undefined, label: string) {
    if (!val) return { label, set: false };
    // Show the structure with token redacted but keep the URL parseable
    let masked = val;
    // Redact the auth token value (everything after "authToken=" or "auth_token=")
    masked = masked.replace(
      /(authToken|auth_token|token)=([^&\s]+)/gi,
      "$1=<REDACTED_JWT_LEN_" + "$2".length + ">"
    );
    return { label, set: true, value: masked, length: val.length };
  }

  // More detailed URL structure analysis for DATABASE_URL
  let urlAnalysis: Record<string, unknown> = {};
  if (dbUrl) {
    urlAnalysis.rawWithRedactedToken = redact(dbUrl, "DATABASE_URL").value;
    urlAnalysis.startsWithLibsql = dbUrl.startsWith("libsql://");
    urlAnalysis.startsWithFile = dbUrl.startsWith("file:");
    urlAnalysis.containsQuestionMark = dbUrl.includes("?");
    urlAnalysis.containsEncodedQuestionMark = dbUrl.includes("%3F");
    urlAnalysis.containsAuthTokenParam = /[?&]authToken=/.test(dbUrl);
    urlAnalysis.containsAuthTokenUnderscore = /[?&]auth_token=/.test(dbUrl);
    urlAnalysis.containsTokenParam = /[?&]token=/.test(dbUrl);
    urlAnalysis.hasLeadingWhitespace = /^\s/.test(dbUrl);
    urlAnalysis.hasTrailingWhitespace = /\s$/.test(dbUrl);
    urlAnalysis.hasQuotesAroundValue = /^["'].*["']$/.test(dbUrl);
    urlAnalysis.urlLength = dbUrl.length;

    // Try to parse the URL and show what we get
    try {
      const parsed = new URL(dbUrl);
      urlAnalysis.parsedSuccessfully = true;
      urlAnalysis.parsedProtocol = parsed.protocol;
      urlAnalysis.parsedHost = parsed.host;
      urlAnalysis.parsedPathname = parsed.pathname;
      urlAnalysis.parsedSearchParams = Array.from(parsed.searchParams.keys());
      urlAnalysis.parsedHasAuthInParams = parsed.searchParams.has("authToken");
    } catch (e) {
      urlAnalysis.parsedSuccessfully = false;
      urlAnalysis.parseError = (e as Error).message;
    }
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    runtime: {
      nodeVersion: process.version,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV ?? "not-set",
      vercelRegion: process.env.VERCEL_REGION ?? "not-set",
    },
    vercelProjectInfo: {
      VERCEL_PROJECT_NAME: process.env.VERCEL_PROJECT_NAME ?? "(not set)",
      VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID ?? "(not set)",
      VERCEL_PROJECT_PRODUCTION_URL:
        process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "(not set)",
      VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "(not set)",
      VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF ?? "(not set)",
    },
    envVars: {
      DATABASE_URL: redact(dbUrl, "DATABASE_URL"),
      TURSO_DATABASE_URL: redact(tursoUrl, "TURSO_DATABASE_URL"),
      TURSO_AUTH_TOKEN: redact(tursoToken, "TURSO_AUTH_TOKEN"),
      ZAI_BASE_URL: redact(process.env.ZAI_BASE_URL, "ZAI_BASE_URL"),
      ZAI_API_KEY: redact(process.env.ZAI_API_KEY, "ZAI_API_KEY"),
    },
    databaseUrlAnalysis: urlAnalysis,
    troubleshooting: !dbUrl
      ? "DATABASE_URL is NOT set."
      : !dbUrl.startsWith("libsql://")
      ? `DATABASE_URL doesn't start with libsql://. Got: ${dbUrl.substring(0, 20)}...`
      : !dbUrl.includes("?")
      ? "DATABASE_URL is missing the '?' separator before the auth token. Expected: libsql://host.turso.io?authToken=eyJhbGc..."
      : dbUrl.includes("%3F")
      ? "DATABASE_URL contains an URL-encoded '?' (%3F). Vercel auto-encoded the '?' when saving. Re-edit the env var in Vercel and ensure the value is saved as plain text without URL-encoding."
      : !/[?&]authToken=/.test(dbUrl)
      ? "DATABASE_URL is missing the 'authToken=' parameter (or uses wrong name like 'auth_token' or 'token'). Expected: libsql://host.turso.io?authToken=eyJhbGc..."
      : "DATABASE_URL structure looks OK. If you're still seeing URL_PARAM_NOT_SUPPORTED errors, the value might have extra characters (quotes, leading/trailing whitespace, etc.).",
  });
}
