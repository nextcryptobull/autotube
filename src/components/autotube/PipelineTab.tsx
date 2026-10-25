"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Loader2,
  Youtube,
  RefreshCw,
  Trash2,
  Calendar,
  Clock,
  Film,
} from "lucide-react";
import type { VideoProject } from "@/lib/autotube/types";
import {
  fmtDuration,
  STATUS_COLORS,
  STATUS_LABELS,
} from "@/lib/autotube/types";

const PIPELINE_STAGES = [
  "idea",
  "scripted",
  "voiced",
  "imaged",
  "scheduled",
  "published",
];

interface Props {
  onOpenStudio: () => void;
  onOpenSchedule: (videoId: string) => void;
}

export default function PipelineTab({ onOpenStudio, onOpenSchedule }: Props) {
  const [videos, setVideos] = useState<VideoProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/videos");
      if (res.ok) {
        const data = await res.json();
        setVideos(data.videos as VideoProject[]);
      } else {
        toast.error("Failed to load videos");
      }
    } catch (e) {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (id: string) => {
    setBusy(id);
    try {
      await fetch("/api/videos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      toast.success("Video removed");
      await load();
    } catch (e) {
      toast.error("Delete failed");
    } finally {
      setBusy(null);
    }
  };

  const handleSchedule = (videoId: string) => {
    onOpenSchedule(videoId);
  };

  // Group by stage
  const byStage: Record<string, VideoProject[]> = {};
  for (const stage of PIPELINE_STAGES) byStage[stage] = [];
  for (const v of videos) {
    if (byStage[v.status]) byStage[v.status].push(v);
  }

  return (
    <div className="space-y-6">
      <Card className="border-purple-500/20 bg-gradient-to-br from-purple-950/20 via-zinc-950 to-black">
        <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Youtube className="size-5 text-purple-400" />
              <h2 className="text-xl font-semibold">Production Pipeline</h2>
            </div>
            <p className="text-sm text-muted-foreground max-w-xl">
              Every video moves left-to-right through these stages. Generate
              new ones in the Studio; finished packages can be scheduled or
              marked as published.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-700 hover:bg-zinc-800"
              onClick={load}
              disabled={loading}
            >
              <RefreshCw className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={onOpenStudio}>
              New Video
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        {PIPELINE_STAGES.map((stage) => {
          const items = byStage[stage] ?? [];
          return (
            <div key={stage} className="space-y-2">
              <div className="flex items-center justify-between">
                <span
                  className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${STATUS_COLORS[stage] ?? ""}`}
                >
                  {STATUS_LABELS[stage] ?? stage}
                </span>
                <span className="text-xs text-muted-foreground">
                  {items.length}
                </span>
              </div>
              <div className="space-y-2 min-h-[120px] p-2 rounded-lg bg-zinc-950/40 border border-zinc-800/60">
                {loading && (
                  <div className="space-y-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                )}
                {!loading && items.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Empty
                  </p>
                )}
                {!loading &&
                  items.map((v) => (
                    <PipelineCard
                      key={v.id}
                      video={v}
                      onSchedule={() => handleSchedule(v.id)}
                      onDelete={() => handleDelete(v.id)}
                      busy={busy === v.id}
                    />
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PipelineCard({
  video,
  onSchedule,
  onDelete,
  busy,
}: {
  video: VideoProject;
  onSchedule: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <div
      key={video.id}
      className="rounded-md border border-zinc-800 bg-zinc-900/60 overflow-hidden hover:border-zinc-700 transition-colors"
    >
      <div className="aspect-video bg-zinc-950 relative">
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-zinc-700">
            <Film className="size-5" />
          </div>
        )}
        <div className="absolute bottom-1 right-1 text-[10px] px-1.5 py-0.5 rounded bg-black/70 text-zinc-300">
          {fmtDuration(video.durationSec)}
        </div>
      </div>
      <div className="p-2 space-y-1.5">
        <p className="text-xs font-medium line-clamp-2 leading-snug">
          {video.title}
        </p>
        <div className="flex items-center justify-between">
          <Badge
            variant="outline"
            className="text-[10px] text-zinc-400 border-zinc-700"
          >
            {video.niche?.name ?? ""}
          </Badge>
          <Badge
            variant="outline"
            className={`text-[10px] ${video.format === "shorts" ? "border-fuchsia-500/30 text-fuchsia-300" : "border-amber-500/30 text-amber-300"}`}
          >
            {video.format}
          </Badge>
        </div>
        <div className="flex gap-1">
          {(video.status === "imaged" || video.status === "assembled") && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] flex-1 text-emerald-300 hover:bg-emerald-500/10"
              onClick={onSchedule}
            >
              <Calendar className="size-3 mr-1" /> Schedule
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] px-2 text-zinc-500 hover:bg-zinc-800 hover:text-red-300"
            onClick={onDelete}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Trash2 className="size-3" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
