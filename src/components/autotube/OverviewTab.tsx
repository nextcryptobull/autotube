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
import { toast } from "sonner";
import {
  Loader2,
  TrendingUp,
  Flame,
  Target,
  DollarSign,
  Sparkles,
  Youtube,
  Calendar,
  AlertTriangle,
  Info,
} from "lucide-react";
import type { DashboardData } from "@/lib/autotube/types";
import { fmtMoney, STATUS_COLORS, STATUS_LABELS } from "@/lib/autotube/types";

interface Props {
  onOpenStudio: () => void;
  onOpenTrends: () => void;
  onOpenMoney: () => void;
}

interface MoneyData {
  totals: {
    totalExpected12mo: number;
    totalExpected24mo: number;
    totalBaseCase12moIfMonetized: number;
  };
  totalsLegacy: { monthly: number; projected90Day: number; projected1Year: number };
  riskMetrics: {
    chanceAllChannelsFail: number;
    chanceAtLeastOneMonetizes: number;
    chanceOfMatchingOptimisticCeiling: number;
    aiContentDenialRiskPerChannel: number;
    yppByMonth6: number;
    yppByMonth12: number;
    neverReachesYpp: number;
  };
  first90Days: { expectedRevenue: number; note: string };
  assumptions: { creatorShareOfCpm: number; yppThreshold: string };
}

