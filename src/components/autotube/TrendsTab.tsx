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
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  TrendingUp,
  Trophy,
  Flame,
  BarChart3,
} from "lucide-react";
import type { Niche } from "@/lib/autotube/types";

export default function TrendsTab() {
  const [niches, setNiches] = useState<Niche[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [selected, setSelected] = useState<Niche | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/niches");
      if (res.ok) {
        const data = await res.json();
        setNiches(data.niches);
      } else {
        toast.error("Failed to load niches");
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

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/seed", { method: "POST" });
      if (res.ok) {
        toast.success("Niches seeded with 2026 trend data");
        await load();
      } else {
        toast.error("Seed failed");
      }
    } catch (e) {
      toast.error("Network error");
    } finally {
      setSeeding(false);
    }
  };

  const filtered = niches.filter((n) =>
    `${n.name} ${n.category}`.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <Card className="border-amber-500/20 bg-gradient-to-br from-amber-950/30 via-zinc-950 to-black">
        <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Flame className="size-5 text-amber-400" />
              <h2 className="text-xl font-semibold">Trend Lab</h2>
            </div>
            <p className="text-sm text-muted-foreground max-w-xl">
              Live niche intelligence — trend momentum, CPM bands, competition,
              evergreen factor and automation ease, blended into a single
              composite score. Seeded from 2026 industry benchmarks
              (OutlierKit, vidIQ, Fliki, Virvid).
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="border-zinc-700 hover:bg-zinc-800"
              onClick={handleSeed}
              disabled={seeding}
            >
              {seeding ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="size-4 mr-2" />
              )}
              Re-seed Trends
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Input
          placeholder="Filter niches by name or category…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-zinc-900 border-zinc-800"
        />
        <Badge variant="outline" className="text-zinc-400 border-zinc-700">
          {filtered.length} niches
        </Badge>
      </div>

      <Card className="bg-card/80 border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Trophy className="size-4 text-amber-400" />
            Niche Leaderboard
          </CardTitle>
          <CardDescription>
            Click any row to see the full breakdown of trend, monetization,
            and automation factors.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">#</th>
                  <th className="text-left px-4 py-2 font-medium">Niche</th>
                  <th className="text-left px-4 py-2 font-medium">Category</th>
                  <th className="text-right px-4 py-2 font-medium" title="What YouTube charges advertisers. Creator keeps ~55% for long-form.">
                    Advertiser CPM
                  </th>
                  <th className="text-right px-4 py-2 font-medium" title="Creator's actual RPM after YouTube's 45% cut. Long-form only.">
                    Creator RPM (55%)
                  </th>
                  <th className="text-right px-4 py-2 font-medium" title="Creator RPM per 1,000 Shorts views (post-cut). Realistic range: $0.04-$0.15.">
                    Shorts RPM
                  </th>
                  <th className="text-right px-4 py-2 font-medium" title="Risk of AI/reused-content denial (lower = safer).">
                    Monet. Safety
                  </th>
                  <th className="text-right px-4 py-2 font-medium">Trend</th>
                  <th className="text-right px-4 py-2 font-medium">Comp.</th>
                  <th className="text-right px-4 py-2 font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={10} className="px-4 py-8">
                      <div className="flex items-center justify-center text-muted-foreground">
                        <Loader2 className="size-4 mr-2 animate-spin" /> Loading…
                      </div>
                    </td>
                  </tr>
                )}
                {!loading &&
                  filtered.map((n, i) => (
                    <tr
                      key={n.id}
                      onClick={() => setSelected(n)}
                      className="border-b border-border/50 hover:bg-zinc-900/60 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {String(i + 1).padStart(2, "0")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{n.name}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {n.sampleChannels ?? ""}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className="text-zinc-400 border-zinc-700"
                        >
                          {n.category}
                        </Badge>
                        <div className="text-xs text-muted-foreground mt-1">
                          {n.bestFor}
                        </div>
                      </td>
                      {/* Advertiser CPM (what YouTube charges) */}
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className="text-zinc-300">
                          ${n.cpmLow.toFixed(0)}–${n.cpmHigh.toFixed(0)}
                        </span>
                      </td>
                      {/* Creator RPM (55% of advertiser CPM — what creator actually keeps) */}
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className="text-emerald-300 font-medium">
                          ${(n.cpmLow * 0.55).toFixed(2)}–
                          ${(n.cpmHigh * 0.55).toFixed(2)}
                        </span>
                      </td>
                      {/* Shorts RPM (already post-cut in seed data) */}
                      <td className="px-4 py-3 text-right tabular-nums text-xs">
                        ${n.shortsRpm.toFixed(2)}
                      </td>
                      {/* Monetization Safety — higher = safer from AI/reused denial */}
                      <td className="px-4 py-3 text-right tabular-nums">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-10 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                (n.monetizationSafety ?? 0.7) >= 0.75
                                  ? "bg-emerald-500"
                                  : (n.monetizationSafety ?? 0.7) >= 0.6
                                  ? "bg-amber-500"
                                  : "bg-red-500"
                              }`}
                              style={{ width: `${(n.monetizationSafety ?? 0.7) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs">
                            {((n.monetizationSafety ?? 0.7) * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <ScoreBar value={n.trendScore} tone="amber" />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <ScoreBar value={n.competition} tone="red" inverted />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-lg font-bold text-gradient-warm">
                          {n.compositeScore.toFixed(1)}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selected && (
        <Card className="border-primary/30 bg-gradient-to-br from-zinc-900 to-zinc-950">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="size-4 text-amber-400" />
                  {selected.name}
                </CardTitle>
                <CardDescription className="mt-1">
                  {selected.category} · {selected.bestFor} format
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-gradient-warm">
                  {selected.compositeScore.toFixed(1)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Composite score
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat
                label="Trend Momentum"
                value={selected.trendScore.toFixed(0)}
                hint="0-100 vs 90d baseline"
              />
              <Stat
                label="CPM Range"
                value={`$${selected.cpmLow.toFixed(0)}–${selected.cpmHigh.toFixed(0)}`}
                hint="Long-form per 1k views"
              />
              <Stat
                label="Shorts RPM"
                value={`$${selected.shortsRpm.toFixed(2)}`}
                hint="Per 1k Shorts views"
              />
              <Stat
                label="Competition"
                value={selected.competition.toFixed(0)}
                hint="Higher = more crowded"
              />
            </div>
            <div>
              <h4 className="text-sm font-medium mb-2">Reference Channels</h4>
              <div className="flex flex-wrap gap-2">
                {(selected.sampleChannels ?? "")
                  .split(",")
                  .map((c) => c.trim())
                  .filter(Boolean)
                  .map((c) => (
                    <Badge
                      key={c}
                      variant="outline"
                      className="text-zinc-300 border-zinc-700"
                    >
                      {c}
                    </Badge>
                  ))}
              </div>
            </div>
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90"
              onClick={() => {
                setSelected(null);
                // Switch to studio handled by parent
                const event = new CustomEvent("autotube:open-studio", {
                  detail: { nicheId: selected.id },
                });
                window.dispatchEvent(event);
              }}
            >
              <TrendingUp className="size-4 mr-2" />
              Use this niche in Studio
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ScoreBar({
  value,
  tone,
  inverted = false,
}: {
  value: number;
  tone: "amber" | "red" | "emerald" | "purple";
  inverted?: boolean;
}) {
  const display = inverted ? value : value;
  const colors: Record<string, string> = {
    amber: "bg-amber-500",
    red: "bg-red-500",
    emerald: "bg-emerald-500",
    purple: "bg-fuchsia-500",
  };
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-12 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${colors[tone]} rounded-full transition-all`}
          style={{ width: `${display}%` }}
        />
      </div>
      <span className="text-xs tabular-nums w-8 text-right">
        {display.toFixed(0)}
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>
    </div>
  );
}
