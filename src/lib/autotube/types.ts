// Shared types used by the AutoTube Studio dashboard
export interface Niche {
  id: string;
  name: string;
  category: string;
  cpmLow: number;
  cpmHigh: number;
  shortsRpm: number;
  trendScore: number;
  competition: number;
  evergreenFactor: number;
  automationEase: number;
  monetizationSafety: number;
  compositeScore: number;
  sampleChannels: string | null;
  bestFor: string;
  _count?: { videos: number };
}

export interface Scene {
  id: string;
  order: number;
  heading: string;
  narration: string;
  brollPrompt: string;
  durationSec: number;
  imageUrl: string | null;
}

export interface VideoProject {
  id: string;
  title: string;
  hook: string | null;
  format: string;
  status: string;
  durationSec: number;
  voiceoverUrl: string | null;
  thumbnailUrl: string | null;
  scriptJson: string | null;
  niche?: Niche;
  scenes?: Scene[];
  createdAt: string;
}

export interface PublishingSlot {
  id: string;
  videoId: string;
  scheduledAt: string;
  platform: string;
  video?: VideoProject;
}

export interface MonetizationProjection {
  nicheId: string;
  nicheName: string;
  category: string;
  avgCpm: number;
  shortsRpm: number;
  longFormMonthly: number;
  shortsMonthly: number;
  blendedMonthly: number;
  projected90Day: number;
  projected1Year: number;
  bestFor: string;
  videoCount: number;
}

export interface DashboardData {
  counts: {
    niches: number;
    videos: number;
    scheduled: number;
    assets: number;
    scheduledThisWeek: number;
  };
  statusCounts: Record<string, number>;
  topNiches: Niche[];
  recentVideos: Array<{
    id: string;
    title: string;
    format: string;
    status: string;
    nicheName: string;
    durationSec: number;
    thumbnailUrl: string | null;
  }>;
  upcomingSlots: Array<{
    id: string;
    scheduledAt: string;
    videoTitle: string;
    nicheName: string;
    platform: string;
  }>;
}

export const STATUS_LABELS: Record<string, string> = {
  idea: "Idea",
  scripted: "Scripted",
  voiced: "Voiceover Ready",
  imaged: "Imaged",
  assembled: "Assembled",
  scheduled: "Scheduled",
  published: "Published",
};

export const STATUS_COLORS: Record<string, string> = {
  idea: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  scripted: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  voiced: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  imaged: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  assembled: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  scheduled: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  published: "bg-emerald-600/30 text-emerald-200 border-emerald-500/50",
};

export function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
