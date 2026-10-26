import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import type { Config } from "@libsql/client";

/**
 * AutoTube Studio database client.
 *
 * Uses the libsql driver adapter (Prisma 6.x GA feature) to route queries
 * to either:
 *   - A local SQLite file (DATABASE_URL=file:./db/custom.db) for dev
 *   - A Turso remote database (DATABASE_URL=libsql://...?authToken=...) for prod
 *
 * IMPORTANT: PrismaLibSQL constructor takes a Config object (not a libsql
 * Client instance). The adapter creates the libsql client internally from
 * the config. Passing a Client instance causes the adapter to read the URL
 * from the wrong field, resulting in 'URL_INVALID: The URL undefined'.
 *
 * Static ESM imports are required (NOT dynamic require()) because
 * Turbopack on Vercel bundles dynamic require() incorrectly.
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

  // Build the libsql Config — the adapter will create the client internally.
  // For libsql:// URLs, the authToken is already in the query string.
  // For file: URLs, no authToken is needed (local SQLite file).
  const config: Config = { url };

  // PrismaLibSQL takes Config, NOT a Client instance.
  // This was the bug — passing a Client caused URL_INVALID errors.
  const adapter = new PrismaLibSQL(config);
  return new PrismaClient({ adapter });
}

function getClient(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  globalForPrisma.prisma = createPrismaClient();
  return globalForPrisma.prisma;
}

// Lazy Proxy: PrismaClient is only created on first DB method call,
// NOT at module load. This is critical for `next build` to succeed
// even when DATABASE_URL isn't set at build time.
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
