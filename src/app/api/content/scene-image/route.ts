import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

// Z.ai public API image generation returns {data: [{url: "..."}]} — a
// temporary URL (30-day expiry) instead of base64 data. We bypass the
// z-ai-web-dev-sdk (which tries to download & convert to base64 and fails)
// and call the endpoint directly with fetch.
//
// The URL is stored in Scene.imageUrl. The client renders via
// <img src={url}> which works fine with remote URLs.
//
// Tradeoff: URLs expire after 30 days. For long-term storage, switch
// to Cloudflare R2 (free 10GB) — fetch the image from Z.ai, upload to
// R2, store the R2 URL.

interface ZaiImageResponse {
  created?: number;
  data?: Array<{ url?: string; b64_json?: string }>;
  content_filter?: unknown[];
  error?: { code?: string | number; message?: string };
}

export async function POST(req: Request) {
  try {
    const { videoId } = await req.json();
    if (!videoId) {
      return NextResponse.json({ error: "videoId required" }, { status: 400 });
    }
    const video = await db.videoProject.findUnique({
      where: { id: videoId },
      include: { scenes: { orderBy: { order: "asc" } }, niche: true },
    });
    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }
    if (!video.scenes.length) {
      return NextResponse.json(
        { error: "No scenes to image. Generate script first." },
        { status: 400 }
      );
    }

    const baseUrl = process.env.ZAI_BASE_URL;
    const apiKey = process.env.ZAI_API_KEY;
    if (!baseUrl || !apiKey) {
      return NextResponse.json(
        { error: "Z.ai API credentials not set" },
        { status: 500 }
      );
    }

    // Z.ai's glm-image model accepts only certain sizes — use 1280x1280
    // (default) which always works. For shorts, also 1280x1280 (square
    // works for vertical too — the AI generates appropriately).
    const size = "1280x1280";
    const styleCue =
      "cinematic documentary still, dramatic lighting, depth of field, rich color grade, no text overlay, no watermark, no logo";

    const updatedScenes: { id: string; imageUrl: string }[] = [];
    const errors: string[] = [];

    // Retry helper with exponential backoff for Z.ai 429 rate limits.
    // Image gen has strict per-second limits — even back-to-back calls hit 429.
    async function fetchWithRetry(
      url: string,
      body: unknown,
      maxRetries = 3
    ): Promise<Response> {
      let lastResp: Response | null = null;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "Accept-Language": "en-US,en",
          },
          body: JSON.stringify(body),
        });
        if (resp.status !== 429) return resp;
        // 429 — back off and retry
        lastResp = resp;
        const waitMs = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s, 16s
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, waitMs));
        }
      }
      return lastResp!;
    }

    for (const scene of video.scenes) {
      const fullPrompt = `${scene.brollPrompt}. ${styleCue}`;
      try {
        const resp = await fetchWithRetry(`${baseUrl}/images/generations`, {
          model: "glm-image",
          prompt: fullPrompt,
          size,
          quality: "standard",
        });
        if (!resp.ok) {
          const errBody = await resp.text();
          errors.push(
            `Scene ${scene.order}: HTTP ${resp.status} - ${errBody.substring(0, 200)}`
          );
          updatedScenes.push({ id: scene.id, imageUrl: "" });
          continue;
        }
        const result = (await resp.json()) as ZaiImageResponse;
        const imageUrl = result.data?.[0]?.url;
        if (!imageUrl) {
          const errMsg = result.error?.message ?? "No URL in response";
          errors.push(`Scene ${scene.order}: ${errMsg}`);
          updatedScenes.push({ id: scene.id, imageUrl: "" });
          continue;
        }
        await db.scene.update({
          where: { id: scene.id },
          data: { imageUrl },
        });
        await db.generatedAsset.create({
          data: {
            videoId,
            type: "scene-image",
            url: imageUrl,
            metaJson: JSON.stringify({
              sceneOrder: scene.order,
              size,
              storage: "zai-remote-url",
              expires: "30 days",
            }),
          },
        });
        updatedScenes.push({ id: scene.id, imageUrl });
      } catch (err) {
        const errMsg = (err as Error).message ?? "Unknown error";
        errors.push(`Scene ${scene.order}: ${errMsg}`);
        console.error("scene image fail", scene.id, errMsg);
        updatedScenes.push({ id: scene.id, imageUrl: "" });
      }
    }

    // Mark video as imaged (skip thumbnail to stay under 60s Vercel timeout)
    await db.videoProject.update({
      where: { id: videoId },
      data: { status: "imaged" },
    });

    return NextResponse.json({
      ok: true,
      scenes: updatedScenes,
      thumbnailUrl: null,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    console.error("scene image error", e);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
