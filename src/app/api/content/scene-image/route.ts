import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getZai } from "@/lib/zai";

export const runtime = "nodejs";
export const maxDuration = 120;

// Vercel serverless has a read-only filesystem — we can't write PNGs to
// public/generated/. Instead, we store the base64 image as a data URL
// directly in the Scene.imageUrl field (TEXT column, can hold any string).
//
// Tradeoff: each scene image is ~500KB-1MB of base64 in the DB. With a 9GB
// Turso database, that's ~9,000-18,000 scenes — plenty for a small channel.
// For larger deployments, switch to Cloudflare R2 (free 10GB).

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

    const zai = await getZai();

    if (!process.env.ZAI_BASE_URL || !process.env.ZAI_API_KEY) {
      return NextResponse.json(
        { error: "Z.ai API credentials not set" },
        { status: 500 }
      );
    }

    const size = video.format === "shorts" ? "864x1152" : "1440x720";
    const styleCue =
      "cinematic documentary still, dramatic lighting, depth of field, rich color grade, no text overlay, no watermark, no logo";

    const updatedScenes: { id: string; imageUrl: string }[] = [];
    const errors: string[] = [];

    // Helper to wait between image gen calls (avoid Z.ai 429 rate limit)
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    for (const scene of video.scenes) {
      const fullPrompt = `${scene.brollPrompt}. ${styleCue}`;
      try {
        const response = await zai.images.generations.create({
          prompt: fullPrompt,
          size,
        });
        const b64 = response.data?.[0]?.base64;
        if (!b64) {
          // Z.ai may have returned an error response instead of an image
          const errResp = (response as { error?: { message?: string } }).error;
          const errMsg = errResp?.message ?? "No base64 in response";
          errors.push(`Scene ${scene.order}: ${errMsg}`);
          updatedScenes.push({ id: scene.id, imageUrl: "" });
          continue;
        }
        // Store as data URL — works in <img src="data:image/png;base64,...">
        const dataUrl = `data:image/png;base64,${b64}`;
        await db.scene.update({
          where: { id: scene.id },
          data: { imageUrl: dataUrl },
        });
        await db.generatedAsset.create({
          data: {
            videoId,
            type: "scene-image",
            url: dataUrl,
            metaJson: JSON.stringify({ sceneOrder: scene.order, size, storage: "data-url" }),
          },
        });
        updatedScenes.push({ id: scene.id, imageUrl: dataUrl });
      } catch (err) {
        const errMsg = (err as Error).message ?? "Unknown error";
        errors.push(`Scene ${scene.order}: ${errMsg}`);
        console.error("scene image fail", scene.id, errMsg);
        updatedScenes.push({ id: scene.id, imageUrl: "" });
      }
      // Throttle to avoid Z.ai 429
      await sleep(3000);
    }

    // Optionally generate a thumbnail too
    const scriptPayload = video.scriptJson
      ? (JSON.parse(video.scriptJson) as { thumbnailPrompt?: string })
      : null;
    let thumbnailUrl: string | null = null;
    if (scriptPayload?.thumbnailPrompt) {
      try {
        await sleep(2000);
        const tResp = await zai.images.generations.create({
          prompt: `${scriptPayload.thumbnailPrompt}. High contrast YouTube thumbnail style, bold focal subject, dark cinematic background, no text, no watermark`,
          size: "1440x720",
        });
        const tB64 = tResp.data?.[0]?.base64;
        if (tB64) {
          thumbnailUrl = `data:image/png;base64,${tB64}`;
          await db.videoProject.update({
            where: { id: videoId },
            data: { thumbnailUrl, status: "imaged" },
          });
        }
      } catch (err) {
        console.error("thumbnail fail", err);
      }
    } else {
      await db.videoProject.update({
        where: { id: videoId },
        data: { status: "imaged" },
      });
    }

    return NextResponse.json({
      ok: true,
      scenes: updatedScenes,
      thumbnailUrl,
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
