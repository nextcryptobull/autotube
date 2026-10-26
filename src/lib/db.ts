import { PrismaClient } from "@prisma/client";

/**
 * AutoTube Studio database client.
 *
 * Routes based on the DATABASE_URL scheme:
 *   - `file:...`     → use Prisma's built-in SQLite engine (local dev)
 *   - `libsql://...` → use the libsql driver adapter (Turso / Vercel)
 *
 * Lazy-initialized via a Proxy so the client is created only on the first DB
 * method call, NOT at module load. This is critical for Vercel — Next.js
 * bundles API route modules at build time, and we don't want to instantiate
 * PrismaClient (which validates DATABASE_URL) during `next build`.
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

  if (url.startsWith("libsql://") || url.startsWith("libsql:")) {
    // Use the libsql driver adapter for Turso / remote libSQL servers.
    // Dynamic import to avoid bundling the adapter when running locally
    // with a file: URL (which uses Prisma's built-in SQLite engine).
    const { PrismaLibSQL } = require("@prisma/adapter-libsql");
    const { createClient } = require("@libsql/client");
    const libsql = createClient({ url });
    const adapter = new PrismaLibSQL(libsql);
    return new PrismaClient({ adapter });
  }

  // file: URLs (local SQLite) — use Prisma's native engine, no adapter needed.
  return new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["query"],
  });
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
