import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

// 100% FREE TTS via StreamElements API
// (used by Twitch streamers, no API key, no signup, no card, no rate limits)
//
// Endpoint: GET https://api.streamelements.com/kappa/v2/speech
// Query params:
//   voice = Brian (British male, perfect for documentaries)
//         / Joanna (US female) / Matthew (US male) / Russell (AU male)
//         / Amy (UK female) / Emma (UK female) / Nicole (AU female)
//         / Justin (US child) / Kendrick (US male) / Salli (US female)
//         / Joey (US male) / Kimberly (US female) / Mathieu (FR male)
//         / Maximilian (DE male) / Lucia (IT female) / Conchita (ES female)
//         / Enrique (ES male) / Carla (IT female) / Giorgio (IT male)
//   text  = URL-encoded narration (max ~500 chars per request — chunk if longer)
//
// Returns: audio/mpeg (MP3) directly
// Quality: decent — uses Amazon Polly voices under the hood
//
// We store the MP3 as a base64 data URL in Scene.audioUrl so the client
// can play it via <audio src="data:audio/mpeg;base64,..."> without any
// external storage.

const VOICE = "Brian"; // British male, documentary narrator style

// StreamElements has a ~500 char per-request limit. Chunk at sentence
// boundaries to stay safe.
function chunkText(text: string, max = 480): string[] {
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

async function fetchTts(text: string): Promise<string | null> {
  // StreamElements returns MP3 directly. We fetch, convert to base64,
  // and return as a data URL.
  const url = `https://api.streamelements.com/kappa/v2/speech?voice=${VOICE}&text=${encodeURIComponent(text)}`;
  try {
    const resp = await fetch(url, {
      headers: {
        // Mimic a real browser — StreamElements blocks bot-only user agents
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "audio/mpeg,*/*",
      },
    });
    if (!resp.ok) {
      console.error(`StreamElements TTS HTTP ${resp.status}:`, await resp.text());
      return null;
    }
    const ab = await resp.arrayBuffer();
    const b64 = Buffer.from(new Uint8Array(ab)).toString("base64");
    return `data:audio/mpeg;base64,${b64}`;
  } catch (err) {
    console.error("StreamElements TTS failed:", err);
    return null;
  }
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

    // Find the FIRST scene without audio
    const nextScene = video.scenes.find((s) => !s.audioUrl);
    if (!nextScene) {
      await db.videoProject.update({
        where: { id: videoId },
        data: { status: "voiced" },
      });
      return NextResponse.json({
        ok: true,
        done: true,
        message: "All scenes already have audio",
        scenesRemaining: 0,
      });
    }

    const chunks = chunkText(nextScene.narration);
    // Generate per-chunk audio, concatenate base64 of MP3 chunks
    // (MP3 chunks can be concatenated directly as bytes — works for playback)
    const chunkBuffers: Buffer[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const url = `https://api.streamelements.com/kappa/v2/speech?voice=${VOICE}&text=${encodeURIComponent(chunks[i])}`;
      try {
        const resp = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "audio/mpeg,*/*",
          },
        });
        if (!resp.ok) {
          return NextResponse.json(
            {
              error: `StreamElements TTS failed (HTTP ${resp.status}) on scene ${nextScene.order} chunk ${i}. Try again in a few seconds.`,
            },
            { status: 502 }
          );
        }
        const ab = await resp.arrayBuffer();
        chunkBuffers.push(Buffer.from(new Uint8Array(ab)));
      } catch (err) {
        return NextResponse.json(
          {
            error: `TTS network error on scene ${nextScene.order} chunk ${i}: ${(err as Error).message}`,
          },
          { status: 502 }
        );
      }
    }
    const combinedMp3 = Buffer.concat(chunkBuffers);
    const audioDataUrl = `data:audio/mpeg;base64,${combinedMp3.toString("base64")}`;

    await db.scene.update({
      where: { id: nextScene.id },
      data: { audioUrl: audioDataUrl },
    });
    await db.generatedAsset.create({
      data: {
        videoId,
        type: "voiceover",
        url: audioDataUrl,
        metaJson: JSON.stringify({
          sceneOrder: nextScene.order,
          voice: VOICE,
          storage: "data-url-mp3",
        }),
      },
    });

    const remainingScenes = video.scenes.filter(
      (s) => s.order > nextScene.order && !s.audioUrl
    ).length;

    if (nextScene.order === video.scenes[video.scenes.length - 1].order) {
      await db.videoProject.update({
        where: { id: videoId },
        data: { status: "voiced" },
      });
    }

    return NextResponse.json({
      ok: true,
      done: remainingScenes === 0,
      sceneId: nextScene.id,
      sceneOrder: nextScene.order,
      audioUrl: audioDataUrl,
      scenesRemaining: remainingScenes,
      voice: VOICE,
    });
  } catch (e) {
    console.error("voiceover error", e);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
