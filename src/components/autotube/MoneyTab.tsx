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
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Loader2,
  TrendingUp,
  PiggyBank,
  Target,
  AlertTriangle,
  Info,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
  ReferenceArea,
} from "recharts";
import type { Scenario } from "@/lib/autotube/projections";
import { SCENARIO_PROBABILITY } from "@/lib/autotube/projections";

interface NicheProjection {
  nicheId: string;
  nicheName: string;
  category: string;
  compositeScore: number;
  monetizationSafety: number;
  advertiserCpm: { low: number; high: number; avg: number };
  creatorRpm: { low: number; high: number; avg: number };
  shortsRpm: number;
  videoCount: number;
  scenarios: Array<{
    scenario: Scenario;
    probability: number;
    month12Views: number;
    month24Views: number;
    month12RevenueIfMonetized: number;
    month24RevenueIfMonetized: number;
    month12ExpectedMonthly: number;
    month24ExpectedMonthly: number;
    total12mo: number;
    total24mo: number;
  }>;
  expectedValue: { total12mo: number; total24mo: number };
}

interface RiskMetrics {
  chanceAllChannelsFail: number;
  chanceAtLeastOneMonetizes: number;
  chanceOfMatchingOptimisticCeiling: number;
  aiContentDenialRiskPerChannel: number;
  yppByMonth6: number;
  yppByMonth12: number;
  neverReachesYpp: number;
}

interface RampCurvePoint {
  month: number;
  pessimistic: number;
  base: number;
  optimistic: number;
  isPreMonetization: boolean;
}

