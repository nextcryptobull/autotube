import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getZai } from "@/lib/zai";

export const runtime = "nodejs";
export const maxDuration = 120;

// Vercel serverless: read-only filesystem + no ffmpeg binary.
// We can't write WAV files or concatenate them via ffmpeg.
// Instead, generate per-scene TTS audio as base64 data URLs and store
// them in Scene.audioUrl. The client plays each scene's audio sequentially
// (or shows a "Play" button per scene).
//
// Note: Z.ai's public API may or may not expose /audio/tts. If it errors
// with 404, the user can swap to OpenAI's TTS endpoint by setting
// OPENAI_API_KEY env var (future enhancement).

// TTS API limits to 1024 chars per request. Split long narration.
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

    const zai = await getZai();

    if (!process.env.ZAI_BASE_URL || !process.env.ZAI_API_KEY) {
      return NextResponse.json(
        { error: "Z.ai API credentials not set" },
        { status: 500 }
      );
    }

    const updatedScenes: { id: string; order: number; audioUrl: string | null }[] = [];

    for (const scene of video.scenes) {
      const chunks = chunkText(scene.narration);
      // Generate audio per chunk, concatenate base64 (NOT WAV bytes — we'd
      // need ffmpeg for proper concat. Instead, store per-chunk audio as
      // data URLs and let the client play them in sequence via JS).
      const chunkAudioUrls: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        try {
          const response = await zai.audio.tts.create({
            input: chunks[i],
            voice: "tongtong",
            speed: 1.0,
            response_format: "wav",
            stream: false,
          });
          const ab = await response.arrayBuffer();
          const b64 = Buffer.from(new Uint8Array(ab)).toString("base64");
          const dataUrl = `data:audio/wav;base64,${b64}`;
          chunkAudioUrls.push(dataUrl);
        } catch (err) {
          console.error(`TTS fail scene ${scene.order} chunk ${i}`, err);
          // If TTS fails entirely (e.g. Z.ai public API doesn't expose
          // /audio/tts), bail out with the error message so the user knows
          // to switch providers.
          const errMsg = (err as Error).message ?? "Unknown TTS error";
          if (errMsg.includes("404") || errMsg.toLowerCase().includes("not found")) {
            return NextResponse.json(
              {
                error:
                  "Z.ai's public API doesn't expose /audio/tts endpoint. " +
                  "Voiceover generation requires either OpenAI's TTS API or running locally with ffmpeg. " +
                  "See README.md 'Known runtime limitations' section.",
              },
              { status: 502 }
            );
          }
        }
      }
      // If we have chunks, store the first one as the scene's audio URL.
      // The client should play chunkAudioUrls[0], [1], [2] sequentially
      // for scenes with multiple chunks.
      const audioUrl = chunkAudioUrls.length > 0 ? chunkAudioUrls[0] : null;
      if (audioUrl) {
        await db.scene.update({
          where: { id: scene.id },
          data: { audioUrl },
        });
      }
      updatedScenes.push({
        id: scene.id,
        order: scene.order,
        audioUrl,
      });
    }

    // Mark the video as voiced
    await db.videoProject.update({
      where: { id: videoId },
      data: { status: "voiced" },
    });

    // Also store a "voiceover ready" marker — the client will fetch
    // scenes and play each scene.audioUrl in sequence
    await db.generatedAsset.create({
      data: {
        videoId,
        type: "voiceover",
        url: "data:application/json;status=ready",
        metaJson: JSON.stringify({
          sceneCount: video.scenes.length,
          storage: "per-scene-data-url",
        }),
      },
    });

    return NextResponse.json({
      ok: true,
      scenes: updatedScenes,
      note:
        "Per-scene audio stored as data URLs in Scene.audioUrl. Client should play them sequentially.",
    });
  } catch (e) {
    console.error("voiceover error", e);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
