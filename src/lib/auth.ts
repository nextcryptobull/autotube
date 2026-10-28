import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { db } from "@/lib/db";
import { createClient } from "@libsql/client";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user }) {
      // Upsert user in DB via raw SQL (avoids Prisma client issues)
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl || !user.email) return true;

      try {
        const libsql = createClient({ url: dbUrl });
        // Ensure users table exists
        await libsql.execute(
          `CREATE TABLE IF NOT EXISTS "users" (
            "id" TEXT PRIMARY KEY NOT NULL,
            "name" TEXT,
            "email" TEXT NOT NULL UNIQUE,
            "emailVerified" DATETIME,
            "image" TEXT,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
          )`
        );
        // Upsert user
        await libsql.execute({
          sql: `INSERT INTO "users" ("id", "name", "email", "image", "updatedAt")
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT ("email") DO UPDATE SET
                  "name" = excluded."name",
                  "image" = excluded."image",
                  "updatedAt" = excluded."updatedAt"`,
          args: [
            `user-${Date.now()}`,
            user.name ?? null,
            user.email,
            user.image ?? null,
            new Date().toISOString(),
          ],
        });
      } catch (err) {
        console.error("signIn: user upsert failed", err);
        // Non-blocking — user can still use the app even if DB write fails
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUrl = process.env.DATABASE_URL;
        if (dbUrl) {
          try {
            const libsql = createClient({ url: dbUrl });
            const result = await libsql.execute({
              sql: `SELECT "id" FROM "users" WHERE "email" = ?`,
              args: [user.email],
            });
            if (result.rows.length > 0) {
              token.userId = result.rows[0].id as string;
            }
          } catch {
            // Non-blocking
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        (session.user as any).id = token.userId;
      }
      return session;
    },
  },
};
