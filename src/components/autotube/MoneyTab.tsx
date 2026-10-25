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
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Loader2,
  DollarSign,
  TrendingUp,
  PiggyBank,
  Target,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
  PieChart,
  Pie,
} from "recharts";
import type { MonetizationProjection } from "@/lib/autotube/types";
import { fmtMoney } from "@/lib/autotube/types";

interface MoneyData {
  assumptions: {
    longFormVideosPerWeek: number;
    shortsPerWeek: number;
    assumedLongFormViews: number;
    assumedShortsViews: number;
  };
  projections: MonetizationProjection[];
  totals: {
    monthly: number;
    projected90Day: number;
    projected1Year: number;
  };
}

export default function MoneyTab() {
  const [data, setData] = useState<MoneyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/monetization");
        if (res.ok) {
          setData(await res.json());
        } else {
          toast.error("Failed to load monetization");
        }
      } catch (e) {
        toast.error("Network error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin mr-2" /> Crunching revenue
        projections…
      </div>
    );
  }

  // Chart data: top 10 by blendedMonthly
  const top = data.projections.slice(0, 10);
  const chartData = top.map((p) => ({
    name: p.nicheName.length > 22 ? p.nicheName.slice(0, 20) + "…" : p.nicheName,
    "Long-form": p.longFormMonthly,
    Shorts: p.shortsMonthly,
    total: p.blendedMonthly,
  }));

  // Pie data: category breakdown
  const categoryTotals = new Map<string, number>();
  for (const p of data.projections) {
    categoryTotals.set(
      p.category,
      (categoryTotals.get(p.category) ?? 0) + p.blendedMonthly
    );
  }
  const pieData = Array.from(categoryTotals.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const colors = [
    "#ef4444",
    "#f59e0b",
    "#10b981",
    "#a855f7",
    "#06b6d4",
    "#ec4899",
    "#84cc16",
  ];

  return (
    <div className="space-y-6">
      <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 via-zinc-950 to-black overflow-hidden">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <PiggyBank className="size-5 text-emerald-400" />
                <h2 className="text-2xl font-bold">Money Tracker</h2>
              </div>
              <p className="text-sm text-muted-foreground max-w-xl">
                Realistic projections using 2026 RPM bands and a hybrid
                cadence ({data.assumptions.longFormVideosPerWeek} long-form + {data.assumptions.shortsPerWeek} Shorts per
                week). Refreshes whenever you re-seed the Trend Lab.
              </p>
              <div className="text-xs text-muted-foreground">
                Assumes ~{data.assumptions.assumedLongFormViews.toLocaleString()}{" "}
                views per long-form video and ~{data.assumptions.assumedShortsViews.toLocaleString()} per Short.
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl sm:text-5xl font-bold text-emerald-300 tabular-nums">
                {fmtMoney(data.totals.monthly)}
              </div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">
                Projected monthly
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label="Next 30 Days"
          value={fmtMoney(data.totals.monthly)}
          hint="Per month blended"
          icon={DollarSign}
          tone="emerald"
        />
        <KpiCard
          label="Next 90 Days"
          value={fmtMoney(data.totals.projected90Day)}
          hint="Quarterly revenue"
          icon={TrendingUp}
          tone="amber"
        />
        <KpiCard
          label="Full Year"
          value={fmtMoney(data.totals.projected1Year)}
          hint="Same cadence 12 mo"
          icon={Target}
          tone="purple"
        />
      </div>

      <Card className="bg-card/80 border-border/60">
        <CardHeader>
          <CardTitle>Monthly Revenue by Niche (Top 10)</CardTitle>
          <CardDescription>
            Stacked long-form vs Shorts revenue, per niche per month
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  angle={-30}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickFormatter={(v) => fmtMoney(Number(v))}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={{
                    background: "#0a0a0a",
                    border: "1px solid #27272a",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => fmtMoney(Number(v))}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Long-form" stackId="a" fill="#f59e0b" />
                <Bar dataKey="Shorts" stackId="a" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card/80 border-border/60">
          <CardHeader>
            <CardTitle>Category Mix</CardTitle>
            <CardDescription>
              Where the projected revenue comes from, by category
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={(entry) =>
                      `${entry.name}: ${fmtMoney(Number(entry.value))}`
                    }
                    labelLine={false}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={colors[i % colors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => fmtMoney(Number(v))}
                    contentStyle={{
                      background: "#0a0a0a",
                      border: "1px solid #27272a",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/80 border-border/60">
          <CardHeader>
            <CardTitle>Top Earners — 90 Day Projection</CardTitle>
            <CardDescription>Highest blended revenue potential</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin">
            {data.projections
              .slice(0, 8)
              .map((p, i) => (
                <div
                  key={p.nicheId}
                  className="flex items-center gap-3 p-2 rounded-lg bg-zinc-900/60 border border-zinc-800"
                >
                  <div className="size-7 rounded-full grid place-items-center text-xs font-bold bg-zinc-800 text-zinc-300">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">
                        {p.nicheName}
                      </p>
                      <span className="text-sm font-semibold text-emerald-300 ml-2">
                        {fmtMoney(p.projected90Day)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Progress
                        value={
                          (p.blendedMonthly / data.totals.monthly) * 100
                        }
                        className="h-1 bg-zinc-800"
                      />
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        CPM ${p.avgCpm}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/80 border-border/60">
        <CardHeader>
          <CardTitle>Full Niche Breakdown</CardTitle>
          <CardDescription>Every tracked niche's revenue projection</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Niche</th>
                  <th className="text-left px-4 py-2 font-medium">Category</th>
                  <th className="text-right px-4 py-2 font-medium">Avg CPM</th>
                  <th className="text-right px-4 py-2 font-medium">Shorts RPM</th>
                  <th className="text-right px-4 py-2 font-medium">Long-form /mo</th>
                  <th className="text-right px-4 py-2 font-medium">Shorts /mo</th>
                  <th className="text-right px-4 py-2 font-medium">Blended /mo</th>
                  <th className="text-right px-4 py-2 font-medium">90-day</th>
                  <th className="text-right px-4 py-2 font-medium">1-year</th>
                </tr>
              </thead>
              <tbody>
                {data.projections.map((p) => (
                  <tr
                    key={p.nicheId}
                    className="border-b border-border/50 hover:bg-zinc-900/60"
                  >
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        {p.nicheName}
                        {p.videoCount > 0 && (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-zinc-400 border-zinc-700"
                          >
                            {p.videoCount} videos
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className="text-zinc-400 border-zinc-700"
                      >
                        {p.category}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-300">
                      ${p.avgCpm.toFixed(0)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">
                      ${p.shortsRpm.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      ${p.longFormMonthly.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      ${p.shortsMonthly.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-amber-300">
                      ${p.blendedMonthly.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      ${p.projected90Day.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">
                      ${p.projected1Year.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ElementType;
  tone: "emerald" | "amber" | "purple";
}) {
  const toneClasses: Record<string, string> = {
    emerald: "from-emerald-500/15 to-teal-500/10 border-emerald-500/25",
    amber: "from-amber-500/15 to-orange-500/10 border-amber-500/25",
    purple: "from-fuchsia-500/15 to-purple-500/10 border-fuchsia-500/25",
  };
  const iconBg: Record<string, string> = {
    emerald: "bg-emerald-500/20 text-emerald-300",
    amber: "bg-amber-500/20 text-amber-300",
    purple: "bg-fuchsia-500/20 text-fuchsia-300",
  };
  return (
    <Card className={`bg-gradient-to-br ${toneClasses[tone]} border`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription className="text-zinc-300">{label}</CardDescription>
          <div
            className={`size-8 rounded-full grid place-items-center ${iconBg[tone]}`}
          >
            <Icon className="size-4" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tracking-tight tabular-nums">
          {value}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      </CardContent>
    </Card>
  );
}