export default function OverviewTab({ onOpenStudio, onOpenTrends, onOpenMoney }: Props) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [money, setMoney] = useState<MoneyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [dRes, mRes] = await Promise.all([
          fetch("/api/dashboard"),
          fetch("/api/monetization"),
        ]);
        if (dRes.ok) setData((await dRes.json()) as DashboardData);
        if (mRes.ok) setMoney(await mRes.json());
      } catch (e) {
        toast.error("Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin mr-2" /> Loading channel health…
      </div>
    );
  }

  // Realistic numbers from new monetization model
  const expected12mo = money?.totals?.totalExpected12mo ?? 0;
  const expectedMonthly = money?.totalsLegacy?.monthly ?? 0;
  const first90 = money?.first90Days?.expectedRevenue ?? 0;

  const kpis = [
    {
      label: "Modeled Expected Monthly",
      value: fmtMoney(expectedMonthly),
      icon: DollarSign,
      hint: "Probability-weighted · month 12 · all niches",
      tone: "warm",
    },
    {
      label: "Expected 1 Year",
      value: fmtMoney(expected12mo),
      icon: TrendingUp,
      hint: "Across all scenarios + YPP outcomes",
      tone: "emerald",
    },
    {
      label: "Videos in Pipeline",
      value: String(data.counts.videos),
      icon: Youtube,
      hint: `${data.counts.scheduled} scheduled`,
      tone: "purple",
    },
    {
      label: "Tracked Niches",
      value: String(data.counts.niches),
      icon: Target,
      hint: "Scored by trend × Creator RPM × monetization safety",
      tone: "amber",
    },
  ];

  const toneClasses: Record<string, string> = {
    warm: "from-red-500/15 to-amber-500/10 border-red-500/25",
    emerald: "from-emerald-500/15 to-teal-500/10 border-emerald-500/25",
    purple: "from-fuchsia-500/15 to-purple-500/10 border-fuchsia-500/25",
    amber: "from-amber-500/15 to-orange-500/10 border-amber-500/25",
  };

  const iconBg: Record<string, string> = {
    warm: "bg-red-500/20 text-red-300",
    emerald: "bg-emerald-500/20 text-emerald-300",
    purple: "bg-fuchsia-500/20 text-fuchsia-300",
    amber: "bg-amber-500/20 text-amber-300",
  };

  // Risk panel helper
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  return (
    <div className="space-y-8">
      {/* Hero / brand strip */}
      <Card className="border-primary/30 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black overflow-hidden">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-2">
              <Badge className="bg-red-500/15 text-red-300 border-red-500/30 hover:bg-red-500/20">
                <span className="size-2 rounded-full bg-red-400 pulse-dot inline-block mr-1.5" />
                AutoTube Studio · Live
              </Badge>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                <span className="text-gradient-warm">Automated</span> YouTube
                Channel Engine
              </h1>
              <p className="text-muted-foreground max-w-xl text-sm sm:text-base">
                Trend-driven niche selection, AI-generated scripts, voiceover,
                scene imagery, and monetization projections — all running on
                autopilot.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/90"
                onClick={onOpenStudio}
              >
                <Sparkles className="size-4 mr-2" />
                Generate New Video
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="border-zinc-700 hover:bg-zinc-800"
                onClick={onOpenTrends}
              >
                <Flame className="size-4 mr-2" />
                See Trending Niches
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card
            key={k.label}
            className={`bg-gradient-to-br ${toneClasses[k.tone]} border`}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription className="text-zinc-300">
                  {k.label}
                </CardDescription>
                <div
                  className={`size-8 rounded-full grid place-items-center ${iconBg[k.tone]}`}
                >
                  <k.icon className="size-4" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight">
                {k.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{k.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top niches */}
        <Card className="bg-card/80 border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="size-4 text-amber-400" />
              Top Niches by Composite Score
            </CardTitle>
            <CardDescription>
              Weighted: trend momentum × CPM × competition inverse × evergreen
              × automation ease
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.topNiches.map((n) => (
              <div key={n.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{n.name}</span>
                    <Badge
                      variant="outline"
                      className="text-zinc-400 border-zinc-700"
                    >
                      {n.category}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-amber-300 text-xs">
                      CPM ${n.avgCpm}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {n.compositeScore.toFixed(1)}
                    </span>
                  </div>
                </div>
                <Progress
                  value={n.compositeScore}
                  className="h-1.5 bg-zinc-800"
                />
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={onOpenTrends}
            >
              View all niches →
            </Button>
          </CardContent>
        </Card>

        {/* Production pipeline status */}
        <Card className="bg-card/80 border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Youtube className="size-4 text-red-400" />
              Production Pipeline Status
            </CardTitle>
            <CardDescription>
              Current state of all video projects
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(data.statusCounts).length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No videos in the pipeline yet. Head to Content Studio to
                generate your first one.
              </p>
            )}
            {Object.entries(data.statusCounts).map(([status, count]) => (
              <div
                key={status}
                className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/60 border border-zinc-800"
              >
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[status] ?? ""}`}
                >
                  {STATUS_LABELS[status] ?? status}
                </span>
                <span className="font-semibold tabular-nums">{count}</span>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="w-full border-zinc-700 hover:bg-zinc-800"
              onClick={onOpenStudio}
            >
              <Sparkles className="size-4 mr-2" />
              Start New Video
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent + upcoming */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card/80 border-border/60">
          <CardHeader>
            <CardTitle>Recent Videos</CardTitle>
            <CardDescription>Newest projects from the studio</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin">
            {data.recentVideos.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No videos generated yet.
              </p>
            )}
            {data.recentVideos.map((v) => (
              <div
                key={v.id}
                className="flex gap-3 items-start p-2 rounded-lg hover:bg-zinc-900/60 border border-transparent hover:border-zinc-800"
              >
                <div className="size-16 rounded-md bg-zinc-800 overflow-hidden flex-shrink-0">
                  {v.thumbnailUrl ? (
                    <img
                      src={v.thumbnailUrl}
                      alt={v.title}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="size-full grid place-items-center text-zinc-600">
                      <Youtube className="size-5" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-2">
                    {v.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {v.nicheName} · {v.format}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full border ${STATUS_COLORS[v.status] ?? ""}`}
                    >
                      {STATUS_LABELS[v.status] ?? v.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-card/80 border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="size-4 text-emerald-400" />
              Upcoming Publishing Slots
            </CardTitle>
            <CardDescription>Next 5 scheduled uploads</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin">
            {data.upcomingSlots.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No publishing slots scheduled yet.
              </p>
            )}
            {data.upcomingSlots.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/60 border border-zinc-800"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {s.videoTitle}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.nicheName} · {s.platform}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-emerald-300">
                    {new Date(s.scheduledAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(s.scheduledAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Revenue deep-link + Risk panel */}
      <Card className="border-amber-500/20 bg-gradient-to-br from-amber-950/30 via-zinc-950 to-black">
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Info className="size-4 text-amber-400" />
                First 90 days: {fmtMoney(first90)} expected revenue
              </h3>
              <p className="text-sm text-muted-foreground">
                First 90 days typically produce $0 revenue. YPP eligibility
                requires 8,000 watch hours in 365 days OR 20M Shorts views in
                90 days. After 12 months of consistent posting, expected total
                across all niches: <strong className="text-amber-300">{fmtMoney(expected12mo)}</strong>.
              </p>
            </div>
            <Button
              variant="outline"
              className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
              onClick={onOpenMoney}
            >
              Open Money Tracker →
            </Button>
          </div>

          {/* Risk panel — key probabilities */}
          {money?.riskMetrics && (
            <div className="border-t border-zinc-800/60 pt-4">
              <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1">
                <AlertTriangle className="size-3 text-red-400" />
                Risk panel — faceless AI-content channels
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <RiskStat
                  label="Chance ≥1 channel monetizes (12mo)"
                  value={pct(money.riskMetrics.chanceAtLeastOneMonetizes)}
                  tone="emerald"
                />
                <RiskStat
                  label="Chance all channels fail (12mo)"
                  value={pct(money.riskMetrics.chanceAllChannelsFail)}
                  tone="red"
                />
                <RiskStat
                  label="AI-content denial risk per channel"
                  value={pct(money.riskMetrics.aiContentDenialRiskPerChannel)}
                  tone="red"
                />
                <RiskStat
                  label="YPP reached by month 12"
                  value={pct(money.riskMetrics.yppByMonth12)}
                  tone="amber"
                />
              </div>
              <p className="text-[10px] text-muted-foreground/70 mt-3 italic border-l-2 border-amber-500/30 pl-3">
                Figures are probability-weighted expected values, not guarantees.
                Based on 2025-2026 YouTube creator benchmarks. Individual results
                vary widely; ~40% of new channels never monetize.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RiskStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "red" | "amber" | "emerald";
}) {
  const valueColor: Record<string, string> = {
    red: "text-red-300",
    amber: "text-amber-300",
    emerald: "text-emerald-300",
  };
  return (
    <div className="p-2 rounded-md bg-zinc-900/60 border border-zinc-800">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold tabular-nums mt-1 ${valueColor[tone]}`}>
        {value}
      </div>
    </div>
  );
}
