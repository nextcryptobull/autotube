import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

/**
 * AutoTube Studio database client.
 *
 * - For `libsql://` URLs (Turso / production on Vercel): uses the libsql
 *   driver adapter, which routes Prisma queries over HTTP to Turso.
 * - For `file:./local.db` URLs (local dev): uses the same libsql client
 *   (which accepts file: URLs natively) — keeps one code path.
 *
 * Lazy-initialized via a Proxy so PrismaClient isn't constructed at build
 * time (which would fail `next build` when DATABASE_URL isn't set yet).
 *
 * NOTE: We use static ESM imports (NOT dynamic require()) because
 * Turbopack on Vercel bundles dynamic require() calls differently —
 * the modules ended up as `undefined` at runtime, causing Prisma's
 * URL validator to throw `URL_INVALID: The URL 'undefined'`.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. " +
        "Local dev: DATABASE_URL=file:./db/custom.db. " +
        "Turso: DATABASE_URL=libsql://<host>?authToken=<token> " +
        "(get yours via `bash deploy/turso-setup.sh`)."
    );
  }

  // Both file: and libsql:// URLs are accepted by @libsql/client.
  // For libsql://, we use the driver adapter (HTTP transport to Turso).
  // For file:, libsql client opens the local SQLite file natively.
  const libsql = createClient({ url });
  const adapter = new PrismaLibSQL(libsql);
  return new PrismaClient({ adapter });
}

function getClient(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  globalForPrisma.prisma = createPrismaClient();
  return globalForPrisma.prisma;
}

// Lazy Proxy: PrismaClient is only created on first DB method call.
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop);
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
}) as PrismaClient;
