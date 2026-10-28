import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { createClient } from "@libsql/client";

/**
 * Get the current logged-in user's ID.
 * Returns null if not authenticated.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return null;

  try {
    const libsql = createClient({ url: dbUrl });
    const result = await libsql.execute({
      sql: `SELECT "id" FROM "users" WHERE "email" = ?`,
      args: [session.user.email],
    });
    return result.rows.length > 0 ? (result.rows[0].id as string) : null;
  } catch {
    return null;
  }
}

/**
 * Get the current user's email for display.
 */
export async function getCurrentUserEmail(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.email ?? null;
}
