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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Calendar,
  CalendarDays,
  Clock,
  Youtube,
  RefreshCw,
} from "lucide-react";
import type { PublishingSlot, VideoProject } from "@/lib/autotube/types";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/autotube/types";

interface Props {
  preselectVideoId?: string | null;
  clearPreselect?: () => void;
}

export default function ScheduleTab({
  preselectVideoId,
  clearPreselect,
}: Props) {
  const [slots, setSlots] = useState<PublishingSlot[]>([]);
  const [videos, setVideos] = useState<VideoProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [sRes, vRes] = await Promise.all([
        fetch("/api/schedule"),
        fetch("/api/videos"),
      ]);
      if (sRes.ok) {
        const data = await sRes.json();
        setSlots(data.slots);
      }
      if (vRes.ok) {
        const data = await vRes.json();
        setVideos(data.videos);
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

  useEffect(() => {
    if (preselectVideoId) {
      setSelectedVideoId(preselectVideoId);
      // Default to tomorrow 09:00
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setScheduledDate(tomorrow.toISOString().slice(0, 10));
      setDialogOpen(true);
      clearPreselect?.();
    }
  }, [preselectVideoId, clearPreselect]);

  const eligibleVideos = videos.filter(
    (v) => v.status === "imaged" || v.status === "voiced" || v.status === "assembled"
  );

  const handleCreate = async () => {
    if (!selectedVideoId || !scheduledDate) {
      toast.error("Pick a video and date");
      return;
    }
    setSubmitting(true);
    try {
      const iso = new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString();
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: selectedVideoId, scheduledAt: iso }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Schedule failed");
        return;
      }
      toast.success("Publishing slot created");
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  // Group slots by day
  const byDay = new Map<string, PublishingSlot[]>();
  for (const s of slots) {
    const d = new Date(s.scheduledAt);
    const key = d.toISOString().slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(s);
  }
  const sortedDays = Array.from(byDay.keys()).sort();

  return (
    <div className="space-y-6">
      <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-950/30 via-zinc-950 to-black">
        <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-5 text-emerald-400" />
              <h2 className="text-xl font-semibold">Publishing Schedule</h2>
            </div>
            <p className="text-sm text-muted-foreground max-w-xl">
              Hybrid cadence: 2 long-form videos per week (Mon/Fri) + 5 Shorts
              (Tue/Wed/Thu/Sat/Sun). The "best time" defaults shown come from
              YouTube analytics norms: 9am and 3pm in your audience's
              timezone.
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
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
              onClick={() => setDialogOpen(true)}
              disabled={eligibleVideos.length === 0}
            >
              <Calendar className="size-4 mr-2" />
              Schedule Slot
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/80 border-border/60">
        <CardHeader>
          <CardTitle>Upcoming Uploads</CardTitle>
          <CardDescription>
            Grouped by day; each slot's video, niche, and platform are shown.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {loading && (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          )}
          {!loading && slots.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No publishing slots yet. Click "Schedule Slot" to add one.
            </p>
          )}
          {!loading && sortedDays.length > 0 && (
            <div className="space-y-5">
              {sortedDays.map((day) => {
                const daySlots = byDay.get(day) ?? [];
                const d = new Date(day + "T00:00:00");
                return (
                  <div key={day} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="size-4 text-emerald-400" />
                      <h4 className="text-sm font-medium">
                        {d.toLocaleDateString(undefined, {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </h4>
                      <Badge
                        variant="outline"
                        className="text-zinc-400 border-zinc-700"
                      >
                        {daySlots.length} uploads
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pl-6 border-l-2 border-zinc-800">
                      {daySlots
                        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
                        .map((s) => (
                          <div
                            key={s.id}
                            className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3 space-y-1"
                          >
                            <div className="flex items-center gap-1.5">
                              <Clock className="size-3 text-emerald-300" />
                              <span className="text-sm font-medium tabular-nums">
                                {new Date(s.scheduledAt).toLocaleTimeString(
                                  undefined,
                                  { hour: "2-digit", minute: "2-digit" }
                                )}
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[10px] ml-auto text-zinc-400 border-zinc-700"
                              >
                                {s.platform}
                              </Badge>
                            </div>
                            <p className="text-sm font-medium line-clamp-2">
                              {s.video?.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {s.video?.niche?.name} · {s.video?.format}
                            </p>
                          </div>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Youtube className="size-4 text-red-400" />
              Schedule a Publishing Slot
            </DialogTitle>
            <DialogDescription>
              Pick a video that's at least been voiced/imaged, choose a date
              and time. The video's status will move to "scheduled".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Video</label>
              <Select
                value={selectedVideoId}
                onValueChange={setSelectedVideoId}
              >
                <SelectTrigger className="bg-zinc-900 border-zinc-800">
                  <SelectValue placeholder="Pick a video…" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {(eligibleVideos.length > 0
                    ? eligibleVideos
                    : videos
                  ).map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      <span className="font-medium line-clamp-1">{v.title}</span>
                      <span className="text-xs text-muted-foreground ml-1">
                        · {v.format} · {STATUS_LABELS[v.status] ?? v.status}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {eligibleVideos.length === 0 && (
                <p className="text-xs text-amber-400">
                  No videos are ready to schedule. Generate one in the Studio
                  and add voiceover/images first.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Date</label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full h-9 rounded-md bg-zinc-900 border border-zinc-800 px-3 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Time</label>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full h-9 rounded-md bg-zinc-900 border border-zinc-800 px-3 text-sm"
                />
              </div>
            </div>
            <div className="p-3 rounded-md bg-zinc-900/60 border border-zinc-800 text-xs text-muted-foreground">
              Tip: YouTube peak engagement windows for faceless channels are
              3pm-6pm weekdays and 9am-12pm weekends in your audience's
              timezone.
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="border-zinc-700 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={submitting || !selectedVideoId || !scheduledDate}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {submitting && <Loader2 className="size-4 mr-2 animate-spin" />}
              Create Slot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
