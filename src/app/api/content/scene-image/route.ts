import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 120;

const GEN_DIR = path.join(process.cwd(), "public", "generated", "images");
const PUBLIC_PREFIX = "/generated/images";

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

    fs.mkdirSync(GEN_DIR, { recursive: true });

    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();

    // Determine the right image dimensions per format
    const size = video.format === "shorts" ? "864x1152" : "1440x720";

    const styleCue =
      "cinematic documentary still, dramatic lighting, depth of field, rich color grade, no text overlay, no watermark, no logo";

    const updatedScenes: { id: string; imageUrl: string }[] = [];

    // Helper to wait
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
          updatedScenes.push({ id: scene.id, imageUrl: "" });
          continue;
        }
        const buffer = Buffer.from(b64, "base64");
        const filename = `${videoId}-scene-${scene.order}.png`;
        const filepath = path.join(GEN_DIR, filename);
        fs.writeFileSync(filepath, buffer);
        const url = `${PUBLIC_PREFIX}/${filename}`;

        await db.scene.update({
          where: { id: scene.id },
          data: { imageUrl: url },
        });
        await db.generatedAsset.create({
          data: {
            videoId,
            type: "scene-image",
            url,
            metaJson: JSON.stringify({ sceneOrder: scene.order, size }),
          },
        });
        updatedScenes.push({ id: scene.id, imageUrl: url });
      } catch (err) {
        console.error("scene image fail", scene.id, err);
        updatedScenes.push({ id: scene.id, imageUrl: "" });
      }
      // Throttle to avoid 429 (image gen API rate limit)
      await sleep(3000);
    }

    // Optionally generate a thumbnail too
    const scriptPayload = video.scriptJson
      ? (JSON.parse(video.scriptJson) as { thumbnailPrompt?: string })
      : null;
    let thumbnailUrl: string | null = null;
    if (scriptPayload?.thumbnailPrompt) {
      try {
        // Wait before thumbnail too
        await sleep(2000);
        const tResp = await zai.images.generations.create({
          prompt: `${scriptPayload.thumbnailPrompt}. High contrast YouTube thumbnail style, bold focal subject, dark cinematic background, no text, no watermark`,
          size: "1440x720",
        });
        const tB64 = tResp.data?.[0]?.base64;
        if (tB64) {
          const tBuf = Buffer.from(tB64, "base64");
          const tFilename = `${videoId}-thumbnail.png`;
          fs.writeFileSync(path.join(GEN_DIR, tFilename), tBuf);
          thumbnailUrl = `${PUBLIC_PREFIX}/${tFilename}`;
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
    });
  } catch (e) {
    console.error("scene image error", e);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
