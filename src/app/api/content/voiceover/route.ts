import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const runtime = "nodejs";
export const maxDuration = 120;

const GEN_DIR = path.join(process.cwd(), "public", "generated", "audio");
const TMP_DIR = path.join(process.cwd(), "public", "generated", "audio", "tmp");
const PUBLIC_PREFIX = "/generated/audio";

// TTS API limits to 1024 chars per request. Split long narration into
// chunks <= 1000 chars at sentence boundaries.
function chunkText(text: string, max = 1000): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let buf = "";
  for (const sentence of text.match(/[^.!?]+[.!?]*/g) ?? [text]) {
    if ((buf + sentence).length > max) {
      if (buf) chunks.push(buf);
      buf = sentence;
    } else {
      buf += sentence;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
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
    if (!video.scenes.length) {
      return NextResponse.json(
        { error: "No scenes to narrate. Generate script first." },
        { status: 400 }
      );
    }

    fs.mkdirSync(GEN_DIR, { recursive: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });

    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();

    const scriptPayload = video.scriptJson
      ? (JSON.parse(video.scriptJson) as { outro?: string })
      : null;

    const sceneAudios: string[] = [];

    for (const scene of video.scenes) {
      const chunks = chunkText(scene.narration);
      const partFiles: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const partName = `${videoId}-scene-${scene.order}-part-${i}.wav`;
        const partPath = path.join(TMP_DIR, partName);
        try {
          const response = await zai.audio.tts.create({
            input: chunks[i],
            voice: "tongtong",
            speed: 1.0,
            response_format: "wav",
            stream: false,
          });
          const ab = await response.arrayBuffer();
          fs.writeFileSync(partPath, Buffer.from(new Uint8Array(ab)));
          partFiles.push(partPath);
        } catch (err) {
          console.error("tts part fail", scene.id, i, err);
        }
      }
      if (partFiles.length === 0) continue;
      // Concat parts for this scene
      const sceneFile = `${videoId}-scene-${scene.order}.wav`;
      const scenePath = path.join(TMP_DIR, sceneFile);
      if (partFiles.length === 1) {
        fs.copyFileSync(partFiles[0], scenePath);
      } else {
        const listFile = path.join(TMP_DIR, `${videoId}-scene-${scene.order}-list.txt`);
        fs.writeFileSync(
          listFile,
          partFiles.map((f) => `file '${f}'`).join("\n")
        );
        await execAsync(
          `ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${scenePath}" 2>&1`
        );
      }
      sceneAudios.push(scenePath);
    }

    // Outro
    if (scriptPayload?.outro) {
      const chunks = chunkText(scriptPayload.outro);
      const partFiles: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const partName = `${videoId}-outro-part-${i}.wav`;
        const partPath = path.join(TMP_DIR, partName);
        try {
          const response = await zai.audio.tts.create({
            input: chunks[i],
            voice: "tongtong",
            speed: 1.0,
            response_format: "wav",
            stream: false,
          });
          const ab = await response.arrayBuffer();
          fs.writeFileSync(partPath, Buffer.from(new Uint8Array(ab)));
          partFiles.push(partPath);
        } catch (err) {
          console.error("outro tts fail", err);
        }
      }
      if (partFiles.length > 0) {
        const outroFile = `${videoId}-outro.wav`;
        const outroPath = path.join(TMP_DIR, outroFile);
        if (partFiles.length === 1) {
          fs.copyFileSync(partFiles[0], outroPath);
        } else {
          const listFile = path.join(TMP_DIR, `${videoId}-outro-list.txt`);
          fs.writeFileSync(
            listFile,
            partFiles.map((f) => `file '${f}'`).join("\n")
          );
          await execAsync(
            `ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${outroPath}" 2>&1`
          );
        }
        sceneAudios.push(outroPath);
      }
    }

    if (sceneAudios.length === 0) {
      return NextResponse.json(
        { error: "All TTS attempts failed" },
        { status: 502 }
      );
    }

    // Final concatenation across scenes — re-encode for safety
    const finalName = `${videoId}.wav`;
    const finalPath = path.join(GEN_DIR, finalName);
    const listFile = path.join(TMP_DIR, `${videoId}-final-list.txt`);
    fs.writeFileSync(
      listFile,
      sceneAudios.map((f) => `file '${f}'`).join("\n")
    );
    try {
      await execAsync(
        `ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${finalPath}" 2>&1`
      );
    } catch (err) {
      // Fallback: try re-encoding
      console.warn("concat copy failed, re-encoding", err);
      await execAsync(
        `ffmpeg -y -f concat -safe 0 -i "${listFile}" -ar 22050 -ac 1 "${finalPath}" 2>&1`
      );
    }

    const url = `${PUBLIC_PREFIX}/${finalName}`;
    await db.videoProject.update({
      where: { id: videoId },
      data: { voiceoverUrl: url, status: "voiced" },
    });
    await db.generatedAsset.create({
      data: {
        videoId,
        type: "voiceover",
        url,
        metaJson: JSON.stringify({
          voice: "tongtong",
          scenes: video.scenes.length,
        }),
      },
    });

    // Clean up tmp folder for this video
    try {
      const tmpFiles = fs
        .readdirSync(TMP_DIR)
        .filter((f) => f.startsWith(`${videoId}-`));
      for (const f of tmpFiles) {
        try {
          fs.unlinkSync(path.join(TMP_DIR, f));
        } catch {}
      }
    } catch {}

    return NextResponse.json({ ok: true, url, sceneCount: sceneAudios.length });
  } catch (e) {
    console.error("voiceover error", e);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
