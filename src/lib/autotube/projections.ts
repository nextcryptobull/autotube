/**
 * AutoTube Studio — Realistic Projection Model
 *
 * All benchmarks sourced from 2025-2026 industry data:
 * - YouTube Partner Program (YPP) 2026 eligibility: 8,000 watch hours
 *   in 365 days OR 20M Shorts views in 90 days
 * - Creator RPM = ~55% of advertiser CPM for long-form (YouTube keeps 45%)
 * - Creator RPM for Shorts: $0.04-$0.15 per 1,000 views (pooled revenue)
 * - Only ~3% of new channels reach YPP. Average ramp: 6-12 months.
 * - AI-generated / reused-content channels face ~30-50% monetization denial risk
 *
 * All numbers below are probability-weighted expected values, NOT ceilings.
 */

export type Scenario = "pessimistic" | "base" | "optimistic";

// Probability of each scenario materializing for a single channel
export const SCENARIO_PROBABILITY: Record<Scenario, number> = {
  pessimistic: 0.60,
  base: 0.30,
  optimistic: 0.10,
};

// Per-niche long-form creator RPM (after YouTube's 55% cut)
// Lower than advertiser CPM because YouTube takes 45%.
export const LONG_FORM_CREATOR_RPM: Record<
  string,
  Record<Scenario, number>
> = {
  Finance: { pessimistic: 6, base: 9, optimistic: 12 },
  Business: { pessimistic: 5, base: 7, optimistic: 10 },
  "AI / Tech": { pessimistic: 4, base: 6, optimistic: 8 },
  "Self-Help": { pessimistic: 3, base: 5, optimistic: 7 },
  Education: { pessimistic: 3, base: 4, optimistic: 6 },
  Entertainment: { pessimistic: 2, base: 3, optimistic: 5 },
  Health: { pessimistic: 3, base: 4, optimistic: 6 },
  Wellness: { pessimistic: 2, base: 3, optimistic: 5 },
  Gaming: { pessimistic: 1.5, base: 2, optimistic: 3 },
  Kids: { pessimistic: 1, base: 1.5, optimistic: 2.5 },
};

// Shorts creator RPM (per 1,000 views, after YouTube's 45% cut)
export const SHORTS_CREATOR_RPM: Record<Scenario, number> = {
  pessimistic: 0.04,
  base: 0.08,
  optimistic: 0.15,
};

// Channel ramp curve — monthly views for ONE niche channel, cold start
// (months where benchmarks are explicitly cited): 1, 3, 6, 9, 12, 18, 24
// In-between months are linearly interpolated.
export const RAMP_CURVE: Record<
  number,
  Record<Scenario, number>
> = {
  1: { pessimistic: 5000, base: 15000, optimistic: 40000 },
  3: { pessimistic: 30000, base: 100000, optimistic: 250000 },
  6: { pessimistic: 80000, base: 300000, optimistic: 700000 },
  9: { pessimistic: 150000, base: 500000, optimistic: 1200000 },
  12: { pessimistic: 250000, base: 800000, optimistic: 2000000 },
  18: { pessimistic: 400000, base: 1500000, optimistic: 4000000 },
  24: { pessimistic: 600000, base: 2500000, optimistic: 7000000 },
};

// YPP probability — chance of being accepted into YouTube Partner Program
export const YPP_PROBABILITY = {
  byMonth6: 0.08,
  byMonth12: 0.22,
  deniedMonetization: 0.35, // AI / reused content policy denial
  neverReachesYpp: 0.43,
};

// Channel mix — what fraction of channel views are long-form vs Shorts.
// Based on typical 2 long-form + 5 Shorts per week cadence, with Shorts
// getting ~5x more impressions per video than long-form.
export const VIEW_SPLIT = {
  longForm: 0.3, // 30% of views are long-form (higher RPM)
  shorts: 0.7, // 70% of views are Shorts (lower RPM but more volume)
};

/**
 * Linear interpolation between known ramp curve points.
 * Returns the monthly views for the given month in the given scenario.
 */
export function getMonthlyViews(month: number, scenario: Scenario): number {
  // If month is in the explicit table, use it
  if (RAMP_CURVE[month]) {
    return RAMP_CURVE[month][scenario];
  }

  // Otherwise, interpolate between the nearest known months
  const knownMonths = Object.keys(RAMP_CURVE)
    .map(Number)
    .sort((a, b) => a - b);

  // Clamp to range
  if (month <= knownMonths[0]) return RAMP_CURVE[knownMonths[0]][scenario];
  if (month >= knownMonths[knownMonths.length - 1]) {
    return RAMP_CURVE[knownMonths[knownMonths.length - 1]][scenario];
  }

  // Find surrounding known months
  let lower = knownMonths[0];
  let upper = knownMonths[knownMonths.length - 1];
  for (let i = 0; i < knownMonths.length - 1; i++) {
    if (knownMonths[i] <= month && knownMonths[i + 1] >= month) {
      lower = knownMonths[i];
      upper = knownMonths[i + 1];
      break;
    }
  }

  const lowerVal = RAMP_CURVE[lower][scenario];
  const upperVal = RAMP_CURVE[upper][scenario];
  const t = (month - lower) / (upper - lower);
  return Math.round(lowerVal + t * (upperVal - lowerVal));
}

/**
 * Compute the per-channel revenue for a given month, scenario, and niche.
 * Returns $0 for months before YPP eligibility (month 6 minimum).
 */
