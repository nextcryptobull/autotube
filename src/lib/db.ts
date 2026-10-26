import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Lazily instantiate the Prisma client.
 *
 * Why lazy: Next.js bundles API route modules at build time, which means
 * `db.ts` is imported during `next build`. If we eagerly create the Prisma
 * client (which calls `createClient({url})` from @libsql/client), the libsql
 * client will try to parse DATABASE_URL during the build — and fail if the
 * URL is missing or invalid (e.g. the user hasn't set their Turso URL yet).
 *
 * With lazy init via a Proxy, the Prisma client is only created on the first
 * actual DB method call (which only happens at request time, not build time).
 * This decouples build-time bundling from runtime DB access.
 */
function getClient(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL environment variable is not set. " +
        "For local dev: DATABASE_URL=file:./db/custom.db. " +
        "For Turso: DATABASE_URL=libsql://<host>?authToken=<token> " +
        "(get yours from `turso db show autotube --url` and " +
        "`turso db tokens create autotube`)."
    );
  }

  // libsql client accepts BOTH "file:./local.db" and "libsql://..." URLs.
  const libsql = createClient({ url });
  const adapter = new PrismaLibSQL(libsql);
  globalForPrisma.prisma = new PrismaClient({ adapter });
  return globalForPrisma.prisma;
}

// Proxy that triggers lazy init on first property access.
// This means `db.niche.findMany()` works exactly as before — the client
// is created on the first call, not at module load time.
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = (client as never as Record<string | symbol, unknown>)[prop];
    // Bind methods so `this` is preserved when destructured
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
}) as PrismaClient;
