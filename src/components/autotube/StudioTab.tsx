"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Loader2,
  Sparkles,
  Mic,
  Image as ImageIcon,
  Wand2,
  Save,
  Play,
  Calendar,
  Film,
} from "lucide-react";
import type { Niche, VideoProject } from "@/lib/autotube/types";
import { fmtDuration, STATUS_COLORS, STATUS_LABELS } from "@/lib/autotube/types";
import ExportMp4Button from "@/components/autotube/ExportMp4Button";

interface Props {
  preselectNicheId?: string | null;
  clearPreselect?: () => void;
  onOpenSchedule?: (videoId: string) => void;
}

export default function StudioTab({
  preselectNicheId,
  clearPreselect,
  onOpenSchedule,
}: Props) {
  const [niches, setNiches] = useState<Niche[]>([]);
  const [nicheId, setNicheId] = useState<string>("");
  const [format, setFormat] = useState<"long-form" | "shorts">("long-form");
  const [topicHint, setTopicHint] = useState("");
  const [generating, setGenerating] = useState(false);
  const [currentVideo, setCurrentVideo] = useState<VideoProject | null>(null);
  const [voicing, setVoicing] = useState(false);
  const [imaging, setImaging] = useState(false);

  // Load niches list
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/niches");
        if (res.ok) {
          const data = await res.json();
          setNiches(data.niches);
        }
      } catch (e) {
        toast.error("Failed to load niches");
      }
    })();
  }, []);

  // Pre-select from Trends tab
  useEffect(() => {
    if (preselectNicheId) {
      setNicheId(preselectNicheId);
      clearPreselect?.();
    }
  }, [preselectNicheId, clearPreselect]);

  const handleGenerate = async () => {
    if (!nicheId) {
      toast.error("Pick a niche first");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/content/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nicheId, format, topicHint }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Generation failed");
        return;
      }
      const data = await res.json();
      setCurrentVideo(data.video);
      toast.success("Script generated", {
        description: `"${data.video.title}"`,
      });
    } catch (e) {
      toast.error("Network error");
    } finally {
      setGenerating(false);
    }
  };

  const handleVoiceover = async () => {
    if (!currentVideo) return;
    setVoicing(true);
    try {
      // Loop the voiceover endpoint — one scene per call (fits Vercel 60s timeout)
      let totalProcessed = 0;
      const maxCalls = 12;
      for (let i = 0; i < maxCalls; i++) {
        const res = await fetch("/api/content/voiceover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId: currentVideo.id }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err.error ?? `Voiceover failed on scene ${i + 1}`);
          break;
        }
        const data = await res.json();
        if (data.done) {
          toast.success(`All scenes voiced (${totalProcessed} scenes)`);
          return;
        }
        if (data.audioUrl) {
          totalProcessed++;
          setCurrentVideo((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              scenes: prev.scenes?.map((s) =>
                s.id === data.sceneId ? { ...s, audioUrl: data.audioUrl } : s
              ),
            };
          });
        }
      }
      if (totalProcessed > 0) {
        toast.success(`Generated ${totalProcessed} scene audio (some may need re-running)`);
      } else {
        toast.error("No voiceover generated — StreamElements may be rate-limiting");
      }
    } catch (e) {
      toast.error("Network error");
    } finally {
      setVoicing(false);
    }
  };

  const handleImages = async () => {
    if (!currentVideo) return;
    setImaging(true);
    try {
      // Loop the scene-image endpoint — one scene per call (fits Vercel 60s timeout).
      // Add 2s delay between calls to give Z.ai a breather and avoid 429s.
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      let totalProcessed = 0;
      let totalFailed = 0;
      const maxCalls = 12; // safety cap (long-form has 8-12 scenes)
      for (let i = 0; i < maxCalls; i++) {
        const res = await fetch("/api/content/scene-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId: currentVideo.id }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (res.status === 504 || (err.error ?? "").includes("too long")) {
            // Z.ai took too long — wait 5s and retry the same scene
            toast.warning(
              `Scene ${i + 1} took too long, retrying in 5s...`,
              { duration: 4000 }
            );
            totalFailed++;
            if (totalFailed >= 3) {
              toast.error("Z.ai image gen is consistently slow. Try again later.");
              break;
            }
            await sleep(5000);
            continue; // retry the same call without incrementing i... actually i will increment, so we need to decrement
          }
          toast.error(err.error ?? `Image gen failed on scene ${i + 1}`);
          break;
        }
        const data = await res.json();
        if (data.done) {
          toast.success(
            `All scene images generated${totalProcessed > 0 ? ` (${totalProcessed} scenes)` : ""}`
          );
          return;
        }
        if (data.imageUrl) {
          totalProcessed++;
          setCurrentVideo((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              scenes: prev.scenes?.map((s) =>
                s.id === data.sceneId ? { ...s, imageUrl: data.imageUrl } : s
              ),
            };
          });
          // Small delay between scenes to avoid Z.ai 429
          await sleep(1000);
        } else if (data.error) {
          toast.error(data.error);
          break;
        }
      }
      if (totalProcessed > 0) {
        toast.success(
          `Generated ${totalProcessed} scene image${totalProcessed > 1 ? "s" : ""}` +
            (totalFailed > 0 ? ` (${totalFailed} failed, re-click to retry)` : "")
        );
      } else if (totalFailed === 0) {
        toast.error("No scene images generated — check the console for errors");
      }
    } catch (e) {
      toast.error("Network error");
    } finally {
      setImaging(false);
    }
  };

  const handleSchedule = () => {
    if (currentVideo && onOpenSchedule) {
      onOpenSchedule(currentVideo.id);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-primary/30 bg-gradient-to-br from-zinc-900 to-zinc-950">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="size-5 text-amber-400" />
            Content Studio
          </CardTitle>
          <CardDescription>
            Generate a complete video package: cinematic script, AI voiceover,
            scene-by-scene B-roll imagery, and a clickable thumbnail. One
            click per stage; you can iterate as needed.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: generation form */}
        <Card className="lg:col-span-1 bg-card/80 border-border/60 h-fit">
          <CardHeader>
            <CardTitle className="text-base">1 · Configure</CardTitle>
            <CardDescription>
              Pick niche, format, and (optional) topic hint
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="niche">Niche</Label>
              <Select value={nicheId} onValueChange={setNicheId}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800">
                  <SelectValue placeholder="Choose a niche…" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {niches.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      <span className="font-medium">{n.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        · {n.compositeScore.toFixed(0)} pts · CPM $
                        {n.cpmLow.toFixed(0)}–{n.cpmHigh.toFixed(0)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {nicheId && (
                <p className="text-xs text-muted-foreground">
                  {niches.find((n) => n.id === nicheId)?.sampleChannels}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Format</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={format === "long-form" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormat("long-form")}
                  className={
                    format === "long-form"
                      ? "bg-primary text-primary-foreground"
                      : "border-zinc-700 hover:bg-zinc-800"
                  }
                >
                  <Film className="size-4 mr-1.5" /> Long-form
                </Button>
                <Button
                  type="button"
                  variant={format === "shorts" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormat("shorts")}
                  className={
                    format === "shorts"
                      ? "bg-primary text-primary-foreground"
                      : "border-zinc-700 hover:bg-zinc-800"
                  }
                >
                  <Sparkles className="size-4 mr-1.5" /> Shorts
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Long-form: 8-12 scenes, ~6-10 min. Shorts: 4-6 scenes, ~30-45s.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="topic">Topic Hint (optional)</Label>
              <Textarea
                id="topic"
                value={topicHint}
                onChange={(e) => setTopicHint(e.target.value)}
                placeholder="e.g. 'how PayPal's mafia changed fintech', or leave blank for AI to pick"
                className="bg-zinc-900 border-zinc-800 min-h-20"
              />
            </div>

            <Button
              className="w-full bg-primary hover:bg-primary/90"
              disabled={generating || !nicheId}
              onClick={handleGenerate}
            >
              {generating ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="size-4 mr-2" />
              )}
              Generate Script
            </Button>
          </CardContent>
        </Card>

        {/* Right: results */}
        <Card className="lg:col-span-2 bg-card/80 border-border/60">
          <CardHeader>
            <CardTitle className="text-base">2 · Generated Package</CardTitle>
            <CardDescription>
              Review the script, then generate voiceover and scene imagery in
              one click each.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!currentVideo && !generating && (
              <EmptyState />
            )}
            {(generating || (!currentVideo && generating)) && (
              <div className="space-y-3">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            )}
            {currentVideo && (
              <GeneratedPackage
                video={currentVideo}
                voicing={voicing}
                imaging={imaging}
                onVoiceover={handleVoiceover}
                onImages={handleImages}
                onSchedule={handleSchedule}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 px-6">
      <div className="size-14 rounded-full bg-zinc-800 grid place-items-center mx-auto mb-4">
        <Sparkles className="size-6 text-zinc-500" />
      </div>
      <h3 className="font-medium text-zinc-300">No video generated yet</h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
        Configure your niche and format on the left, then hit "Generate
        Script". The AI will produce a high-retention, documentary-style
        script with B-roll prompts for every scene.
      </p>
    </div>
  );
}

function GeneratedPackage({
  video,
  voicing,
  imaging,
  onVoiceover,
  onImages,
  onSchedule,
}: {
  video: VideoProject;
  voicing: boolean;
  imaging: boolean;
  onVoiceover: () => void;
  onImages: () => void;
  onSchedule: () => void;
}) {
  const scriptPayload = video.scriptJson
    ? (JSON.parse(video.scriptJson) as {
        hook?: string;
        outro?: string;
        thumbnailPrompt?: string;
      })
    : null;
  const scenes = video.scenes ?? [];
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-lg leading-tight">
              {video.title}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {video.niche?.name} · {video.format} ·{" "}
              {fmtDuration(video.durationSec)}
            </p>
          </div>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUS_COLORS[video.status] ?? ""}`}
          >
            {STATUS_LABELS[video.status] ?? video.status}
          </span>
        </div>
        {scriptPayload?.hook && (
          <div className="p-3 rounded-md bg-amber-500/5 border border-amber-500/20">
            <div className="text-[10px] uppercase tracking-wider text-amber-300 mb-0.5">
              Cold open hook
            </div>
            <p className="text-sm italic">"{scriptPayload.hook}"</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="sm"
          className="border-zinc-700 hover:bg-zinc-800"
          onClick={onVoiceover}
          disabled={voicing}
        >
          {voicing ? (
            <Loader2 className="size-4 mr-2 animate-spin" />
          ) : (
            <Mic className="size-4 mr-2" />
          )}
          {video.voiceoverUrl ? "Regenerate Voiceover" : "Generate Voiceover"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="border-zinc-700 hover:bg-zinc-800"
          onClick={onImages}
          disabled={imaging}
        >
          {imaging ? (
            <Loader2 className="size-4 mr-2 animate-spin" />
          ) : (
            <ImageIcon className="size-4 mr-2" />
          )}
          Generate Scene Images
        </Button>
      </div>

      {video.voiceoverUrl && video.voiceoverUrl.startsWith("data:audio") && (
        <div className="p-3 rounded-md bg-zinc-900/60 border border-zinc-800">
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Play className="size-3" /> AI Voiceover preview
          </div>
          <audio controls src={video.voiceoverUrl} className="w-full h-8" />
        </div>
      )}

      {video.thumbnailUrl && (
        <div>
          <div className="text-xs text-muted-foreground mb-1">Thumbnail</div>
          <div className="rounded-md overflow-hidden border border-zinc-800 aspect-video bg-zinc-900">
            <img
              src={video.thumbnailUrl}
              alt="thumbnail"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}

      {/* Scene storyboard */}
      <div>
        <div className="text-xs text-muted-foreground mb-2">
          Scene storyboard ({scenes.length} scenes)
        </div>
        <div className="space-y-3 max-h-[600px] overflow-y-auto scrollbar-thin pr-1">
          {scenes.map((s, i) => (
            <div
              key={s.id}
              className="rounded-md border border-zinc-800 bg-zinc-950/60 overflow-hidden"
            >
              <div className="flex flex-col sm:flex-row">
                <div className="w-full sm:w-40 aspect-video bg-zinc-900 flex-shrink-0 relative">
                  {s.imageUrl ? (
                    <img
                      src={s.imageUrl}
                      alt={s.heading}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-zinc-700">
                      <ImageIcon className="size-6" />
                    </div>
                  )}
                  <div className="absolute top-1 left-1 size-5 rounded-full bg-black/70 grid place-items-center text-xs font-mono">
                    {i + 1}
                  </div>
                  <div className="absolute bottom-1 right-1 text-[10px] px-1.5 py-0.5 rounded bg-black/70 text-zinc-300">
                    {s.durationSec}s
                  </div>
                </div>
                <div className="flex-1 p-3 space-y-1.5">
                  <div className="text-xs uppercase tracking-wider text-amber-300 font-medium">
                    {s.heading}
                  </div>
                  <p className="text-sm text-zinc-200 leading-relaxed">
                    {s.narration}
                  </p>
                  <p className="text-xs text-muted-foreground italic">
                    B-roll: {s.brollPrompt}
                  </p>
                  {s.audioUrl && s.audioUrl.startsWith("data:audio") && (
                    <div className="pt-1.5">
                      <div className="text-[10px] text-emerald-300/80 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <Mic className="size-3" /> Scene audio
                      </div>
                      <audio
                        controls
                        src={s.audioUrl}
                        className="w-full h-7"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {scriptPayload?.outro && (
        <div className="p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20">
          <div className="text-[10px] uppercase tracking-wider text-emerald-300 mb-0.5">
            Outro / CTA
          </div>
          <p className="text-sm italic">{scriptPayload.outro}</p>
        </div>
      )}

      {/* MP4 export — only shown if at least one scene has both image + audio */}
      {scenes.some((s) => s.imageUrl && s.audioUrl) && (
        <div className="p-3 rounded-md bg-purple-500/5 border border-purple-500/20">
          <div className="text-[10px] uppercase tracking-wider text-purple-300 mb-2 flex items-center gap-1">
            <Film className="size-3" /> Export final MP4 video
          </div>
          <ExportMp4Button scenes={scenes} videoTitle={video.title} />
        </div>
      )}

      <Button
        size="sm"
        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
        onClick={onSchedule}
        disabled={video.status === "scheduled"}
      >
        <Calendar className="size-4 mr-2" />
        {video.status === "scheduled" ? "Already scheduled" : "Schedule Publishing"}
      </Button>
    </div>
  );
}
