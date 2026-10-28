"use client";

import { useEffect, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Flame,
  Wand2,
  Youtube,
  CalendarDays,
  PiggyBank,
  Loader2,
  Sparkles,
  LogIn,
  LogOut,
  User,
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
  const { data: session, status } = useSession();
  const [active, setActive] = useState<TabKey>("overview");
  const [studioPreselect, setStudioPreselect] = useState<string | null>(null);
  const [studioVideoPreselect, setStudioVideoPreselect] = useState<string | null>(null);
  const [schedulePreselect, setSchedulePreselect] = useState<string | null>(
    null
  );

  // Detect YouTube OAuth callback params (at page level — works even
  // when YouTubeUpload component isn't mounted yet)
  useEffect(() => {
    if (status !== "authenticated") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("youtube_connected") === "true") {
      import("sonner").then(({ toast }) => {
        toast.success("YouTube connected successfully!");
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("youtube_error")) {
      const err = params.get("youtube_error") || "Unknown error";
      import("sonner").then(({ toast }) => {
        toast.error("YouTube connection failed: " + err, { duration: 10000 });
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [status]);

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

  // First-run auto-seed (only when logged in)
  useEffect(() => {
    if (status === "authenticated") {
      (async () => {
        try {
          await fetch("/api/seed", { method: "POST" });
        } catch {
          // silent
        }
      })();
    }
  }, [status]);

  // Show loading while checking session
  if (status === "loading") {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  // Login gate — if not authenticated, show login screen
  if (status === "unauthenticated" || !session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-black gap-8 px-4">
        <div className="text-center space-y-4">
          <div className="size-16 rounded-2xl bg-gradient-to-br from-red-500 to-amber-500 grid place-items-center mx-auto">
            <Sparkles className="size-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">
              <span className="text-gradient-warm">AutoTube</span> Studio
            </h1>
            <p className="text-muted-foreground mt-2">
              AI YouTube Channel Engine — trend-driven niche selection,
              script generation, voiceover, scene imagery, MP4 export, and
              direct YouTube upload.
            </p>
          </div>
        </div>
        <Button
          size="lg"
          className="bg-primary hover:bg-primary/90 gap-2"
          onClick={() => signIn("google")}
        >
          <LogIn className="size-5" />
          Sign in with Google
        </Button>
        <p className="text-xs text-muted-foreground max-w-md text-center">
          Your Google account is used for authentication only. We don't
          store your password — OAuth 2.0 handles everything securely.
        </p>
      </div>
    );
  }

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
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90"
              onClick={openStudio}
            >
              <Sparkles className="size-4 mr-1.5" />
              <span className="hidden sm:inline">Generate</span>
            </Button>
            {/* User avatar + logout */}
            <div className="flex items-center gap-2 pl-2 border-l border-border/40">
              {session.user?.image ? (
                <img
                  src={session.user.image}
                  alt={session.user.name ?? "User"}
                  className="size-8 rounded-full"
                />
              ) : (
                <div className="size-8 rounded-full bg-zinc-700 grid place-items-center">
                  <User className="size-4 text-zinc-300" />
                </div>
              )}
              <div className="hidden sm:block">
                <p className="text-xs font-medium leading-tight truncate max-w-[120px]">
                  {session.user?.name ?? "User"}
                </p>
                <button
                  onClick={() => signOut()}
                  className="text-[10px] text-muted-foreground hover:text-red-300 flex items-center gap-0.5"
                >
                  <LogOut className="size-3" /> Sign out
                </button>
              </div>
            </div>
          </div>
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
            preselectVideoId={studioVideoPreselect}
            clearVideoPreselect={() => setStudioVideoPreselect(null)}
            onOpenSchedule={openSchedule}
          />
        )}
        {active === "pipeline" && (
          <PipelineTab
            onOpenStudio={openStudio}
            onOpenSchedule={openSchedule}
            onEditVideo={(videoId) => {
              setStudioVideoPreselect(videoId);
              setActive("studio");
            }}
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
