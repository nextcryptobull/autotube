"use client";

import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Flame,
  Wand2,
  Youtube,
  CalendarDays,
  PiggyBank,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import OverviewTab from "@/components/autotube/OverviewTab";
import TrendsTab from "@/components/autotube/TrendsTab";
import StudioTab from "@/components/autotube/StudioTab";
import PipelineTab from "@/components/autotube/PipelineTab";
import ScheduleTab from "@/components/autotube/ScheduleTab";
import MoneyTab from "@/components/autotube/MoneyTab";

type TabKey =
  | "overview"
  | "trends"
  | "studio"
  | "pipeline"
  | "schedule"
  | "money";

const TABS: Array<{
  key: TabKey;
  label: string;
  icon: React.ElementType;
  description: string;
}> = [
  {
    key: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    description: "Channel health at a glance",
  },
  {
    key: "trends",
    label: "Trend Lab",
    icon: Flame,
    description: "Niche intelligence & scoring",
  },
  {
    key: "studio",
    label: "Content Studio",
    icon: Wand2,
    description: "Generate scripts, voiceover & images",
  },
  {
    key: "pipeline",
    label: "Pipeline",
    icon: Youtube,
    description: "All videos in production",
  },
  {
    key: "schedule",
    label: "Schedule",
    icon: CalendarDays,
    description: "Publishing calendar",
  },
  {
    key: "money",
    label: "Money Tracker",
    icon: PiggyBank,
    description: "Revenue projections",
  },
];

export default function Home() {
  const [active, setActive] = useState<TabKey>("overview");
  const [studioPreselect, setStudioPreselect] = useState<string | null>(null);
  const [schedulePreselect, setSchedulePreselect] = useState<string | null>(
    null
  );

  // Listen for "open studio with niche" event from Trends tab
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { nicheId: string };
      if (detail?.nicheId) {
        setStudioPreselect(detail.nicheId);
        setActive("studio");
      }
    };
    window.addEventListener("autotube:open-studio", handler);
    return () => window.removeEventListener("autotube:open-studio", handler);
  }, []);

  // First-run auto-seed
  useEffect(() => {
    (async () => {
      try {
        await fetch("/api/seed", { method: "POST" });
      } catch {
        // silent
      }
    })();
  }, []);

  const openStudio = () => setActive("studio");
  const openTrends = () => setActive("trends");
  const openMoney = () => setActive("money");
  const openSchedule = (videoId: string) => {
    setSchedulePreselect(videoId);
    setActive("schedule");
  };

  const currentTab = TABS.find((t) => t.key === active)!;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-9 rounded-lg bg-gradient-to-br from-red-500 to-amber-500 grid place-items-center flex-shrink-0">
              <Sparkles className="size-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold leading-tight truncate">
                AutoTube Studio
              </h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight truncate">
                AI YouTube channel engine
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2">
            {TABS.map((t) => {
              const Icon = t.icon;
              const isActive = active === t.key;
              return (
                <Button
                  key={t.key}
                  variant={isActive ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActive(t.key)}
                  className={
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-zinc-900"
                  }
                >
                  <Icon className="size-4 mr-1.5" />
                  {t.label}
                </Button>
              );
            })}
          </div>
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90"
            onClick={openStudio}
          >
            <Sparkles className="size-4 mr-1.5" />
            <span className="hidden sm:inline">Generate</span>
          </Button>
        </div>

        {/* Mobile tab strip */}
        <div className="md:hidden border-t border-border/40 overflow-x-auto scrollbar-thin">
          <div className="flex gap-1 px-3 py-2 min-w-max">
            {TABS.map((t) => {
              const Icon = t.icon;
              const isActive = active === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActive(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-zinc-900"
                  }`}
                >
                  <Icon className="size-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-[1600px] mx-auto w-full px-4 sm:px-6 py-6">
        <div className="mb-6 flex items-center gap-2 text-xs text-muted-foreground">
          <currentTab.icon className="size-3.5" />
          <span>{currentTab.description}</span>
        </div>
        {active === "overview" && (
          <OverviewTab
            onOpenStudio={openStudio}
            onOpenTrends={openTrends}
            onOpenMoney={openMoney}
          />
        )}
        {active === "trends" && <TrendsTab />}
        {active === "studio" && (
          <StudioTab
            preselectNicheId={studioPreselect}
            clearPreselect={() => setStudioPreselect(null)}
            onOpenSchedule={openSchedule}
          />
        )}
        {active === "pipeline" && (
          <PipelineTab
            onOpenStudio={openStudio}
            onOpenSchedule={openSchedule}
          />
        )}
        {active === "schedule" && (
          <ScheduleTab
            preselectVideoId={schedulePreselect}
            clearPreselect={() => setSchedulePreselect(null)}
          />
        )}
        {active === "money" && <MoneyTab />}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-border/60 bg-background/80">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-emerald-400 pulse-dot" />
            AutoTube Studio — trend-driven, AI-generated YouTube channels
          </div>
          <div>
            Trend data: OutlierKit · vidIQ · Fliki · Virvid 2026 benchmarks
          </div>
        </div>
      </footer>
    </div>
  );
}
