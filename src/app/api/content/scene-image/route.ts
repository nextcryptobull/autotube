import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

// Pollinations.ai — 100% free image generation, no auth, no signup, no card
//
// URL: https://image.pollinations.ai/prompt/{URL-encoded-prompt}?width=1024&height=576&nologo=true
// Returns: JPEG image binary directly (no JSON wrapper)
//
// Features:
// - Uses FLUX model under the hood (state-of-the-art quality)
// - 3-8s per image typically
// - No rate limits (community-funded, completely free)
// - No API key, no env vars, no setup
// - Supports custom dimensions and seed for reproducibility
//
// We convert JPEG bytes to base64 data URL and store in Scene.imageUrl.

interface SceneOut {
  heading: string;
  narration: string;
  brollPrompt: string;
  durationSec: number;
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

    // Find the FIRST scene without an image (one-scene-per-call pattern)
    const nextScene = video.scenes.find((s) => !s.imageUrl);
    if (!nextScene) {
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

    const styleCue =
      "cinematic documentary still, dramatic lighting, depth of field, rich color grade, no text overlay, no watermark, no logo";
    const fullPrompt = `${nextScene.brollPrompt}. ${styleCue}`;

    // Use 1280x720 (16:9, YouTube-ready aspect ratio)
    // Seed makes the result reproducible for the same prompt
    const seed = Math.floor(Math.random() * 1000000);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
      fullPrompt
    )}?width=1280&height=720&nologo=true&seed=${seed}`;

    // Retry with 45s abort timeout per call
    let imageBytes: Uint8Array | null = null;
    let lastError: string | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 2000));
      }
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);

        const resp = await fetch(imageUrl, {
          signal: controller.signal,
          headers: {
            // Some image CDNs require a user agent
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            Accept: "image/jpeg,image/png,*/*",
          },
        });
        clearTimeout(timeoutId);

        if (!resp.ok) {
          const errBody = await resp.text();
          lastError = `HTTP ${resp.status}: ${errBody.substring(0, 200)}`;
          if (resp.status === 429 || resp.status >= 500) continue;
          break;
        }

        const ab = await resp.arrayBuffer();
        imageBytes = new Uint8Array(ab);

        if (imageBytes.length === 0) {
          lastError = "Empty response from Pollinations";
          continue;
        }

        // Convert to base64 data URL
        const contentType = resp.headers.get("content-type") ?? "image/jpeg";
        const fmt = contentType.includes("png") ? "png" : "jpeg";
        const b64 = Buffer.from(imageBytes).toString("base64");
        const dataUrl = `data:image/${fmt};base64,${b64}`;

        await db.scene.update({
          where: { id: nextScene.id },
          data: { imageUrl: dataUrl },
        });
        await db.generatedAsset.create({
          data: {
            videoId,
            type: "scene-image",
            url: dataUrl,
            metaJson: JSON.stringify({
              sceneOrder: nextScene.order,
              provider: "pollinations",
              model: "flux (community-funded)",
              storage: "data-url",
              size: "1280x720",
              seed,
            }),
          },
        });

        const remainingScenes = video.scenes.filter(
          (s) => s.order > nextScene.order && !s.imageUrl
        ).length;

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
          imageUrl: dataUrl,
          scenesRemaining: remainingScenes,
          provider: "pollinations",
        });
      } catch (err) {
        const errMsg = (err as Error).message;
        if (errMsg.includes("aborted") || errMsg.includes("timeout")) {
          return NextResponse.json(
            {
              error:
                "Pollinations took too long (>45s). Click Generate Scene Images again to retry.",
            },
            { status: 504 }
          );
        }
        lastError = errMsg;
      }
    }

    return NextResponse.json(
      {
        ok: false,
        sceneId: nextScene.id,
        sceneOrder: nextScene.order,
        error:
          lastError ?? "Pollinations failed to generate image. Try again.",
      },
      { status: 502 }
    );
  } catch (e) {
    console.error("scene image error", e);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
