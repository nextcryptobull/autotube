import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getZai } from "@/lib/zai";

export const runtime = "nodejs";
export const maxDuration = 60;

interface SceneOut {
  heading: string;
  narration: string;
  brollPrompt: string;
  durationSec: number;
}

interface ScriptPayload {
  title: string;
  hook: string;
  format: string;
  scenes: SceneOut[];
  outro: string;
  thumbnailPrompt: string;
}

const SYSTEM_PROMPT = `You are a master YouTube scriptwriter for faceless channels (AI-automated).
You produce high-retention scripts in cinematic documentary style (think MagnatesMedia / ColdFusion / MrBallen).

Rules:
- Output STRICT JSON only. No prose before or after.
- Hook (first 30s): curiosity-driven, pattern-interrupt, no clickbait lies.
- Each scene: short heading (<=5 words), narration (40-90 words, conversational, direct-to-camera voice), brollPrompt (concise visual brief for AI image gen), durationSec (6-15s).
- Long-form: 8-12 scenes total runtime ~6-10 min.
- Shorts: 4-6 scenes total runtime ~30-45s.
- No mention of "video", "you're watching", no host greetings.
- Strong cold open: start with the most dramatic fact.

JSON schema:
{
  "title": string,
  "hook": string,
  "format": "long-form" | "shorts",
  "scenes": [{ "heading": string, "narration": string, "brollPrompt": string, "durationSec": number }],
  "outro": string,
  "thumbnailPrompt": string
}`;

export async function POST(req: Request) {
  try {
    const { nicheId, format, topicHint } = await req.json();
    if (!nicheId || !format) {
      return NextResponse.json(
        { error: "nicheId and format required" },
        { status: 400 }
      );
    }
    const niche = await db.niche.findUnique({ where: { id: nicheId } });
    if (!niche) {
      return NextResponse.json({ error: "Niche not found" }, { status: 404 });
    }

    // Use the shared ZAI helper (handles Vercel env var → .z-ai-config dance)
    const zai = await getZai();

    // Pre-flight check: ensure ZAI env vars are set on Vercel.
    // Without these, the SDK silently fails and `completion.choices` is undefined.
    if (!process.env.ZAI_BASE_URL || !process.env.ZAI_API_KEY) {
      return NextResponse.json(
        {
          error:
            "Z.ai API credentials not set. Go to Vercel → Settings → Environment Variables and add ZAI_BASE_URL=https://api.z.ai/api/paas/v4 and ZAI_API_KEY=<your-key>. Get a free key at https://z.ai/model-api.",
        },
        { status: 500 }
      );
    }

    const userPrompt = `Generate a ${format} YouTube video script.
Niche: ${niche.name} (${niche.category})
Best format for this niche: ${niche.bestFor}
Reference channels: ${niche.sampleChannels ?? "various"}
Sample CPM range: $${niche.cpmLow}-$${niche.cpmHigh}
Topic hint: ${topicHint ?? "your choice, pick a viral angle"}

Return JSON only, following the schema in the system message.`;

    let completion;
    try {
      completion = await zai.chat.completions.create({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        thinking: { type: "disabled" },
        temperature: 0.85,
      });
    } catch (apiErr) {
      console.error("Z.ai API call failed", apiErr);
      return NextResponse.json(
        {
          error:
            "Z.ai API call failed: " +
            (apiErr as Error).message +
            ". Check that ZAI_API_KEY is valid at https://z.ai/manage-apikey/apikey-list.",
        },
        { status: 502 }
      );
    }

    // Defensive: Z.ai may return a non-standard shape on errors.
    if (
      !completion ||
      !completion.choices ||
      !Array.isArray(completion.choices) ||
      completion.choices.length === 0
    ) {
      console.error("Unexpected Z.ai response:", JSON.stringify(completion).substring(0, 500));
      return NextResponse.json(
        {
          error:
            "Z.ai returned an unexpected response (no choices array). Check that your API key has access to chat completions. Raw response logged to server.",
          rawResponse: JSON.stringify(completion).substring(0, 300),
        },
        { status: 502 }
      );
    }

    const raw = completion.choices[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Model did not return JSON", raw },
        { status: 502 }
      );
    }
    const parsed: ScriptPayload = JSON.parse(jsonMatch[0]);

    const totalDuration = parsed.scenes.reduce(
      (s, sc) => s + (sc.durationSec || 8),
      0
    );
    const video = await db.videoProject.create({
      data: {
        nicheId,
        title: parsed.title,
        hook: parsed.hook,
        format,
        status: "scripted",
        durationSec: totalDuration,
        scriptJson: JSON.stringify(parsed),
        scenes: {
          create: parsed.scenes.map((sc, i) => ({
            order: i,
            heading: sc.heading,
            narration: sc.narration,
            brollPrompt: sc.brollPrompt,
            durationSec: sc.durationSec,
          })),
        },
      },
      include: { scenes: true },
    });

    return NextResponse.json({ video });
  } catch (e) {
    console.error("script generation error", e);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
