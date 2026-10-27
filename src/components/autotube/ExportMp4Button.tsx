"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Film, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import type { Scene } from "@/lib/autotube/types";

interface Props {
  scenes: Scene[];
  videoTitle: string;
}

// Helper: fetch a URL (or data: URL) and return Uint8Array
async function fetchAsBytes(url: string): Promise<Uint8Array> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Fetch failed: ${url.substring(0, 80)} → HTTP ${resp.status}`);
  }
  const ab = await resp.arrayBuffer();
  return new Uint8Array(ab);
}

// Helper: get file extension based on URL or data URL MIME type
function getExt(url: string): string {
  if (url.startsWith("data:image/png")) return "png";
  if (url.startsWith("data:image/jpeg") || url.startsWith("data:image/jpg"))
    return "jpg";
  if (url.startsWith("data:image/webp")) return "webp";
  if (url.startsWith("data:audio/mpeg") || url.startsWith("data:audio/mp3"))
    return "mp3";
  if (url.startsWith("data:audio/wav")) return "wav";
  const m = url.match(/\.(png|jpe?g|webp|mp3|wav|mp4|webm)(\?|$)/i);
  if (m) return m[1].toLowerCase();
  return "bin";
}

// Lazy-load ffmpeg.wasm from CDN via dynamic ESM imports (avoids
// Turbopack's "new Worker(new URL(...))" build error).
// We use esm.sh which serves ESM versions of any npm package, browser-ready.
// The `new Function('import(...)')` trick prevents Turbopack from trying
// to statically analyze and bundle the remote URL at build time.
let ffmpegLoaderPromise: Promise<any> | null = null;

async function loadFFmpegWasm(): Promise<any> {
  if (ffmpegLoaderPromise) return ffmpegLoaderPromise;

  ffmpegLoaderPromise = (async () => {
    // Use Function constructor to bypass Turbopack's static analysis
    // of dynamic imports. This is safe — we control the URLs.
    const remoteImport = new Function(
      "url",
      "return import(url)"
    ) as (url: string) => Promise<any>;

    // Load @ffmpeg/ffmpeg (the FFmpeg class) and @ffmpeg/util (toBlobURL helper)
    const ffmpegMod = await remoteImport(
      "https://esm.sh/@ffmpeg/ffmpeg@0.12.10"
    );
    const utilMod = await remoteImport(
      "https://esm.sh/@ffmpeg/util@0.12.2"
    );

    const { FFmpeg } = ffmpegMod;
    const { toBlobURL } = utilMod;
    if (!FFmpeg || !toBlobURL) {
      throw new Error("Failed to load ffmpeg modules from esm.sh");
    }

    const ffmpeg = new FFmpeg();

    // Load the core (single-threaded — works without SharedArrayBuffer,
    // but we still set COOP/COEP headers in next.config.ts as safety)
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
    await ffmpeg.load({
      coreURL: await toBlobURL(
        `${baseURL}/ffmpeg-core.js`,
        "text/javascript"
      ),
      wasmURL: await toBlobURL(
        `${baseURL}/ffmpeg-core.wasm`,
        "application/wasm"
      ),
    });

    return ffmpeg;
  })();

  return ffmpegLoaderPromise;
}

export default function ExportMp4Button({ scenes, videoTitle }: Props) {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const handleExport = async () => {
    // Validate we have all required assets
    const scenesWithAssets = scenes.filter((s) => s.imageUrl && s.audioUrl);
    if (scenesWithAssets.length === 0) {
      toast.error(
        "No scenes have both image and audio. Generate scene images + voiceover first."
      );
      return;
    }
    if (scenesWithAssets.length < scenes.length) {
      toast.warning(
        `Only ${scenesWithAssets.length} of ${scenes.length} scenes have both image + audio. Exporting partial video.`
      );
    }

    setExporting(true);
    setProgress(0);
    setDownloadUrl(null);

    try {
      // Load ffmpeg.wasm from CDN (cached after first use)
      toast.info("Loading ffmpeg.wasm (~30MB, cached after first use)...");
      const ffmpeg = await loadFFmpegWasm();
      ffmpeg.on("progress", ({ progress: p }: { progress: number }) => {
        setProgress(Math.round(p * 100));
      });
      toast.success("ffmpeg.wasm loaded");

      // Step 1: Fetch all images and audio, write to ffmpeg FS
      setProgress(5);
      for (let i = 0; i < scenesWithAssets.length; i++) {
        const scene = scenesWithAssets[i];
        const imgExt = getExt(scene.imageUrl!);
        const audExt = getExt(scene.audioUrl!);

        try {
          const imgBytes = await fetchAsBytes(scene.imageUrl!);
          await ffmpeg.writeFile(`scene-${i}.${imgExt}`, imgBytes);
        } catch (err) {
          toast.error(`Failed to fetch image for scene ${i + 1}`);
          throw err;
        }

        try {
          const audBytes = await fetchAsBytes(scene.audioUrl!);
          await ffmpeg.writeFile(`scene-${i}.${audExt}`, audBytes);
        } catch (err) {
          toast.error(`Failed to fetch audio for scene ${i + 1}`);
          throw err;
        }

        setProgress(5 + Math.round(((i + 1) / scenesWithAssets.length) * 30));
      }

      // Step 2: For each scene, generate a clip (image as still video + audio)
      toast.info("Rendering scene clips...");
      for (let i = 0; i < scenesWithAssets.length; i++) {
        const scene = scenesWithAssets[i];
        const imgExt = getExt(scene.imageUrl!);
        const audExt = getExt(scene.audioUrl!);

        await ffmpeg.exec([
          "-loop",
          "1",
          "-i",
          `scene-${i}.${imgExt}`,
          "-i",
          `scene-${i}.${audExt}`,
          "-c:v",
          "libx264",
          "-tune",
          "stillimage",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-pix_fmt",
          "yuv420p",
          "-vf",
          "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
          "-shortest",
          "-r",
          "30",
          `clip-${i}.mp4`,
        ]);

        setProgress(
          35 + Math.round(((i + 1) / scenesWithAssets.length) * 50)
        );
      }

      // Step 3: Concatenate all clips
      toast.info("Concatenating clips...");
      const listContent = scenesWithAssets
        .map((_, i) => `file 'clip-${i}.mp4'`)
        .join("\n");
      await ffmpeg.writeFile(
        "list.txt",
        new TextEncoder().encode(listContent)
      );

      await ffmpeg.exec([
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        "list.txt",
        "-c",
        "copy",
        "output.mp4",
      ]);

      setProgress(95);

      // Step 4: Read output and create download URL
      const data = await ffmpeg.readFile("output.mp4");
      const blob = new Blob([data], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);

      setProgress(100);
      toast.success("MP4 export complete!", {
        description: `${(blob.size / 1024 / 1024).toFixed(1)} MB · ${scenesWithAssets.length} scenes`,
      });

      // Auto-download
      const a = document.createElement("a");
      a.href = url;
      const safeTitle = videoTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      a.download = `${safeTitle || "autotube-video"}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("MP4 export failed", err);
      const msg = (err as Error).message ?? "Unknown error";
      if (msg.includes("SharedArrayBuffer") || msg.includes("COEP")) {
        toast.error(
          "ffmpeg.wasm needs COOP/COEP headers. Refresh the page and try again — headers are configured in next.config.ts.",
          { duration: 8000 }
        );
      } else if (msg.includes("Failed to fetch")) {
        toast.error(
          "Network error fetching assets. Check your connection and try again.",
          { duration: 8000 }
        );
      } else {
        toast.error(`MP4 export failed: ${msg}`, { duration: 8000 });
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        onClick={handleExport}
        disabled={exporting}
        size="sm"
        className="bg-purple-600 hover:bg-purple-500 text-white"
      >
        {exporting ? (
          <>
            <Loader2 className="size-4 mr-2 animate-spin" />
            Exporting MP4... {progress}%
          </>
        ) : (
          <>
            <Film className="size-4 mr-2" />
            Export MP4 (browser)
          </>
        )}
      </Button>

      {downloadUrl && !exporting && (
        <div className="p-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-xs">
          <div className="flex items-center gap-2 mb-1">
            <Download className="size-3 text-emerald-300" />
            <span className="text-emerald-300 font-medium">
              MP4 ready — download should start automatically
            </span>
          </div>
          <a
            href={downloadUrl}
            download={`${videoTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.mp4`}
            className="text-emerald-200 underline hover:text-emerald-100"
          >
            Re-download
          </a>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground flex items-start gap-1">
        <AlertCircle className="size-3 flex-shrink-0 mt-0.5" />
        <span>
          ~30MB ffmpeg.wasm download (cached after first use). Browser-based,
          no server. May take 1-2 minutes for 8-12 scene videos.
        </span>
      </p>
    </div>
  );
}
