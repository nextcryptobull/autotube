"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
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
  Film,
  Pencil,
  X,
  ArrowRight,
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

// Next stage for quick "advance" button
const NEXT_STAGE: Record<string, string | null> = {
  idea: "scripted",
  scripted: "voiced",
  voiced: "imaged",
  imaged: "scheduled",
  scheduled: "published",
  published: null,
};

interface Props {
  onOpenStudio: () => void;
  onOpenSchedule: (videoId: string) => void;
  onEditVideo: (videoId: string) => void;
}

export default function PipelineTab({ onOpenStudio, onOpenSchedule, onEditVideo }: Props) {
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
    if (!confirm("Delete this video? All scenes, assets, and schedules will be removed. This cannot be undone.")) return;
    setBusy(id);
    try {
      await fetch("/api/videos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      toast.success("Video deleted");
      await load();
    } catch (e) {
      toast.error("Delete failed");
    } finally {
      setBusy(null);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    setBusy(id);
    try {
      const res = await fetch("/api/videos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });
      if (res.ok) {
        toast.success(`Moved to ${STATUS_LABELS[newStatus] ?? newStatus}`);
        await load();
      }
    } catch {
      toast.error("Status change failed");
    } finally {
      setBusy(null);
    }
  };

  const handleCancelSchedule = async (videoId: string) => {
    if (!confirm("Cancel this scheduled slot? The video will move back to 'imaged'.")) return;
    setBusy(videoId);
    try {
      // Find the slot for this video
      const sRes = await fetch("/api/schedule");
      if (sRes.ok) {
        const sData = await sRes.json();
        const slot = sData.slots?.find((s: { videoId: string; id: string }) => s.videoId === videoId);
        if (slot) {
          await fetch("/api/schedule", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: slot.id }),
          });
          toast.success("Schedule cancelled");
          await load();
        }
      }
    } catch {
      toast.error("Cancel failed");
    } finally {
      setBusy(null);
    }
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
              Click any card to edit it in the Studio. Use the arrows to move
              between stages, or delete with the trash icon.
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
                      onEdit={() => onEditVideo(v.id)}
                      onSchedule={() => onOpenSchedule(v.id)}
                      onDelete={() => handleDelete(v.id)}
                      onAdvance={() => {
                        const next = NEXT_STAGE[v.status];
                        if (next) handleStatusChange(v.id, next);
                      }}
                      onCancelSchedule={() => handleCancelSchedule(v.id)}
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
  onEdit,
  onSchedule,
  onDelete,
  onAdvance,
  onCancelSchedule,
  busy,
}: {
  video: VideoProject;
  onEdit: () => void;
  onSchedule: () => void;
  onDelete: () => void;
  onAdvance: () => void;
  onCancelSchedule: () => void;
  busy: boolean;
}) {
  const nextStage = NEXT_STAGE[video.status];
  return (
    <div
      className="rounded-md border border-zinc-800 bg-zinc-900/60 overflow-hidden hover:border-zinc-600 transition-colors group"
    >
      {/* Clickable area — opens the video in Studio for editing */}
      <div className="cursor-pointer" onClick={onEdit}>
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
          {/* Edit icon on hover */}
          <div className="absolute top-1 right-1 size-6 rounded-full bg-black/70 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Pencil className="size-3 text-amber-300" />
          </div>
        </div>
        <div className="p-2 space-y-1.5">
          <p className="text-xs font-medium line-clamp-2 leading-snug hover:text-amber-300 transition-colors">
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
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-2 pb-2 flex gap-1 items-center">
        {/* Advance to next stage */}
        {nextStage && video.status !== "scheduled" && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] flex-1 text-emerald-300 hover:bg-emerald-500/10"
            onClick={onAdvance}
            disabled={busy}
            title={`Move to ${STATUS_LABELS[nextStage] ?? nextStage}`}
          >
            <ArrowRight className="size-3 mr-1" />
            {STATUS_LABELS[nextStage]?.split(" ")[0] ?? nextStage}
          </Button>
        )}

        {/* Schedule button (for imaged/assembled) */}
        {(video.status === "imaged" || video.status === "assembled") && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] flex-1 text-emerald-300 hover:bg-emerald-500/10"
            onClick={onSchedule}
            disabled={busy}
          >
            <Calendar className="size-3 mr-1" /> Schedule
          </Button>
        )}

        {/* Cancel schedule (for scheduled videos) */}
        {video.status === "scheduled" && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] flex-1 text-amber-300 hover:bg-amber-500/10"
            onClick={onCancelSchedule}
            disabled={busy}
            title="Cancel schedule — moves back to Imaged"
          >
            <X className="size-3 mr-1" /> Cancel
          </Button>
        )}

        {/* Edit button */}
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[10px] px-2 text-zinc-500 hover:bg-zinc-800 hover:text-amber-300"
          onClick={onEdit}
          disabled={busy}
          title="Edit in Studio"
        >
          <Pencil className="size-3" />
        </Button>

        {/* Delete button */}
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[10px] px-2 text-zinc-500 hover:bg-zinc-800 hover:text-red-300"
          onClick={onDelete}
          disabled={busy}
          title="Delete video"
        >
          {busy ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Trash2 className="size-3" />
          )}
        </Button>
      </div>
    </div>
  );
}
