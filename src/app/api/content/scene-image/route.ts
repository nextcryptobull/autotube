import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

// Cloudflare Workers AI — free tier, fast image generation (3-10s per image)
//
// Free tier: 10,000 Neurons/day (~50-100 image generations)
// Models (verify at https://developers.cloudflare.com/workers-ai/models/):
//   - @cf/stability/stable-diffusion-xl-base-1.0 (widely available, 8-12s)
//   - @cf/stability/stable-diffusion-v1-5-inpainting
//   - @cf/blackforestlabs/flux-1-schnell (faster, 3-5s — may not be available in all accounts)
//   - @cf/lyssbio/deviantart-image-mix-1.2
//
// API: POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/{model}
// The model identifier with @cf/ prefix must be URL-encoded because it contains
// special characters. Cloudflare's router is strict about the path format.
// Headers: Authorization: Bearer {API_TOKEN}
// Body: { "prompt": "..." }
// Response: image binary directly (content-type: image/png or image/jpeg)
//
// We convert to base64 data URL and store in Scene.imageUrl.

// Use SDXL base 1.0 — the most widely-available model on Cloudflare Workers AI.
// Switch to @cf/blackforestlabs/flux-1-schnell for faster generation if your
// account has access (some accounts don't).
const CF_MODEL = "@cf/stability/stable-diffusion-xl-base-1.0";

interface CFErrorResponse {
  success: boolean;
  errors: { code: number; message: string }[];
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

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !apiToken) {
      return NextResponse.json(
        {
          error:
            "Cloudflare Workers AI credentials not set. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN on Vercel. Get them at https://dash.cloudflare.com → Workers & Pages → AI → API Tokens.",
        },
        { status: 500 }
      );
    }

    const styleCue =
      "cinematic documentary still, dramatic lighting, depth of field, rich color grade, no text overlay, no watermark, no logo";
    const fullPrompt = `${nextScene.brollPrompt}. ${styleCue}`;

    // Retry with 45s abort timeout per call (Cloudflare is usually 3-10s,
    // but heavy load can push it to 30-40s on first cold start)
    let imageBytes: Uint8Array | null = null;
    let lastError: string | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 2000));
      }
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);

        // URL-encode the model name (Cloudflare's router is strict about
        // special chars like @ and / in the path). Some routers reject
        // literal @cf/... in the URL.
        const encodedModel = encodeURIComponent(CF_MODEL);
        const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${encodedModel}`;

        const resp = await fetch(apiUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ prompt: fullPrompt }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!resp.ok) {
          // Cloudflare returns JSON error body
          const errBody = await resp.text();
          lastError = `HTTP ${resp.status}: ${errBody.substring(0, 200)}`;
          if (resp.status === 429) continue; // retry on rate limit
          break; // non-retriable error
        }

        // Cloudflare returns image binary directly (image/jpeg)
        // The content-type header tells us which format
        const contentType = resp.headers.get("content-type") ?? "image/jpeg";
        const ab = await resp.arrayBuffer();
        imageBytes = new Uint8Array(ab);

        if (imageBytes.length === 0) {
          // Sometimes Cloudflare returns JSON error with 200 status
          const errJson = JSON.parse(
            new TextDecoder().decode(ab)
          ) as CFErrorResponse;
          lastError =
            errJson.errors?.[0]?.message ?? "Empty response from Cloudflare";
          break;
        }

        // Get the format from content-type
        const fmt = contentType.includes("png")
          ? "png"
          : contentType.includes("webp")
          ? "webp"
          : "jpeg";

        // Convert to base64 data URL
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
              provider: "cloudflare-workers-ai",
              model: CF_MODEL,
              storage: "data-url",
              size: "1024x1024 (CF default)",
            }),
          },
        });

        const remainingScenes = video.scenes.filter(
          (s) => s.order > nextScene.order && !s.imageUrl
        ).length;

        if (
          nextScene.order === video.scenes[video.scenes.length - 1].order
        ) {
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
          provider: "cloudflare-workers-ai",
        });
      } catch (err) {
        const errMsg = (err as Error).message;
        if (errMsg.includes("aborted") || errMsg.includes("timeout")) {
          return NextResponse.json(
            {
              error:
                "Cloudflare AI took too long (>45s). Click Generate Scene Images again to retry.",
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
          lastError ??
          "Cloudflare Workers AI failed to generate image. Check your CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN env vars.",
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