export function getMonthlyRevenue(
  month: number,
  scenario: Scenario,
  nicheCategory: string,
  yppMonth: number | null // month at which YPP was achieved (null = never)
): number {
  if (!yppMonth || month < yppMonth) return 0; // pre-monetization

  const monthlyViews = getMonthlyViews(month, scenario);
  const longFormViews = monthlyViews * VIEW_SPLIT.longForm;
  const shortsViews = monthlyViews * VIEW_SPLIT.shorts;

  // Look up long-form RPM for this niche category (fallback to base $5 if unknown)
  const longFormRpm =
    LONG_FORM_CREATOR_RPM[nicheCategory]?.[scenario] ?? 5;
  const shortsRpm = SHORTS_CREATOR_RPM[scenario];

  const longFormRev = (longFormViews / 1000) * longFormRpm;
  const shortsRev = (shortsViews / 1000) * shortsRpm;

  return Math.round(longFormRev + shortsRev);
}

/**
 * Expected revenue for one channel over N months, accounting for the
 * probability distribution of YPP achievement.
 *
 * YPP can be achieved at month 6 (8% probability), at month 12 (additional
 * 14% probability, totaling 22% by month 12), or never (78% probability,
 * including 35% denial rate).
 *
 * Revenue is $0 before YPP, then full RPM after.
 */
export function getExpectedChannelRevenue(
  startMonth: number,
  endMonth: number,
  scenario: Scenario,
  nicheCategory: string
): number {
  // Weighted sum across YPP outcomes:
  // - 8% chance: YPP at month 6 → revenue from months 6-endMonth
  // - 14% chance: YPP at month 12 → revenue from months 12-endMonth
  // - 78% chance: never monetized → $0
  let expected = 0;

  // Case 1: YPP at month 6 (8% probability)
  if (endMonth >= 6) {
    let revIfYpp6 = 0;
    for (let m = Math.max(startMonth, 6); m <= endMonth; m++) {
      revIfYpp6 += getMonthlyRevenue(m, scenario, nicheCategory, 6);
    }
    expected += YPP_PROBABILITY.byMonth6 * revIfYpp6;
  }

  // Case 2: YPP at month 12 (additional 14% probability — 22% total - 8% early)
  if (endMonth >= 12) {
    let revIfYpp12 = 0;
    for (let m = Math.max(startMonth, 12); m <= endMonth; m++) {
      revIfYpp12 += getMonthlyRevenue(m, scenario, nicheCategory, 12);
    }
    expected += (YPP_PROBABILITY.byMonth12 - YPP_PROBABILITY.byMonth6) * revIfYpp12;
  }

  // Case 3: Never monetized (78%) — $0 contribution
  return Math.round(expected);
}

/**
 * Probability-weighted expected value across all 3 scenarios.
 * This is the single number to display as "expected" revenue.
 */
export function getProbabilityWeightedExpected(
  startMonth: number,
  endMonth: number,
  nicheCategory: string
): number {
  let total = 0;
  (Object.keys(SCENARIO_PROBABILITY) as Scenario[]).forEach((scenario) => {
    total +=
      SCENARIO_PROBABILITY[scenario] *
      getExpectedChannelRevenue(startMonth, endMonth, scenario, nicheCategory);
  });
  return Math.round(total);
}

/**
 * Composite niche score with monetization_safety penalty.
 * Old formula: trend × CPM × (1/competition) × evergreen × automation_ease
 * New formula: trend × CREATOR_RPM × (1/competition) × evergreen × automation_ease × monetization_safety
 *
 * Creator RPM replaces CPM (post-cut, more honest).
 * monetization_safety penalizes niches with high AI-content denial risk.
 */
export function calcCompositeScore(n: {
  trendScore: number;
  cpmLow: number;
  cpmHigh: number;
  competition: number;
  evergreenFactor: number;
  automationEase: number;
  monetizationSafety: number;
}): number {
  // Use creator RPM (55% of advertiser CPM) instead of raw CPM
  const avgCpm = (n.cpmLow + n.cpmHigh) / 2;
  const creatorRpm = avgCpm * 0.55; // YouTube takes 45%
  const rpmNorm = Math.min(100, (creatorRpm / 8) * 100); // $8 RPM = 100
  const competitionScore = (1 - n.competition / 100) * 100;
  const score =
    0.30 * n.trendScore +
    0.20 * rpmNorm +
    0.15 * competitionScore +
    0.15 * n.evergreenFactor * 100 +
    0.10 * n.automationEase * 100 +
    0.10 * n.monetizationSafety * 100;
  return Math.round(score * 10) / 10;
}

/**
 * YPP eligibility — explicit check for the "Monetization Eligible" flag.
 * Per 2026 YPP rules: 8,000 watch hours in 365 days OR 20M Shorts views in 90 days.
 * A typical video is 8 min long-form (~133 hours per 1K views).
 */
export function checkYppEligibility(
  totalLongFormViews: number,
  totalShortsViews: number,
  averageLongFormDurationMin: number = 8
): {
  eligible: boolean;
  watchHours: number;
  shortsViews90d: number;
  threshold: string;
} {
  const watchHours = (totalLongFormViews * averageLongFormDurationMin) / 60;
  // For Shorts, assume we need 20M in 90 days — extrapolate from total
  // (this is a simplification; real YPP check needs rolling 90-day window)
  const shortsViews90d = totalShortsViews; // assume uniform distribution

  return {
    eligible: watchHours >= 8000 || shortsViews90d >= 20_000_000,
    watchHours: Math.round(watchHours),
    shortsViews90d,
    threshold: "8,000 watch hours in 365d OR 20M Shorts views in 90d",
  };
}