interface MoneyData {
  assumptions: {
    creatorShareOfCpm: number;
    yppThreshold: string;
    yppProbability: {
      byMonth6: number;
      byMonth12: number;
      deniedMonetization: number;
      neverReachesYpp: number;
    };
    scenarioProbabilities: Record<Scenario, number>;
    sources: string[];
  };
  first90Days: {
    expectedRevenue: number;
    yppThreshold: string;
    note: string;
  };
  riskMetrics: RiskMetrics;
  rampCurve: RampCurvePoint[];
  nicheProjections: NicheProjection[];
  totals: {
    totalExpected12mo: number;
    totalExpected24mo: number;
    totalBaseCase12moIfMonetized: number;
  };
  totalsLegacy: { monthly: number; projected90Day: number; projected1Year: number };
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtMoneyRange(low: number, high: number): string {
  if (low === 0 && high === 0) return "$0";
  if (high < 1000) return `$${low.toFixed(0)}–$${high.toFixed(0)}`;
  return `${fmtMoney(low)}–${fmtMoney(high)}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export default function MoneyTab() {
  const [data, setData] = useState<MoneyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scenario, setScenario] = useState<Scenario>("base");

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
        <Loader2 className="size-5 animate-spin mr-2" /> Crunching realistic
        projections…
      </div>
    );
  }

  // Get totals for the SELECTED scenario
  const scenarioTotals = data.nicheProjections.reduce(
    (acc, p) => {
      const s = p.scenarios.find((x) => x.scenario === scenario);
      if (s) {
        acc.total12mo += s.total12mo;
        acc.total24mo += s.total24mo;
        acc.month12Expected += s.month12ExpectedMonthly;
        acc.month24Expected += s.month24ExpectedMonthly;
      }
      return acc;
    },
    { total12mo: 0, total24mo: 0, month12Expected: 0, month24Expected: 0 }
  );

  // Top niches by expected 12-month revenue (selected scenario)
  const topNiches = [...data.nicheProjections]
    .map((p) => {
      const s = p.scenarios.find((x) => x.scenario === scenario);
      return {
        name: p.nicheName,
        expected: s?.total12mo ?? 0,
        month12Monthly: s?.month12ExpectedMonthly ?? 0,
        creatorRpm: p.creatorRpm.avg,
      };
    })
    .sort((a, b) => b.expected - a.expected)
    .slice(0, 10);

  return (
    <div className="space-y-6">
      {/* === HERO === */}
      <Card className="border-amber-500/30 bg-gradient-to-br from-amber-950/30 via-zinc-950 to-black overflow-hidden">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="flex items-center gap-2">
                <PiggyBank className="size-5 text-amber-400" />
                <h2 className="text-2xl font-bold">Money Tracker</h2>
                <Badge variant="outline" className="text-amber-300 border-amber-500/30 ml-2">
                  Modeled expected value
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Realistic projections for faceless YouTube channels — built
                from 2025-2026 industry benchmarks. All figures are
                probability-weighted expected values, <strong>not guarantees</strong>.
                ~40% of new channels never monetize.
              </p>
              <p className="text-xs text-muted-foreground/80 mt-2 italic">
                Creator RPM ≈ 55% of advertiser CPM (YouTube keeps 45%). Revenue
                is $0 until YPP eligibility (~6-12 months minimum).
              </p>
            </div>
            <div className="text-right space-y-1">
              <div className="text-3xl sm:text-4xl font-bold text-amber-300 tabular-nums">
                {fmtMoney(data.totals.totalExpected12mo)}
              </div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">
                Expected total · 12 months · all niches
              </div>
              <div className="text-[10px] text-muted-foreground/70 mt-1">
                Probability-weighted across all scenarios + YPP outcomes
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* === SCENARIO TOGGLE === */}
      <Card className="bg-card/80 border-border/60">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Info className="size-4 text-amber-400" />
              <span className="text-sm font-medium">Scenario</span>
              <span className="text-xs text-muted-foreground">— pick a tier to see numbers recompute</span>
            </div>
            <div className="flex gap-2">
              {(["pessimistic", "base", "optimistic"] as Scenario[]).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={scenario === s ? "default" : "outline"}
                  onClick={() => setScenario(s)}
                  className={
                    scenario === s
                      ? "bg-primary text-primary-foreground"
                      : "border-zinc-700 hover:bg-zinc-800 capitalize"
                  }
                >
                  <span className="capitalize">{s}</span>
                  <span className="text-[10px] ml-2 opacity-70">
                    {pct(SCENARIO_PROBABILITY[s])}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* === KPI CARDS — 3 tiers === */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ScenarioKpi
          tier="Pessimistic (P10)"
          monthly={data.nicheProjections.reduce(
            (s, p) => s + (p.scenarios.find((x) => x.scenario === "pessimistic")?.month12ExpectedMonthly ?? 0),
            0
          )}
          total12mo={data.nicheProjections.reduce(
            (s, p) => s + (p.scenarios.find((x) => x.scenario === "pessimistic")?.total12mo ?? 0),
            0
          )}
          range="~$0–$200/mo for first 6 months"
          icon={Target}
          tone="red"
        />
        <ScenarioKpi
          tier="Base case (P50)"
          monthly={scenarioTotals.month12Expected}
          total12mo={scenarioTotals.total12mo}
          range="~$1K–$5K/mo by month 12, ~$8K–$15K/mo by month 24"
          icon={TrendingUp}
          tone="amber"
          highlight
        />
        <ScenarioKpi
          tier="Optimistic (P90)"
          monthly={data.nicheProjections.reduce(
            (s, p) => s + (p.scenarios.find((x) => x.scenario === "optimistic")?.month12ExpectedMonthly ?? 0),
            0
          )}
          total12mo={data.nicheProjections.reduce(
            (s, p) => s + (p.scenarios.find((x) => x.scenario === "optimistic")?.total12mo ?? 0),
            0
          )}
          range="~$15K–$50K/mo by month 24 (top 2% of channels)"
          icon={PiggyBank}
          tone="emerald"
        />
      </div>

      {/* === RISK PANEL === */}
      <Card className="border-red-500/30 bg-gradient-to-br from-red-950/30 via-zinc-950 to-black">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-red-400" />
            Risk Panel
          </CardTitle>
          <CardDescription>
            Realistic probabilities for AI-generated faceless channels.
            These are the reasons most new channels never see meaningful revenue.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <RiskStat
            label="Chance all channels fail to monetize within 12 months"
            value={pct(data.riskMetrics.chanceAllChannelsFail)}
            hint="Across all niches in your tracked list"
            tone="red"
          />
          <RiskStat
            label="Chance ≥1 channel reaches YPP within 12 months"
            value={pct(data.riskMetrics.chanceAtLeastOneMonetizes)}
            hint="At least one channel becomes monetized"
            tone="emerald"
          />
          <RiskStat
            label="AI-content monetization denial risk per channel"
            value={pct(data.riskMetrics.aiContentDenialRiskPerChannel)}
            hint="YouTube policy enforcement on AI/reused content"
            tone="red"
          />
          <RiskStat
            label="Chance of matching dashboard's optimistic ceiling"
            value={pct(data.riskMetrics.chanceOfMatchingOptimisticCeiling)}
            hint="<0.1% — top 0.1% of faceless channels"
            tone="red"
          />
          <RiskStat
            label="YPP eligibility by month 6"
            value={pct(data.riskMetrics.yppByMonth6)}
            hint="Early monetizers (top 8%)"
            tone="amber"
          />
          <RiskStat
            label="YPP eligibility by month 12"
            value={pct(data.riskMetrics.yppByMonth12)}
            hint="After 1 year of consistent posting"
            tone="amber"
          />
          <RiskStat
            label="Never reaches YPP"
            value={pct(data.riskMetrics.neverReachesYpp)}
            hint="43% of new channels stay pre-monetized forever"
            tone="red"
          />
          <RiskStat
            label="First 90 days expected revenue"
            value={fmtMoney(data.first90Days.expectedRevenue)}
            hint={data.first90Days.note}
            tone="red"
          />
        </CardContent>
      </Card>

      {/* === RAMP CURVE CHART === */}
      <Card className="bg-card/80 border-border/60">
        <CardHeader>
          <CardTitle>Channel Ramp Curve (months 0-24)</CardTitle>
          <CardDescription>
            Probability-weighted monthly views per channel. Shaded zone =
            pre-monetization period where revenue = $0.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.rampCurve} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  label={{ value: "Month", position: "insideBottom", offset: -5, fill: "#a1a1aa", fontSize: 11 }}
                />
                <YAxis
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v)}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0a0a0a",
                    border: "1px solid #27272a",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => v.toLocaleString()}
                  labelFormatter={(l) => `Month ${l}`}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {/* Pre-monetization shaded zone (months 1-5) */}
                <ReferenceArea x1={1} x2={6} y1={0} y2={7000000} fill="#ef4444" fillOpacity={0.05} />
                <Line type="monotone" dataKey="pessimistic" name="Pessimistic (60%)" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="base" name="Base (30%)" stroke="#f59e0b" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="optimistic" name="Optimistic (10%)" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground mt-3 italic">
            Shaded red zone (months 1-5): pre-monetization period. Revenue = $0
            here even if videos get views. YPP requires 8,000 watch hours or
            20M Shorts views in 90 days.
          </p>
        </CardContent>
      </Card>

      {/* === TOP NICHES BY EXPECTED REVENUE === */}
      <Card className="bg-card/80 border-border/60">
        <CardHeader>
          <CardTitle>Top niches by expected 12-month revenue — {scenario}</CardTitle>
          <CardDescription>
            Probability-weighted expected value. "Expected" means it accounts for
            the 22% chance of being monetized by month 12.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topNiches} layout="vertical" margin={{ left: 80, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis
                  type="number"
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickFormatter={(v) => fmtMoney(v)}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: "#a1a1aa", fontSize: 10 }}
                  width={150}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0a0a0a",
                    border: "1px solid #27272a",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => fmtMoney(v)}
                />
                <Bar dataKey="expected" name="Expected 12-mo revenue" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* === FULL NICHE BREAKDOWN TABLE === */}
      <Card className="bg-card/80 border-border/60">
        <CardHeader>
          <CardTitle>Full niche breakdown</CardTitle>
          <CardDescription>
            All niches with advertiser CPM, creator RPM (post-YouTube-cut), and
            expected revenue across 3 scenarios.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Niche</th>
                  <th className="text-left px-4 py-2 font-medium">Category</th>
                  <th className="text-right px-4 py-2 font-medium">Advertiser CPM</th>
                  <th className="text-right px-4 py-2 font-medium">Creator RPM (55%)</th>
                  <th className="text-right px-4 py-2 font-medium">Shorts RPM</th>
                  <th className="text-right px-4 py-2 font-medium">Monetization Safety</th>
                  <th className="text-right px-4 py-2 font-medium">Expected 12mo</th>
                  <th className="text-right px-4 py-2 font-medium">Expected 24mo</th>
                </tr>
              </thead>
              <tbody>
                {data.nicheProjections.map((p) => (
                  <tr
                    key={p.nicheId}
                    className="border-b border-border/50 hover:bg-zinc-900/60"
                  >
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        {p.nicheName}
                        {p.videoCount > 0 && (
                          <Badge variant="outline" className="text-[10px] text-zinc-400 border-zinc-700">
                            {p.videoCount} videos
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-zinc-400 border-zinc-700">
                        {p.category}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      ${p.advertiserCpm.low.toFixed(0)}–${p.advertiserCpm.high.toFixed(0)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-300">
                      ${p.creatorRpm.low.toFixed(2)}–${p.creatorRpm.high.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">
                      ${p.shortsRpm.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-12 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              p.monetizationSafety >= 0.75
                                ? "bg-emerald-500"
                                : p.monetizationSafety >= 0.6
                                ? "bg-amber-500"
                                : "bg-red-500"
                            }`}
                            style={{ width: `${p.monetizationSafety * 100}%` }}
                          />
                        </div>
                        <span className="text-xs">
                          {(p.monetizationSafety * 100).toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-amber-300">
                      {fmtMoney(p.expectedValue.total12mo)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {fmtMoney(p.expectedValue.total24mo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* === ASSUMPTIONS FOOTER === */}
      <Card className="bg-card/80 border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Info className="size-4 text-muted-foreground" />
            Assumptions & Sources
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <p>
            <strong>Creator share of CPM:</strong>{" "}
            {pct(data.assumptions.creatorShareOfCpm)} (YouTube keeps 45% for
            long-form, 55% for Shorts pooled revenue).
          </p>
          <p>
            <strong>YPP threshold:</strong> {data.assumptions.yppThreshold}
          </p>
          <p>
            <strong>YPP probability:</strong> {pct(data.assumptions.yppProbability.byMonth6)} by
            month 6, {pct(data.assumptions.yppProbability.byMonth12)} by month 12,{" "}
            {pct(data.assumptions.yppProbability.deniedMonetization)} denied,{" "}
            {pct(data.assumptions.yppProbability.neverReachesYpp)} never reach YPP.
          </p>
          <p>
            <strong>Scenario probabilities:</strong> Pessimistic{" "}
            {pct(data.assumptions.scenarioProbabilities.pessimistic)}, Base{" "}
            {pct(data.assumptions.scenarioProbabilities.base)}, Optimistic{" "}
            {pct(data.assumptions.scenarioProbabilities.optimistic)}.
          </p>
          <p>
            <strong>Sources:</strong>{" "}
            {data.assumptions.sources.join("; ")}.
          </p>
          <p className="italic mt-2 border-l-2 border-amber-500/30 pl-3">
            Figures are probability-weighted expected values, not guarantees.
            Based on 2025-2026 YouTube creator benchmarks. Individual results
            vary widely; ~40% of new channels never monetize. Top 2% of faceless
            channels exceed $50K/month.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ScenarioKpi({
  tier,
  monthly,
  total12mo,
  range,
  icon: Icon,
  tone,
  highlight = false,
}: {
  tier: string;
  monthly: number;
  total12mo: number;
  range: string;
  icon: React.ElementType;
  tone: "red" | "amber" | "emerald";
  highlight?: boolean;
}) {
  const toneClasses: Record<string, string> = {
    red: "from-red-500/15 to-red-600/5 border-red-500/30",
    amber: "from-amber-500/15 to-orange-500/10 border-amber-500/30",
    emerald: "from-emerald-500/15 to-teal-500/10 border-emerald-500/30",
  };
  const iconBg: Record<string, string> = {
    red: "bg-red-500/20 text-red-300",
    amber: "bg-amber-500/20 text-amber-300",
    emerald: "bg-emerald-500/20 text-emerald-300",
  };
  return (
    <Card className={`bg-gradient-to-br ${toneClasses[tone]} border ${highlight ? "ring-2 ring-amber-500/40" : ""}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription className="text-zinc-300">{tier}</CardDescription>
          <div className={`size-8 rounded-full grid place-items-center ${iconBg[tone]}`}>
            <Icon className="size-4" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">
          {fmtMoney(monthly)}/mo
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          at month 12 · {fmtMoney(total12mo)} total
        </div>
        <p className="text-[10px] text-muted-foreground/80 mt-2 italic">
          {range}
        </p>
      </CardContent>
    </Card>
  );
}

function RiskStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "red" | "amber" | "emerald";
}) {
  const valueColor: Record<string, string> = {
    red: "text-red-300",
    amber: "text-amber-300",
    emerald: "text-emerald-300",
  };
  return (
    <div className="p-3 rounded-md bg-zinc-900/60 border border-zinc-800">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold tabular-nums mt-1 ${valueColor[tone]}`}>
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground/80 mt-0.5">{hint}</div>
    </div>
  );
}
