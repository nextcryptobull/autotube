import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

// 100% FREE TTS via Google Translate's unofficial TTS endpoint
//
// Endpoint: GET https://translate.google.com/translate_tts
// Query params:
//   ie      = UTF-8
//   q       = URL-encoded text (MAX ~200 chars per request — chunk!)
//   tl      = language code (en, es, fr, de, it, ja, ko, zh-CN, ...)
//   client  = tw-ob (REQUIRED — without this, returns 404)
//   total   = (optional) total number of chunks for this TTS job
//   idx     = (optional) current chunk index
//   textlen = (optional) length of current chunk text
//
// Returns: audio/mpeg (MP3) directly
// Quality: decent — uses Google's older TTS engine, slightly robotic but
//          works fine for documentary-style narration
//
// No API key, no signup, no card, no rate limit issues from Vercel IPs.
// Tested working from sandbox → should also work from Vercel's iad1 region.
//
// We store the MP3 as a base64 data URL in Scene.audioUrl so the client
// can play it via <audio src="data:audio/mpeg;base64,..."> without any
// external storage.

// Default language for TTS — can be overridden per-request via the `voice` param.
// Google Translate TTS supports ~50 language codes, each with a distinct voice.
// Popular options for English-language channels:
//   "en"    = English (US, female)
//   "en-GB" = English (UK, male) — documentary/BBC style
//   "en-AU" = English (Australia, female)
//   "en-IN" = English (India, male)
// For other languages:
//   "de" = German, "fr" = French, "es" = Spanish, "it" = Italian,
//   "pt" = Portuguese, "ru" = Russian, "ja" = Japanese, "ko" = Korean,
//   "zh-CN" = Chinese (Simplified), "hi" = Hindi, "ar" = Arabic, "nl" = Dutch,
//   "tr" = Turkish, "pl" = Polish, "vi" = Vietnamese, "th" = Thai

const DEFAULT_LANGUAGE = "en-GB"; // British male — best for documentary narration

// Google Translate TTS has a strict ~200 char per-request limit.
// Chunk at sentence boundaries.
function chunkText(text: string, max = 190): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let buf = "";
  for (const sentence of text.match(/[^.!?]+[.!?]*/g) ?? [text]) {
    if ((buf + sentence).length > max) {
      if (buf) chunks.push(buf.trim());
      // If a single sentence is > max, hard-split it at word boundaries
      if (sentence.length > max) {
        const words = sentence.split(/\s+/);
        let line = "";
        for (const w of words) {
          if ((line + " " + w).length > max) {
            if (line) chunks.push(line.trim());
            line = w;
          } else {
            line = line ? line + " " + w : w;
          }
        }
        if (line) buf = line;
        else buf = "";
      } else {
        buf = sentence;
      }
    } else {
      buf += sentence;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

async function fetchGoogleTts(text: string, language: string): Promise<Buffer | null> {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
    text
  )}&tl=${language}&client=tw-ob`;
  try {
    const resp = await fetch(url, {
      headers: {
        // Mimic a real browser — Google blocks bot-only user agents
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "audio/mpeg,*/*;q=0.9",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://translate.google.com/",
      },
    });
    if (!resp.ok) {
      console.error(`Google TTS HTTP ${resp.status}:`, await resp.text());
      return null;
    }
    const ab = await resp.arrayBuffer();
    return Buffer.from(new Uint8Array(ab));
  } catch (err) {
    console.error("Google TTS failed:", err);
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const { videoId, voice } = await req.json();
    // voice = Google Translate TTS language code (e.g. "en", "en-GB", "de", "fr")
    // See the comment block above for the full list of supported codes.
    const language = voice || DEFAULT_LANGUAGE;
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

    // Find the FIRST scene without audio (one-scene-per-call pattern)
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

    // Chunk narration into <=190 char pieces (Google's per-request limit)
    const chunks = chunkText(nextScene.narration);
    const chunkBuffers: Buffer[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const buf = await fetchGoogleTts(chunks[i], language);
      if (!buf) {
        return NextResponse.json(
          {
            error: `Google TTS failed on scene ${nextScene.order} chunk ${i}. Try again in a few seconds.`,
          },
          { status: 502 }
        );
      }
      chunkBuffers.push(buf);
    }
    // MP3 chunks can be concatenated at byte level (MP3 supports this)
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
          provider: "google-translate-tts",
          language: LANGUAGE,
          storage: "data-url-mp3",
          chunkCount: chunks.length,
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
      provider: "google-translate-tts",
    });
  } catch (e) {
    console.error("voiceover error", e);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

