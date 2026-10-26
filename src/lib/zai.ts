import fs from "fs";
import path from "path";
import os from "os";

/**
 * z-ai-web-dev-sdk helper for Vercel serverless.
 *
 * The SDK requires a `.z-ai-config` file in one of:
 *   1. ./ (project dir — read-only on Vercel serverless)
 *   2. ~/ (home dir — usually read-only on Vercel)
 *   3. /etc/ (read-only on Vercel)
 *
 * Since none of these are writable on Vercel, we work around it by:
 *   1. Reading ZAI_BASE_URL and ZAI_API_KEY from process.env (set in
 *      Vercel project Settings → Environment Variables)
 *   2. Writing the config to /tmp/.z-ai-config (the one writable dir
 *      on Vercel serverless)
 *   3. Setting process.env.HOME = '/tmp' so the SDK's home-dir lookup
 *      finds the config file
 *
 * On local dev, the existing .z-ai-config in the project root works
 * as before — no env vars needed.
 */

let initialized = false;

export async function ensureZaiConfig(): Promise<void> {
  if (initialized) return;

  const baseUrl = process.env.ZAI_BASE_URL;
  const apiKey = process.env.ZAI_API_KEY;

  // If env vars are set, write a runtime config to /tmp and redirect HOME there.
  if (baseUrl && apiKey) {
    const config = {
      baseUrl,
      apiKey,
      ...(process.env.ZAI_CHAT_ID ? { chatId: process.env.ZAI_CHAT_ID } : {}),
      ...(process.env.ZAI_USER_ID ? { userId: process.env.ZAI_USER_ID } : {}),
    };

    // Vercel serverless: /tmp is the only writable directory.
    // Local dev: also write to /tmp so behavior is consistent.
    const tmpDir = "/tmp";
    const configPath = path.join(tmpDir, ".z-ai-config");

    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), {
        mode: 0o600,
      });
      // Set HOME so the SDK finds ~/.z-ai-config in /tmp
      process.env.HOME = tmpDir;
    } catch (err) {
      console.error("Failed to write .z-ai-config to /tmp:", err);
      throw new Error(
        "Failed to initialize Z.ai SDK. Make sure /tmp is writable (it should be on Vercel)."
      );
    }
  }

  // For local dev (no env vars set), the SDK will fall back to searching
  // ./z-ai-config in the project root, which already exists.

  initialized = true;
}

/**
 * Get a configured ZAI instance.
 *
 * Usage:
 *   import { getZai } from "@/lib/zai";
 *   const zai = await getZai();
 *   const completion = await zai.chat.completions.create({...});
 */
export async function getZai() {
  await ensureZaiConfig();
  const ZAI = (await import("z-ai-web-dev-sdk")).default;
  return ZAI.create();
}
