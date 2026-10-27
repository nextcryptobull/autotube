import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

// Process ONE scene per call (the first unimaged scene for the video).
// The client calls this endpoint multiple times to process all scenes.
// Each call fits comfortably within Vercel's 60s Hobby-tier timeout.
//
// Z.ai's image gen API:
// - Endpoint: POST {baseUrl}/images/generations
// - Model: glm-image
// - Returns: { data: [{ url: "https://..." }] } (URL valid for 30 days)
// - Rate limit: strict per-second, needs retry with backoff

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
      include: { scenes: { orderBy: { order: "asc" } } },
    });
    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    // Find the FIRST scene without an imageUrl
    const nextScene = video.scenes.find((s) => !s.imageUrl);
    if (!nextScene) {
      // All scenes have images — mark video as imaged and return done
      await db.videoProject.update({
        where: { id: videoId },
        data: { status: "imaged" },
      });
      return NextResponse.json({
        ok: true,
        done: true,
        message: "All scenes already have images",
        scenesRemaining: 0,
      });
    }

    const baseUrl = process.env.ZAI_BASE_URL;
    const apiKey = process.env.ZAI_API_KEY;
    if (!baseUrl || !apiKey) {
      return NextResponse.json(
        { error: "Z.ai API credentials not set" },
        { status: 500 }
      );
    }

    const size = "1280x1280";
    const styleCue =
      "cinematic documentary still, dramatic lighting, depth of field, rich color grade, no text overlay, no watermark, no logo";
    const fullPrompt = `${nextScene.brollPrompt}. ${styleCue}`;

    // Retry with exponential backoff for Z.ai 429 rate limits.
    // Reduced from 3 retries to 2 to stay safely under Vercel's 60s timeout.
    // Also add 45s AbortController per fetch call — if Z.ai is slow, we fail
    // cleanly with a clear error instead of Vercel's FUNCTION_INVOCATION_TIMEOUT.
    let imageUrl: string | null = null;
    let lastError: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 2000)); // 2s backoff
      }
      try {
        // Abort if Z.ai takes >45s — return a clean error rather than
        // letting Vercel's 60s function timeout kill us.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);
        const resp = await fetch(`${baseUrl}/images/generations`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "Accept-Language": "en-US,en",
          },
          body: JSON.stringify({
            model: "glm-image",
            prompt: fullPrompt,
            size,
            quality: "standard", // 5-10s vs 20s for hd (but Z.ai often takes 30-40s actual)
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!resp.ok) {
          const errBody = await resp.text();
          lastError = `HTTP ${resp.status}: ${errBody.substring(0, 200)}`;
          if (resp.status === 429) continue; // retry once more
          break; // non-retriable error
        }
        const result = (await resp.json()) as ZaiImageResponse;
        imageUrl = result.data?.[0]?.url ?? null;
        if (imageUrl) break;
        lastError = result.error?.message ?? "No URL in response";
        break;
      } catch (err) {
        const errMsg = (err as Error).message;
        if (errMsg.includes("aborted") || errMsg.includes("timeout")) {
          // Z.ai was too slow — return clean error, client will retry on next click
          return NextResponse.json(
            {
              error:
                "Z.ai image generation took too long (>45s). Click 'Generate Scene Images' again to retry — the same scene will be retried.",
            },
            { status: 504 }
          );
        }
        lastError = errMsg;
      }
    }

    if (!imageUrl) {
      return NextResponse.json(
        {
          ok: false,
          done: false,
          sceneId: nextScene.id,
          sceneOrder: nextScene.order,
          error: lastError ?? "Failed to generate image",
          scenesRemaining:
            video.scenes.filter((s) => !s.imageUrl).length,
        },
        { status: 502 }
      );
    }

    // Save the image URL to the scene
    await db.scene.update({
      where: { id: nextScene.id },
      data: { imageUrl },
    });
    await db.generatedAsset.create({
      data: {
        videoId,
        type: "scene-image",
        url: imageUrl,
        metaJson: JSON.stringify({
          sceneOrder: nextScene.order,
          size,
          storage: "zai-remote-url",
          expires: "30 days",
        }),
      },
    });

    const remainingScenes = video.scenes.filter(
      (s) => s.order > nextScene.order && !s.imageUrl
    ).length;

    // If this was the last scene, mark the video as imaged
    if (nextScene.order === video.scenes[video.scenes.length - 1].order) {
      await db.videoProject.update({
        where: { id: videoId },
        data: { status: "imaged" },
      });
    }

    return NextResponse.json({
      ok: true,
      done: remainingScenes === 0,
      sceneId: nextScene.id,
      sceneOrder: nextScene.order,
      imageUrl,
      scenesRemaining: remainingScenes,
    });
  } catch (e) {
    console.error("scene image error", e);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
