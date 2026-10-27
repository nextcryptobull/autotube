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
    // referrer parameter identifies our app to Pollinations — they grant
    // higher rate limits to apps with referrers.
    const seed = Math.floor(Math.random() * 1000000);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
      fullPrompt
    )}?width=1280&height=720&nologo=true&seed=${seed}&referrer=autotube-studio.vercel.app`;

    // Fallback: Picsum.photos returns random high-quality stock photos.
    // No rate limits, always works, supports seed for unique images per scene.
    // Doesn't match the prompt (random photos), but better than no image.
    const fallbackUrl = `https://picsum.photos/seed/scene-${nextScene.order}-${seed}/1280/720`;

    // Helper: try a URL with redirect-following (Picsum returns 302)
    async function tryFetch(url: string): Promise<Uint8Array | null> {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);
        // fetch follows redirects by default
        const resp = await fetch(url, {
          signal: controller.signal,
          redirect: "follow",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            Accept: "image/jpeg,image/png,*/*",
          },
        });
        clearTimeout(timeoutId);
        if (!resp.ok) {
          console.log(`Fetch failed: ${url.substring(0, 60)} → HTTP ${resp.status}`);
          return null;
        }
        const ab = await resp.arrayBuffer();
        const bytes = new Uint8Array(ab);
        if (bytes.length === 0) return null;
        return bytes;
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes("aborted") || msg.includes("timeout")) {
          console.log(`Fetch timeout: ${url.substring(0, 60)}`);
        }
        return null;
      }
    }

    // Try Pollinations first (AI-generated, matches prompt exactly).
    // If rate-limited (402) or fails, fall back to Picsum (random stock photos).
    let imageBytes: Uint8Array | null = null;
    let usedFallback = false;
    let lastError: string | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        // 5s backoff — gives Pollinations a breather
        await new Promise((r) => setTimeout(r, 5000));
      }
      imageBytes = await tryFetch(pollinationsUrl);
      if (imageBytes) break;
      lastError = `Pollinations attempt ${attempt + 1} failed`;
    }

    // If Pollinations failed both attempts, fall back to Picsum (random photos)
    if (!imageBytes) {
      console.log("Pollinations failed, trying Picsum fallback");
      imageBytes = await tryFetch(fallbackUrl);
      if (imageBytes) {
        usedFallback = true;
      } else {
        return NextResponse.json(
          {
            ok: false,
            sceneId: nextScene.id,
            sceneOrder: nextScene.order,
            error:
              lastError +
              " AND Picsum fallback also failed. Network issue. Try again in a minute.",
          },
          { status: 502 }
        );
      }
    }

    // Convert to base64 data URL
    const b64 = Buffer.from(imageBytes).toString("base64");
    const dataUrl = `data:image/jpeg;base64,${b64}`;

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
          provider: usedFallback ? "picsum" : "pollinations",
          storage: "data-url",
          size: "1280x720",
          seed,
          fallbackUsed: usedFallback,
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
      provider: usedFallback ? "picsum" : "pollinations",
      fallbackUsed: usedFallback,
    });
  } catch (e) {
    console.error("scene image error", e);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
