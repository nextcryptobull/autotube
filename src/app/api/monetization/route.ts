import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  type Scenario,
  SCENARIO_PROBABILITY,
  YPP_PROBABILITY,
  VIEW_SPLIT,
  LONG_FORM_CREATOR_RPM,
  SHORTS_CREATOR_RPM,
  getMonthlyViews,
  getMonthlyRevenue,
  getExpectedChannelRevenue,
  getProbabilityWeightedExpected,
} from "@/lib/autotube/projections";

// Realistic monetization projections.
//
// Old model assumed creator keeps 100% of advertiser CPM and starts earning
// from day 1 → produced fantasy numbers like $1.3M/month blended.
//
// New model:
//   - Creator RPM = 55% of advertiser CPM (long-form) or pooled Shorts RPM
//   - Revenue = $0 before YPP eligibility (months 0-6 minimum)
//   - YPP probability: 8% by month 6, 22% by month 12, 78% never
//   - 3 scenarios with probability weights: Pessimistic 60%, Base 30%, Optimistic 10%
//   - Channel ramp curve interpolated across months 1-24
//   - All numbers are EXPECTED VALUES (probability-weighted), not ceilings

const CADENCE = {
  longFormVideosPerWeek: 2,
  shortsPerWeek: 5,
};

export async function GET() {
  const niches = await db.niche.findMany({
    orderBy: { compositeScore: "desc" },
    include: { _count: { select: { videos: true } } },
  });

  if (!niches.length) {
    return NextResponse.json({
      error: "No niches found. Hit POST /api/seed first.",
    }, { status: 404 });
  }

  // === Per-niche projections across all 3 scenarios ===
  const nicheProjections = niches.map((n) => {
    const perScenario = (Object.keys(SCENARIO_PROBABILITY) as Scenario[]).map(
      (scenario) => {
        // Expected 12-month revenue IF monetized (with YPP probability already factored in)
        const expected12mo = getExpectedChannelRevenue(1, 12, scenario, n.category);
        const expected24mo = getExpectedChannelRevenue(1, 24, scenario, n.category);

        // Month-12 monthly revenue (conditional on being monetized)
        // = monthly views × RPM × monetization probability
        const month12Views = getMonthlyViews(12, scenario);
        const month12LongFormViews = month12Views * VIEW_SPLIT.longForm;
        const month12ShortsViews = month12Views * VIEW_SPLIT.shorts;
        const longFormRpm = LONG_FORM_CREATOR_RPM[n.category]?.[scenario] ?? 5;
        const shortsRpm = SHORTS_CREATOR_RPM[scenario];

        const month12RevenueIfMonetized =
          (month12LongFormViews / 1000) * longFormRpm +
          (month12ShortsViews / 1000) * shortsRpm;

        // Apply probability of being monetized by month 12
        const month12Expected = month12RevenueIfMonetized * YPP_PROBABILITY.byMonth12;

        const month24Views = getMonthlyViews(24, scenario);
        const month24LongFormViews = month24Views * VIEW_SPLIT.longForm;
        const month24ShortsViews = month24Views * VIEW_SPLIT.shorts;
        const month24RevenueIfMonetized =
          (month24LongFormViews / 1000) * longFormRpm +
          (month24ShortsViews / 1000) * shortsRpm;
        // By month 24, assume slightly higher monetization probability (35%)
        const month24MonetizationProb = 0.35;
        const month24Expected = month24RevenueIfMonetized * month24MonetizationProb;

        return {
          scenario,
          probability: SCENARIO_PROBABILITY[scenario],
          month12Views,
          month24Views,
          month12RevenueIfMonetized: Math.round(month12RevenueIfMonetized),
          month24RevenueIfMonetized: Math.round(month24RevenueIfMonetized),
          month12ExpectedMonthly: Math.round(month12Expected),
          month24ExpectedMonthly: Math.round(month24Expected),
          total12mo: expected12mo,
          total24mo: expected24mo,
        };
      }
    );

    // Probability-weighted expected value (across all 3 scenarios)
    const expected12moAll = getProbabilityWeightedExpected(1, 12, n.category);
    const expected24moAll = getProbabilityWeightedExpected(1, 24, n.category);

    return {
      nicheId: n.id,
      nicheName: n.name,
      category: n.category,
      compositeScore: n.compositeScore,
      monetizationSafety: n.monetizationSafety,
      advertiserCpm: {
        low: n.cpmLow,
        high: n.cpmHigh,
        avg: Math.round((n.cpmLow + n.cpmHigh) / 2),
      },
      creatorRpm: {
        // Creator keeps ~55% of advertiser CPM
        low: Math.round(n.cpmLow * 0.55 * 100) / 100,
        high: Math.round(n.cpmHigh * 0.55 * 100) / 100,
        avg: Math.round((n.cpmLow + n.cpmHigh) / 2 * 0.55 * 100) / 100,
      },
      shortsRpm: n.shortsRpm,
      videoCount: n._count.videos,
      scenarios: perScenario,
      expectedValue: {
        total12mo: expected12moAll,
        total24mo: expected24moAll,
      },
    };
  });

  // === Aggregate projections across ALL niches ===
  const totals = {
    // Expected value (probability-weighted across scenarios AND YPP outcomes)
    // For all 15 niches combined
    totalExpected12mo: nicheProjections.reduce(
      (s, p) => s + p.expectedValue.total12mo,
      0
    ),
    totalExpected24mo: nicheProjections.reduce(
      (s, p) => s + p.expectedValue.total24mo,
      0
    ),
    // If ALL channels hit base case AND monetize — the realistic "ceiling"
    totalBaseCase12moIfMonetized: nicheProjections.reduce(
      (s, p) =>
        s +
        (p.scenarios.find((s2) => s2.scenario === "base")?.total12mo ?? 0) /
          YPP_PROBABILITY.byMonth12, // un-discount to get "if 100% monetized"
      0
    ),
  };

  // === Risk metrics ===
  const riskMetrics = {
    chanceAllChannelsFail: Math.pow(1 - YPP_PROBABILITY.byMonth12, niches.length),
    chanceAtLeastOneMonetizes: 1 - Math.pow(1 - YPP_PROBABILITY.byMonth12, niches.length),
    chanceOfMatchingOptimisticCeiling: 0.001, // <0.1% — top 0.1% of channels
    aiContentDenialRiskPerChannel: YPP_PROBABILITY.deniedMonetization,
    yppByMonth6: YPP_PROBABILITY.byMonth6,
    yppByMonth12: YPP_PROBABILITY.byMonth12,
    neverReachesYpp: YPP_PROBABILITY.neverReachesYpp,
  };

  // === First 90 days — explicit pre-monetization copy ===
  const first90Days = {
    expectedRevenue: 0, // $0 — most channels pre-monetization
    yppThreshold: "8,000 watch hours in 365d OR 20M Shorts views in 90d",
    note: "First 90 days typically produce $0 revenue. YPP eligibility requires 8,000 watch hours OR 20M Shorts views in 90 days.",
  };

  // === Monthly ramp curve for charting ===
  const rampCurve = Array.from({ length: 25 }, (_, i) => i + 1).map((month) => ({
    month,
    pessimistic: getMonthlyViews(month, "pessimistic"),
    base: getMonthlyViews(month, "base"),
    optimistic: getMonthlyViews(month, "optimistic"),
    isPreMonetization: month < 6, // months 1-5 typically $0 revenue
  }));

  return NextResponse.json({
    assumptions: {
      creatorShareOfCpm: 0.55, // YouTube keeps 45%
      yppThreshold: "8,000 watch hours in 365d OR 20M Shorts views in 90d",
      yppProbability: YPP_PROBABILITY,
      scenarioProbabilities: SCENARIO_PROBABILITY,
      viewSplit: VIEW_SPLIT,
      cadence: CADENCE,
      shortsRpmRange: "$0.04 (pess) – $0.15 (opt) per 1k views",
      longFormRpmByCategory: LONG_FORM_CREATOR_RPM,
      sources: [
        "YouTube YPP 2026 eligibility docs",
        "Satura AI 2026 RPM benchmarks",
        "OutlierKit faceless channel analysis",
        "vidIQ / Fliki / Virvid niche benchmarks",
      ],
    },
    first90Days,
    riskMetrics,
    rampCurve,
    nicheProjections,
    totals,
    // Backwards-compat fields for any code still reading old shape
    projections: nicheProjections.map((p) => ({
      nicheId: p.nicheId,
      nicheName: p.nicheName,
      category: p.category,
      avgCpm: p.advertiserCpm.avg,
      shortsRpm: p.shortsRpm,
      // Old format had blendedMonthly — replace with expected monthly at month 12 (base case)
      longFormMonthly: p.scenarios.find((s) => s.scenario === "base")?.month12ExpectedMonthly ?? 0,
      shortsMonthly: 0, // No longer tracked separately
      blendedMonthly: p.scenarios.find((s) => s.scenario === "base")?.month12ExpectedMonthly ?? 0,
      projected90Day: 0, // Realistic: $0 in first 90 days
      projected1Year: p.expectedValue.total12mo,
      bestFor: niches.find((n) => n.id === p.nicheId)?.bestFor ?? "",
      videoCount: p.videoCount,
    })),
    // Old totals shape (for OverviewTab backwards compat)
    // Use base-case month-12 monthly × niche count as the headline "modeled expected"
    totalsLegacy: {
      monthly: Math.round(
        nicheProjections.reduce(
          (s, p) =>
            s +
            (p.scenarios.find((s2) => s2.scenario === "base")
              ?.month12ExpectedMonthly ?? 0),
          0
        )
      ),
      projected90Day: 0,
      projected1Year: totals.totalExpected12mo,
    },
  });
}
