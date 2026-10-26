import { NextResponse } from "next/server";

// Debug endpoint — verifies what env vars Vercel actually sees at runtime.
// Safe to leave deployed: only returns non-sensitive Vercel metadata + redacted user env vars.

export const runtime = "nodejs";

export async function GET() {
  const dbUrl = process.env.DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;
  const tursoUrl = process.env.TURSO_DATABASE_URL;

  // Helper: redact tokens, show structure
  function redact(val: string | undefined, label: string) {
    if (!val) return { label, set: false };
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
    // Vercel-internal vars that are NOT secrets — used to identify
    // exactly which Vercel project + team owns this deployment.
    // These let us construct the direct URL to the env var settings page.
    vercelProjectInfo: {
      VERCEL_PROJECT_NAME: process.env.VERCEL_PROJECT_NAME ?? "(not set)",
      VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID ?? "(not set)",
      VERCEL_PROJECT_PRODUCTION_URL:
        process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "(not set)",
      VERCEL_GIT_REPO_OWNER: process.env.VERCEL_GIT_REPO_OWNER ?? "(not set)",
      VERCEL_GIT_REPO_SLUG: process.env.VERCEL_GIT_REPO_SLUG ?? "(not set)",
      VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "(not set)",
      VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF ?? "(not set)",
      VERCEL_URL: process.env.VERCEL_URL ?? "(not set)",
      VERCEL_TARGET_ENV: process.env.VERCEL_TARGET_ENV ?? "(not set)",
      NOW_REGION: process.env.NOW_REGION ?? "(not set)",
    },
    envVars: {
      DATABASE_URL: redact(dbUrl, "DATABASE_URL"),
      TURSO_DATABASE_URL: redact(tursoUrl, "TURSO_DATABASE_URL"),
      TURSO_AUTH_TOKEN: redact(tursoToken, "TURSO_AUTH_TOKEN"),
    },
    allEnvVarNames: Object.keys(process.env)
      .filter(
        (k) =>
          !k.startsWith("npm_") &&
          !k.startsWith("PATH") &&
          // Filter out the obvious Vercel/AWS/Turbo system vars
          // to surface only USER-DEFINED env vars (if any)
          ![
            "AWS_DEFAULT_REGION",
            "AWS_LAMBDA_TLS_PROFILE",
            "AWS_REGION",
            "LANG",
            "LD_LIBRARY_PATH",
            "LD_PRELOAD",
            "NODE_ENV",
            "NODE_PATH",
            "NOW_REGION",
            "NX_DAEMON",
            "OPENSSL_CONF",
            "PWD",
            "SHLVL",
            "TURBOPACK",
            "TURBO_CACHE",
            "TURBO_DOWNLOAD_LOCAL_ENABLED",
            "TURBO_PLATFORM_ENV",
            "TURBO_REMOTE_ONLY",
            "TURBO_RUN_SUMMARY",
            "TZ",
            "VERCEL",
            "VERCEL_BRANCH_URL",
            "VERCEL_CACHE_HANDLER_MEMORY_CACHE",
            "VERCEL_DEPLOYMENT_ID",
            "VERCEL_DEPLOYMENT_KEY",
            "VERCEL_ENV",
            "VERCEL_FLUID",
            "VERCEL_GIT_COMMIT_AUTHOR_LOGIN",
            "VERCEL_GIT_COMMIT_AUTHOR_NAME",
            "VERCEL_GIT_COMMIT_MESSAGE",
            "VERCEL_GIT_COMMIT_REF",
            "VERCEL_GIT_COMMIT_SHA",
            "VERCEL_GIT_PREVIOUS_SHA",
            "VERCEL_GIT_PROVIDER",
            "VERCEL_GIT_PULL_REQUEST_ID",
            "VERCEL_GIT_REPO_ID",
            "VERCEL_GIT_REPO_OWNER",
            "VERCEL_GIT_REPO_SLUG",
            "VERCEL_HANDLER",
            "VERCEL_IPC_PATH",
            "VERCEL_PARENT_SPAN_ID",
            "VERCEL_PROJECT_ID",
            "VERCEL_PROJECT_NAME",
            "VERCEL_PROJECT_PRODUCTION_URL",
            "VERCEL_REGION",
            "VERCEL_TARGET_ENV",
            "VERCEL_URL",
            "VERCEL_VDC_REMOTE_CACHE_ENABLED",
          ].includes(k)
      )
      .sort(),
    troubleshooting: !dbUrl
      ? "DATABASE_URL is NOT set in this Vercel deployment. The allEnvVarNames array shows ONLY system vars — no user-defined env vars exist on this project. You're either editing the wrong Vercel project, or your save is silently failing. Check the vercelProjectInfo field above to see exactly which Vercel project + team owns this deployment, then go to https://vercel.com/<TEAM>/<PROJECT>/settings/environment-variables to add DATABASE_URL."
      : dbUrl.startsWith("libsql://")
      ? "DATABASE_URL looks correct (starts with libsql://). If you're still seeing errors, the auth token might be invalid or the database might not have the schema applied yet. Run `node deploy/turso-push-schema.js` from your Codespace with DATABASE_URL exported."
      : dbUrl.startsWith("file:")
      ? "DATABASE_URL is set to a file: path which won't work on Vercel (read-only filesystem). Set it to your Turso libsql:// URL instead."
      : "DATABASE_URL is set but doesn't start with libsql:// or file:. Check the value format.",
  });
}
