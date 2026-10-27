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

// ffmpeg.wasm 0.11.x — uses createFFmpeg + ffmpeg.run() API (no Worker,
// runs on main thread). Slower than 0.12.x but doesn't have cross-origin
// Worker issues that caused the 0.12.x version to hang forever at 0%.
//
// Loaded from CDN as a script tag. Exposes window.FFmpeg with createFFmpeg().
let ffmpegLoaderPromise: Promise<any> | null = null;

async function loadFFmpegWasm(): Promise<any> {
  if (ffmpegLoaderPromise) return ffmpegLoaderPromise;

  ffmpegLoaderPromise = (async () => {
    // Load ffmpeg 0.11.x UMD bundle from unpkg
    const scriptUrl = "https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js";

    // Wait for script to load if not already loaded
    if (!(window as any).FFmpeg) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = scriptUrl;
        script.onload = () => resolve();
        script.onerror = () =>
          reject(new Error("Failed to load ffmpeg.wasm 0.11.13 from CDN"));
        document.head.appendChild(script);
      });
    }

    const FFmpegLib = (window as any).FFmpeg;
    if (!FFmpegLib?.createFFmpeg) {
      throw new Error("FFmpeg.createFFmpeg not found after script load");
    }

    const ffmpeg = FFmpegLib.createFFmpeg({
      log: true,
      corePath: "https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js",
      // No Worker — runs on main thread (slower but no cross-origin issues)
    });

    await ffmpeg.load();
    return ffmpeg;
  })();

  return ffmpegLoaderPromise;
}

export default function ExportMp4Button({ scenes, videoTitle }: Props) {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const handleExport = async () => {
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
    setStatus("Loading ffmpeg.wasm (~25MB, cached after first use)...");

    try {
      const ffmpeg = await loadFFmpegWasm();
      toast.success("ffmpeg.wasm loaded");
      setStatus(`Fetching ${scenesWithAssets.length} scene assets...`);
      setProgress(5);

      // Step 1: Fetch all images and audio, write to ffmpeg FS
      for (let i = 0; i < scenesWithAssets.length; i++) {
        const scene = scenesWithAssets[i];
        const imgExt = getExt(scene.imageUrl!);
        const audExt = getExt(scene.audioUrl!);

        try {
          const imgBytes = await fetchAsBytes(scene.imageUrl!);
          ffmpeg.FS("writeFile", `scene-${i}.${imgExt}`, imgBytes);
        } catch (err) {
          toast.error(`Failed to fetch image for scene ${i + 1}`);
          throw err;
        }

        try {
          const audBytes = await fetchAsBytes(scene.audioUrl!);
          ffmpeg.FS("writeFile", `scene-${i}.${audExt}`, audBytes);
        } catch (err) {
          toast.error(`Failed to fetch audio for scene ${i + 1}`);
          throw err;
        }

        setProgress(5 + Math.round(((i + 1) / scenesWithAssets.length) * 25));
      }

      // Step 2: For each scene, generate a clip (image as still video + audio)
      setStatus("Rendering scene clips (this takes ~5-10s per scene)...");
      for (let i = 0; i < scenesWithAssets.length; i++) {
        const scene = scenesWithAssets[i];
        const imgExt = getExt(scene.imageUrl!);
        const audExt = getExt(scene.audioUrl!);

        // ffmpeg 0.11 uses ffmpeg.run() instead of ffmpeg.exec()
        // Command: -loop 1 -i image.png -i audio.mp3
        //   -c:v libx264 -tune stillimage -c:a aac -b:a 192k
        //   -pix_fmt yuv420p -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2"
        //   -shortest -r 30 clip-i.mp4
        await ffmpeg.run(
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
          `clip-${i}.mp4`
        );

        setProgress(
          30 + Math.round(((i + 1) / scenesWithAssets.length) * 50)
        );
        setStatus(`Rendered clip ${i + 1}/${scenesWithAssets.length}`);
      }

      // Step 3: Concatenate all clips
      setStatus("Concatenating clips into final MP4...");
      setProgress(85);
      const listContent = scenesWithAssets
        .map((_, i) => `file 'clip-${i}.mp4'`)
        .join("\n");
      ffmpeg.FS(
        "writeFile",
        "list.txt",
        new TextEncoder().encode(listContent)
      );

      await ffmpeg.run(
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        "list.txt",
        "-c",
        "copy",
        "output.mp4"
      );

      setProgress(95);

      // Step 4: Read output and create download URL
      const data = ffmpeg.FS("readFile", "output.mp4");
      const blob = new Blob([data.buffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);

      setProgress(100);
      setStatus("Done!");
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
      if (msg.includes("Failed to fetch")) {
        toast.error(
          "Network error loading ffmpeg.wasm. Check your connection and try again.",
          { duration: 8000 }
        );
      } else if (msg.includes("CORS") || msg.includes("cross-origin")) {
        toast.error(
          "CORS error fetching assets. The image URLs may not allow cross-origin fetch.",
          { duration: 8000 }
        );
      } else {
        toast.error(`MP4 export failed: ${msg.substring(0, 100)}`, {
          duration: 8000,
        });
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

      {exporting && status && (
        <div className="p-2 rounded-md bg-zinc-900/60 border border-zinc-800 text-xs text-muted-foreground">
          {status}
        </div>
      )}

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
          ~25MB ffmpeg.wasm download (cached after first use). Browser-based,
          no server. Runs on main thread — UI freezes during render.
          Expected: 1-2 min for 4-8 scene videos.
        </span>
      </p>
    </div>
  );
}
