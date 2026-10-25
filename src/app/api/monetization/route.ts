import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Get monetization projections for all niches (long-form + shorts)
// for the next 30 / 90 / 365 days, based on assumed posting cadence.
export async function GET() {
  // Channel assumptions
  const CADENCE = {
    longForm: 2, // videos per week
    shorts: 5, // shorts per week
  };
  const ASSUMED_LONG_FORM_VIEWS = 8000; // per video, ramp estimate
  const ASSUMED_SHORTS_VIEWS = 45000; // per short, ramp estimate

  const niches = await db.niche.findMany({
    orderBy: { compositeScore: "desc" },
    include: { _count: { select: { videos: true } } },
  });

  const projections = niches.map((n) => {
    const avgCpm = (n.cpmLow + n.cpmHigh) / 2;
    const longFormRev =
      CADENCE.longForm * ASSUMED_LONG_FORM_VIEWS * (avgCpm / 1000) * 4; // monthly
    const shortsRev =
      CADENCE.shorts * ASSUMED_SHORTS_VIEWS * n.shortsRpm * 4; // monthly
    const blendedMonthly = longFormRev + shortsRev;
    return {
      nicheId: n.id,
      nicheName: n.name,
      category: n.category,
      avgCpm,
      shortsRpm: n.shortsRpm,
      longFormMonthly: Math.round(longFormRev),
      shortsMonthly: Math.round(shortsRev),
      blendedMonthly: Math.round(blendedMonthly),
      projected90Day: Math.round(blendedMonthly * 3),
      projected1Year: Math.round(blendedMonthly * 12),
      bestFor: n.bestFor,
      videoCount: n._count.videos,
    };
  });

  // Sorted by blended monthly revenue
  projections.sort((a, b) => b.blendedMonthly - a.blendedMonthly);

  const totalMonthly = projections.reduce(
    (s, p) => s + p.blendedMonthly,
    0
  );
  const total90Day = projections.reduce((s, p) => s + p.projected90Day, 0);
  const total1Year = projections.reduce((s, p) => s + p.projected1Year, 0);

  return NextResponse.json({
    assumptions: {
      longFormVideosPerWeek: CADENCE.longForm,
      shortsPerWeek: CADENCE.shorts,
      assumedLongFormViews: ASSUMED_LONG_FORM_VIEWS,
      assumedShortsViews: ASSUMED_SHORTS_VIEWS,
    },
    projections,
    totals: {
      monthly: Math.round(totalMonthly),
      projected90Day: Math.round(total90Day),
      projected1Year: Math.round(total1Year),
    },
  });
}
